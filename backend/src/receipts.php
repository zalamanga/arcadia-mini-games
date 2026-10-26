<?php
declare(strict_types=1);
namespace Arcadia;
use PDO;

function decodeReceipt(array $row, int $actorId): array
{
    try {
        if (!is_string($row['response_json']) || strlen($row['response_json']) > 8192 || !is_string($row['intent_hash']) || !preg_match('/^[a-f0-9]{64}$/D', $row['intent_hash'])) throw new \RuntimeException();
        $response = json_decode($row['response_json'], true, 16, JSON_THROW_ON_ERROR);
        if (!is_array($response) || ($response['actorId'] ?? null) !== $actorId) throw new \RuntimeException();
        if ($row['action'] === 'score.submit' && (int) $row['status'] === 201) {
            fields($response, ['actorId', 'score', 'unlocked']);
            if (!is_array($response['score']) || !is_array($response['unlocked']) || !array_is_list($response['unlocked']) || count($response['unlocked']) > 6) throw new \RuntimeException();
            fields($response['score'], ['id', 'gameId', 'score', 'duration', 'result', 'createdAt']);
            whole($response['score']['id'], 1, 9007199254740991); whole($response['score']['createdAt'], 1, 9007199254740991);
            scoreIntent(array_intersect_key($response['score'], array_flip(['gameId', 'score', 'duration', 'result'])));
            $known = array_column(achievements(), 'id');
            if (count(array_unique($response['unlocked'], SORT_REGULAR)) !== count($response['unlocked'])) throw new \RuntimeException();
            foreach ($response['unlocked'] as $id) if (!is_string($id) || !in_array($id, $known, true)) throw new \RuntimeException();
        } elseif ($row['action'] === 'profile.update' && (int) $row['status'] === 200) {
            fields($response, ['actorId', 'profileVersion']); whole($response['profileVersion'], 1, 9007199254740991);
        } else throw new \RuntimeException();
    } catch (\Throwable) { reject(503, 'receipt_invalid', 'Catatan operasi tersimpan tidak cocok. Data asli tetap disimpan.'); }
    return ['action' => $row['action'], 'intentHash' => $row['intent_hash'], 'status' => (int) $row['status'], 'response' => $response];
}

function readReceipt(PDO $db, int $actorId, string $key): ?array
{
    $row = query($db, 'SELECT action,intent_hash,status,response_json FROM operation_receipts WHERE user_id=? AND operation_key=?', [$actorId, $key])->fetch();
    return $row ? decodeReceipt($row, $actorId) : null;
}

function protectedOperation(PDO $db, array $config, string $action, string $key, array $intent, callable $mutate): array
{
    return withWrite($db, function () use ($db, $config, $action, $key, $intent, $mutate): array {
        $user = actor($db);
        $hash = intentHash($action, $user['id'], $intent);
        $prior = readReceipt($db, $user['id'], $key);
        if ($prior) {
            if ($prior['action'] !== $action || !hash_equals($prior['intentHash'], $hash)) reject(409, 'intent_changed', 'Kunci ini sudah dipakai untuk isi operasi yang berbeda.');
            return result($prior['status'], [...$prior['response'], 'operationKey' => $key, 'replayed' => true]);
        }
        $limited = rate($db, $config, $action, (string) $user['id'], $action === 'score.submit' ? 30 : 15, 60000);
        if ($limited) return $limited;
        capacity($db, 'operation_receipts', 20000);
        $reply = $mutate($user);
        if (!in_array($reply['status'], [200, 201], true)) throw new \LogicException('Only saved outcomes may become receipts.');
        $safe = ['actorId' => $user['id'], ...$reply['body']];
        $json = canonical($safe);
        if (strlen($json) > 8192) throw new \LogicException('Receipt exceeds bound.');
        query($db, 'INSERT INTO operation_receipts(user_id,operation_key,action,intent_hash,status,response_json,created_at) VALUES(?,?,?,?,?,?,?)', [$user['id'], $key, $action, $hash, $reply['status'], $json, nowMs()]);
        return result($reply['status'], [...$safe, 'operationKey' => $key, 'replayed' => false]);
    });
}

function operationStatus(PDO $db, string $key): array
{
    if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/D', $key)) reject(422, 'invalid_operation', 'Kunci operasi tidak valid.');
    $user = actor($db); $receipt = readReceipt($db, $user['id'], $key);
    if (!$receipt) return result(200, ['found' => false, 'operationKey' => $key]);
    return result(200, ['found' => true, 'operationKey' => $key, 'action' => $receipt['action'], 'status' => $receipt['status'], 'response' => $receipt['response']]);
}
