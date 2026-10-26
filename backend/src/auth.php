<?php
declare(strict_types=1);
namespace Arcadia;
use PDO;

const SESSION_COOKIE = 'ARCADIASESSID';
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

function username(mixed $value): string
{
    $value = text($value, 3, 20);
    if (!preg_match('/^[a-zA-Z0-9_-]{3,20}$/D', $value)) reject(422, 'invalid_username', 'Username perlu 3–20 huruf, angka, _ atau -.');
    return $value;
}

function email(mixed $value): string
{
    $value = strtolower(text($value, 3, 120));
    if (!filter_var($value, FILTER_VALIDATE_EMAIL)) reject(422, 'invalid_email', 'Alamat email tidak valid.');
    return $value;
}

function password(mixed $value): string
{
    if (!is_string($value) || strlen($value) > 72 || !preg_match('//u', $value) || str_contains($value, "\0")
        || count(preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY)) < 8) {
        reject(422, 'invalid_password', 'Gunakan minimal delapan karakter dan maksimal72 byte UTF-8 untuk password.');
    }
    return $value;
}

function publicUser(array $row): array
{
    return ['id' => (int) $row['id'], 'username' => $row['username'], 'email' => $row['email'], 'avatar' => $row['avatar'],
        'role' => $row['role'], 'version' => (int) $row['version'], 'createdAt' => (int) $row['created_at'], 'emailVerified' => false];
}

function cookieToken(): ?string
{
    $value = $_COOKIE[SESSION_COOKIE] ?? null;
    return is_string($value) && preg_match('/^[a-f0-9]{64}$/D', $value) ? $value : null;
}

function currentUser(PDO $db): ?array
{
    $token = cookieToken();
    if ($token === null) return null;
    $row = query($db, 'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?', [hash('sha256', $token), nowMs()])->fetch();
    return $row ? publicUser($row) : null;
}

function actor(PDO $db, bool $requiredHeader = true): array
{
    $user = currentUser($db);
    if (!$user) reject(401, 'auth_required', 'Sesi belum aktif. Masuk kembali untuk menyimpan skor.');
    $expected = requestHeader('X-Arcadia-Actor');
    if (($requiredHeader || $expected !== '') && (!preg_match('/^[1-9][0-9]{0,14}$/D', $expected) || $expected !== (string) $user['id'])) {
        reject(409, 'actor_changed', 'Akun berubah. Hasil akun sebelumnya tidak dikirim dengan sesi ini.');
    }
    return $user;
}

function newSession(PDO $db, array $config, array $row): array
{
    capacity($db, 'sessions', 2000);
    $now = nowMs();
    $active = (int) query($db, 'SELECT COUNT(*) FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>?', [$row['id'], $now])->fetchColumn();
    if ($active >= 20) reject(409, 'session_capacity', 'Batas sesi aktif akun demo tercapai. Keluar dari sesi yang tidak diperlukan.');
    $token = bin2hex(random_bytes(32));
    query($db, 'INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)', [hash('sha256', $token), $row['id'], $now, $now + SESSION_LIFETIME_MS]);
    $cookie = SESSION_COOKIE . '=' . $token . '; Path=/; Max-Age=' . (int) (SESSION_LIFETIME_MS / 1000) . '; HttpOnly; SameSite=Lax';
    if (str_starts_with($config['apiOrigin'], 'https://')) $cookie .= '; Secure';
    return result(200, ['user' => publicUser($row)], ['Set-Cookie' => $cookie]);
}

function authenticate(PDO $db, array $config, string $route, array $body): array
{
    $register = $route === 'auth/register';
    fields($body, $register ? ['username', 'email', 'password'] : ['identity', 'password']);
    $identity = $register ? email($body['email']) : text($body['identity'], 1, 120);
    $secret = password($body['password']);
    $name = $register ? username($body['username']) : null;
    return withWrite($db, function () use ($db, $config, $register, $identity, $secret, $name): array {
        $limited = rate($db, $config, $register ? 'register' : 'login', strtolower($identity), $register ? 5 : 10, 15 * 60 * 1000);
        if ($limited) return $limited;
        $address = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        if ($address !== '') {
            $limited = rate($db, $config, $register ? 'register-address' : 'login-address', $address, $register ? 20 : 60, 15 * 60 * 1000);
            if ($limited) return $limited;
        }
        if ($register) {
            if (query($db, 'SELECT id FROM users WHERE username=? OR email=?', [$name, $identity])->fetch()) return result(409, ['error' => ['code' => 'account_exists', 'message' => 'Username atau email sudah dipakai.']]);
            capacity($db, 'users', 200);
            query($db, "INSERT INTO users(username,email,password_hash,role,created_at) VALUES(?,?,?,'user',?)", [$name, $identity, password_hash($secret, PASSWORD_DEFAULT), nowMs()]);
            $row = query($db, 'SELECT * FROM users WHERE id=?', [(int) $db->lastInsertId()])->fetch();
            $reply = newSession($db, $config, $row); $reply['status'] = 201; return $reply;
        }
        $row = query($db, 'SELECT * FROM users WHERE email=? OR username=? LIMIT 1', [$identity, $identity])->fetch();
        $hash = $row['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        $valid = password_verify($secret, $hash);
        if (!$row || !$valid) return result(401, ['error' => ['code' => 'invalid_credentials', 'message' => 'Email/username atau password salah.']]);
        return newSession($db, $config, $row);
    });
}

function logout(PDO $db): array
{
    return withWrite($db, function () use ($db): array {
        $user = actor($db); $token = cookieToken();
        query($db, 'UPDATE sessions SET revoked_at=? WHERE token_hash=? AND user_id=? AND revoked_at IS NULL', [nowMs(), hash('sha256', $token), $user['id']]);
        // Expiring the browser cookie here could erase a newer login whose response arrived first.
        return result(200, ['signedOut' => true, 'serverRevoked' => true, 'cookieCleared' => false]);
    });
}
