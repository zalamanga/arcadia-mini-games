<?php
declare(strict_types=1);
namespace Arcadia\Tests;
require_once __DIR__ . '/../src/bootstrap.php';
use Arcadia\HttpError;
use PDO;
use PDOStatement;

function check(bool $value): void { if (!$value) throw new \RuntimeException('Native assertion failed.'); }
function uuid(): string { $bytes = random_bytes(16); $bytes[6] = chr((ord($bytes[6]) & 15) | 64); $bytes[8] = chr((ord($bytes[8]) & 63) | 128); $hex = bin2hex($bytes); return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20); }

final class Client
{
    public ?int $actorId = null;
    public ?string $token = null;
    public function __construct(private array $config) {}
    public function request(string $route, string $method = 'GET', ?array $body = null, ?string $key = null, ?string $origin = null, ?int $actor = null): array
    {
        $headers = ['Accept: application/json'];
        if ($this->token !== null) $headers[] = 'Cookie: ARCADIASESSID=' . $this->token;
        if (($actor ?? $this->actorId) !== null) $headers[] = 'X-Arcadia-Actor: ' . ($actor ?? $this->actorId);
        if ($method !== 'GET') { $headers[] = 'Origin: ' . ($origin ?? $this->config['frontendOrigin']); $headers[] = 'X-Arcadia-Intent: mutate-v1'; $headers[] = 'Content-Type: application/json'; }
        if ($key !== null) $headers[] = 'X-Arcadia-Operation: ' . $key;
        $url = $this->config['apiOrigin'] . '/index.php?route=' . rawurlencode($route);
        if ($route === 'operations') $url .= '&operationKey=' . rawurlencode($key ?? '');
        $options = ['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'ignore_errors' => true, 'follow_location' => 0, 'timeout' => 15]];
        if ($body !== null) $options['http']['content'] = json_encode($body === [] ? (object) [] : $body, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
        $raw = @file_get_contents($url, false, stream_context_create($options), 0, 1048577);
        if ($raw === false || strlen($raw) > 1048576) throw new \RuntimeException('Native HTTP response unavailable.');
        $responseHeaders = $http_response_header ?? [];
        if (!preg_match('/^HTTP\/\S+ ([0-9]{3})/', $responseHeaders[0] ?? '', $match)) throw new \RuntimeException('Native HTTP status unavailable.');
        $noStore = false;
        foreach ($responseHeaders as $line) {
            if (strtolower($line) === 'cache-control: no-store') $noStore = true;
            if (preg_match('/^Set-Cookie: ARCADIASESSID=([a-f0-9]{64});/i', $line, $cookie)) $this->token = $cookie[1];
        }
        check($noStore);
        $value = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
        check(is_array($value)); return ['status' => (int) $match[1], 'value' => $value];
    }
}

final class FaultPDO extends PDO
{
    public string $fault = '';
    public bool $committed = false;
    public function commit(): bool { $result = parent::commit(); $this->committed = true; if ($this->fault === 'ack') throw new \RuntimeException('Controlled ACK fault.'); return $result; }
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        if (($this->fault === 'session-insert' && str_starts_with($query, 'INSERT INTO game_sessions')) || ($this->fault === 'postcommit-read' && $this->committed)) throw new \RuntimeException('Controlled query fault.');
        return parent::prepare($query, $options);
    }
}

if (PHP_SAPI !== 'cli' || getenv('ARCADIA_NATIVE_TESTS') !== 'true') { fwrite(STDERR, "Refused: explicit isolated native test flag required.\n"); exit(1); }
$db = null;
try {
    $config = \Arcadia\config();
    check(preg_match('/^arcadia_demo_qa_[a-z0-9_]{1,32}$/D', $config['database']) === 1);
    check(getenv('ARCADIA_TEST_CONFIRM_DATABASE') === $config['database']);
    $db = \Arcadia\connect($config); \Arcadia\marked($db, $config);
    check((int) \Arcadia\query($db, "SELECT COUNT(*) FROM users WHERE email NOT LIKE '%@example.test'")->fetchColumn() === 0);
    $client = new Client($config); $nonce = bin2hex(random_bytes(4));
    $name = 'qa_native_' . $nonce; $email = $name . '@example.test'; $password = 'QA-' . bin2hex(random_bytes(16));
    $checks = [];
    $run = function (string $label, callable $action) use (&$checks): void { $action(); $checks[] = $label; };
    $run('ordinary-registration-never-promotes-admin', function () use ($client, $name, $email, $password): void {
        $reply = $client->request('auth/register', 'POST', ['username' => $name, 'email' => $email, 'password' => $password]);
        check($reply['status'] === 201 && $reply['value']['user']['role'] === 'user' && $client->token !== null);
        $client->actorId = $reply['value']['user']['id'];
    });
    $run('wrong-origin-and-captured-actor-have-no-score-effects', function () use ($client, $db): void {
        $body = ['gameId' => 'snake', 'score' => 100, 'duration' => 10, 'result' => 'complete'];
        $before = (int) \Arcadia\query($db, 'SELECT COUNT(*) FROM scores WHERE user_id=?', [$client->actorId])->fetchColumn();
        check($client->request('scores', 'POST', $body, uuid(), 'http://127.0.0.1:65534')['status'] === 403);
        check($client->request('scores', 'POST', $body, uuid(), null, $client->actorId + 1000)['status'] === 409);
        check((int) \Arcadia\query($db, 'SELECT COUNT(*) FROM scores WHERE user_id=?', [$client->actorId])->fetchColumn() === $before);
    });
    $run('score-replay-and-changed-intent-are-one-atomic-run', function () use ($client, $db): void {
        $body = ['gameId' => 'snake', 'score' => 1200, 'duration' => 1000, 'result' => 'complete']; $key = uuid();
        $first = $client->request('scores', 'POST', $body, $key); $again = $client->request('scores', 'POST', $body, $key);
        check($first['status'] === 201 && $again['status'] === 201 && $again['value']['replayed'] === true);
        check($client->request('scores', 'POST', [...$body, 'score' => 1200.0, 'duration' => 1000.0], $key)['value']['replayed'] === true);
        check($first['value']['score']['id'] === $again['value']['score']['id']);
        check($client->request('scores', 'POST', [...$body, 'score' => 1201], $key)['status'] === 409);
        check((int) \Arcadia\query($db, 'SELECT COUNT(*) FROM game_sessions WHERE user_id=?', [$client->actorId])->fetchColumn() === 1);
        check((int) \Arcadia\query($db, 'SELECT COUNT(*) FROM user_achievements WHERE user_id=?', [$client->actorId])->fetchColumn() === 2);
        $receipt = $client->request('operations', 'GET', null, $key);
        check($receipt['status'] === 200 && $receipt['value']['found'] === true && $receipt['value']['action'] === 'score.submit');
    });
    $run('profile-version-replay-and-stale-edit-preserve-newer-state', function () use ($client, $name): void {
        $body = ['username' => $name, 'avatar' => 'P2', 'expectedVersion' => 1]; $key = uuid();
        check($client->request('profile', 'PATCH', $body, $key)['status'] === 200);
        check($client->request('profile', 'PATCH', $body, $key)['value']['replayed'] === true);
        check($client->request('profile', 'PATCH', [...$body, 'avatar' => 'P1'], uuid())['status'] === 409);
        $profile = $client->request('profile'); check($profile['value']['user']['avatar'] === 'P2' && $profile['value']['user']['version'] === 2);
    });
    $fault = function (string $mode) use ($config): FaultPDO {
        $pdo = new FaultPDO('mysql:host=' . $config['host'] . ';port=' . $config['port'] . ';dbname=' . $config['database'] . ';charset=utf8mb4', $config['user'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_PERSISTENT => false]);
        $pdo->fault = $mode; return $pdo;
    };
    $_COOKIE[\Arcadia\SESSION_COOKIE] = $client->token; $_SERVER['HTTP_X_ARCADIA_ACTOR'] = (string) $client->actorId;
    $run('actual-transaction-rollback-removes-score-history-receipt-together', function () use ($client, $config, $db, $fault): void {
        $before = (int) \Arcadia\query($db, 'SELECT COUNT(*) FROM scores WHERE user_id=?', [$client->actorId])->fetchColumn(); $key = uuid(); $pdo = $fault('session-insert');
        try { \Arcadia\saveScore($pdo, $config, ['gameId' => 'pong', 'score' => 250, 'duration' => 1000, 'result' => 'loss'], $key); throw new \LogicException('Expected fault.'); }
        catch (\RuntimeException $error) { check(!$error instanceof HttpError); }
        $pdo = null;
        check((int) \Arcadia\query($db, 'SELECT COUNT(*) FROM scores WHERE user_id=?', [$client->actorId])->fetchColumn() === $before);
        check($client->request('operations', 'GET', null, $key)['value']['found'] === false);
    });
    $run('actual-committed-ACK-loss-reconciles-and-replays-one-score', function () use ($client, $config, $db, $fault): void {
        $body = ['gameId' => 'pong', 'score' => 500, 'duration' => 2000, 'result' => 'loss']; $key = uuid(); $pdo = $fault('ack');
        $before = (int) \Arcadia\query($db, 'SELECT COUNT(*) FROM scores WHERE user_id=?', [$client->actorId])->fetchColumn();
        try { \Arcadia\saveScore($pdo, $config, $body, $key); throw new \LogicException('Expected unknown.'); }
        catch (HttpError $error) { check($error->outcomeUnknown); }
        $pdo = null;
        check($client->request('operations', 'GET', null, $key)['value']['found'] === true);
        check($client->request('scores', 'POST', $body, $key)['value']['replayed'] === true);
        check((int) \Arcadia\query($db, 'SELECT COUNT(*) FROM scores WHERE user_id=?', [$client->actorId])->fetchColumn() === $before + 1);
    });
    $run('known-save-needs-no-postcommit-leaderboard-query', function () use ($config, $fault): void {
        $pdo = $fault('postcommit-read');
        $reply = \Arcadia\saveScore($pdo, $config, ['gameId' => 'breakout', 'score' => 100, 'duration' => 2000, 'result' => 'loss'], uuid());
        check($reply['status'] === 201 && !array_key_exists('leaderboard', $reply['body'])); $pdo = null;
    });
    $run('profile-history-achievements-and-both-leaderboards-remain-real-reads', function () use ($client): void {
        $profile = $client->request('profile'); check($profile['value']['stats']['sessions'] === 3 && count($profile['value']['history']) === 3);
        check(count($client->request('games')['value']['games']) === 13);
        check(count($client->request('achievements')['value']['achievements']) === 6);
        check(count($client->request('leaderboard/snake')['value']['leaderboard']) > 0);
        check(count($client->request('leaderboard')['value']['leaderboard']) > 0);
        check($client->request('admin/stats')['status'] === 403);
    });
    $run('logout-revokes-presented-token-without-cookie-expiry-race', function () use ($client): void {
        $reply = $client->request('auth/logout', 'POST', []); check($reply['status'] === 200 && $reply['value']['serverRevoked'] === true && $reply['value']['cookieCleared'] === false);
        check($client->request('auth/me')['value']['user'] === null);
    });
    $db = null;
    echo '1..' . count($checks) . "\n";
    foreach ($checks as $index => $label) echo 'ok ' . ($index + 1) . ' - ' . $label . "\n";
    echo "# Synthetic fixture retained for inspection; root owns namespace/server cleanup. No browser or concurrent-HTTP claim.\n";
} catch (\Throwable) {
    $db = null; fwrite(STDERR, "not ok - isolated native fixture not confirmed; retained partial state requires inspection. No raw response or secret logged.\n"); exit(1);
}
