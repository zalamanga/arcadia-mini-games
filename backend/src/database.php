<?php
declare(strict_types=1);
namespace Arcadia;
use PDO;

function connect(array $config, bool $withDatabase = true): PDO
{
    $dsn = 'mysql:host=' . $config['host'] . ';port=' . $config['port'] . ($withDatabase ? ';dbname=' . $config['database'] : '') . ';charset=utf8mb4';
    return new PDO($dsn, $config['user'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_PERSISTENT => false, PDO::ATTR_TIMEOUT => 5]);
}

function query(PDO $db, string $sql, array $values = []): \PDOStatement
{
    $statement = $db->prepare($sql); $statement->execute($values); return $statement;
}

function marked(PDO $db, array $config): void
{
    $row = query($db, 'SELECT application,schema_version,state,DATABASE() AS database_name FROM arcadia_demo_meta WHERE id=1')->fetch();
    if (!$row || $row['application'] !== 'arcadia-mini-games' || (int) $row['schema_version'] !== 1 || $row['state'] !== 'ready' || $row['database_name'] !== $config['database']) {
        reject(503, 'setup_required', 'Database demo belum siap. Jalankan initializer eksplisit pada database baru.');
    }
}

function withWrite(PDO $db, callable $action): mixed
{
    $commitAttempted = false;
    try {
        if (!$db->beginTransaction()) throw new \RuntimeException('Transaction not started.');
        $guard = query($db, 'SELECT id FROM arcadia_write_guard WHERE id=1 FOR UPDATE')->fetch();
        if (!$guard) reject(503, 'setup_required', 'Penanda transaksi demo tidak tersedia.');
        $value = $action();
        $commitAttempted = true;
        if (!$db->commit()) throw new \RuntimeException('Commit not acknowledged.');
        return $value;
    } catch (\Throwable $error) {
        if ($commitAttempted) throw new HttpError(503, 'outcome_unknown', 'Hasil penyimpanan belum pasti. Periksa operasi yang sama sebelum mencoba lagi.', true);
        try {
            if (!$db->inTransaction() || !$db->rollBack() || $db->inTransaction()) {
                throw new \RuntimeException('Rollback not confirmed.');
            }
        }
        catch (\Throwable) { throw new HttpError(503, 'outcome_unknown', 'Pembatalan belum dapat dipastikan. Periksa operasi yang sama.', true); }
        throw $error;
    }
}

function capacity(PDO $db, string $table, int $limit, int $additional = 1): void
{
    $allowed = ['users', 'sessions', 'scores', 'game_sessions', 'operation_receipts', 'rate_limits'];
    if (!in_array($table, $allowed, true) || $additional < 0 || $additional > 20000) throw new \LogicException('Unknown demo resource.');
    $count = (int) query($db, 'SELECT COUNT(*) FROM ' . $table)->fetchColumn();
    if ($count + $additional > $limit) reject(409, 'capacity_full', 'Kapasitas demo penuh. Riwayat lama tidak dihapus otomatis.');
}

function rate(PDO $db, array $config, string $action, string $subject, int $maximum, int $windowMs): ?array
{
    $key = hash_hmac('sha256', $action . ':' . $subject, $config['rateKey']); $now = nowMs();
    $row = query($db, 'SELECT window_start,hits FROM rate_limits WHERE bucket_key=? FOR UPDATE', [$key])->fetch();
    if (!$row) {
        capacity($db, 'rate_limits', 2000);
        query($db, 'INSERT INTO rate_limits(bucket_key,window_start,hits) VALUES(?,?,1)', [$key, $now]); return null;
    }
    if ((int) $row['window_start'] + $windowMs <= $now) {
        query($db, 'UPDATE rate_limits SET window_start=?,hits=1 WHERE bucket_key=?', [$now, $key]); return null;
    }
    if ((int) $row['hits'] >= $maximum) {
        $seconds = max(1, (int) ceil(((int) $row['window_start'] + $windowMs - $now) / 1000));
        return result(429, ['error' => ['code' => 'rate_limited', 'message' => 'Terlalu banyak percobaan. Tunggu sebelum mencoba lagi.']], ['Retry-After' => (string) $seconds]);
    }
    query($db, 'UPDATE rate_limits SET hits=hits+1 WHERE bucket_key=?', [$key]); return null;
}
