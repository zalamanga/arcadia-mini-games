<?php
declare(strict_types=1);
namespace Arcadia;

function requestHeader(string $name): string
{
    return (string) ($_SERVER['HTTP_' . strtoupper(str_replace('-', '_', $name))] ?? '');
}

function requestBoundary(array $config): void
{
    $api = parse_url($config['apiOrigin']);
    $expectedHost = $api['host'] . (isset($api['port']) ? ':' . $api['port'] : '');
    if (strtolower((string) ($_SERVER['HTTP_HOST'] ?? '')) !== strtolower($expectedHost)) reject(403, 'host_denied', 'Host API tidak sesuai konfigurasi demo.');
    $origin = requestHeader('Origin');
    if ($origin === $config['frontendOrigin']) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    }
    $method = (string) ($_SERVER['REQUEST_METHOD'] ?? '');
    if ($method === 'OPTIONS') {
        if ($origin !== $config['frontendOrigin']) reject(403, 'origin_denied', 'Origin tidak diizinkan.');
        header('Access-Control-Allow-Headers: Content-Type, X-Arcadia-Intent, X-Arcadia-Actor, X-Arcadia-Operation');
        header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
        http_response_code(204); exit;
    }
    if (!in_array($method, ['GET', 'POST', 'PATCH'], true)) reject(405, 'method_denied', 'Metode tidak didukung.');
    if ($method !== 'GET' && ($origin !== $config['frontendOrigin'] || requestHeader('X-Arcadia-Intent') !== 'mutate-v1')) {
        reject(403, 'origin_denied', 'Origin atau penanda mutasi tidak sesuai.');
    }
}

function requestBody(int $maximum = 32768): array
{
    $type = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($type !== 'application/json') reject(415, 'json_required', 'Kirim JSON dengan Content-Type application/json.');
    $declared = $_SERVER['CONTENT_LENGTH'] ?? null;
    if ($declared !== null && (!preg_match('/^[0-9]+$/D', (string) $declared) || (float) $declared > $maximum)) reject(413, 'body_too_large', 'Permintaan melampaui batas.');
    $stream = fopen('php://input', 'rb');
    if ($stream === false) reject(400, 'unreadable_body', 'Isi permintaan belum dapat dibaca.');
    $raw = '';
    try {
        while (!feof($stream)) {
            $part = fread($stream, min(8192, $maximum + 1 - strlen($raw)));
            if ($part === false) reject(400, 'unreadable_body', 'Isi permintaan belum dapat dibaca.');
            $raw .= $part;
            if (strlen($raw) > $maximum) reject(413, 'body_too_large', 'Permintaan melampaui batas.');
        }
    } finally { fclose($stream); }
    try { $value = json_decode($raw, false, 16, JSON_THROW_ON_ERROR); }
    catch (\JsonException) { reject(400, 'invalid_json', 'JSON tidak valid.'); }
    if (!$value instanceof \stdClass) reject(422, 'invalid_body', 'Isi JSON harus berupa object.');
    return get_object_vars($value);
}

function queryParameters(string $raw): array
{
    if (strlen($raw) > 2048) reject(414, 'query_too_large', 'Parameter URL terlalu panjang.');
    $parameters = [];
    foreach (explode('&', $raw) as $pair) {
        if ($pair === '') reject(422, 'invalid_query', 'Parameter URL tidak valid.');
        [$rawKey, $rawValue] = array_pad(explode('=', $pair, 2), 2, '');
        if (preg_match('/%(?![a-fA-F0-9]{2})/', $rawKey . $rawValue)) reject(422, 'invalid_query', 'Encoding parameter URL tidak valid.');
        $key = urldecode($rawKey); $value = urldecode($rawValue);
        if (!in_array($key, ['route', 'operationKey'], true) || array_key_exists($key, $parameters) || !preg_match('//u', $value)) reject(422, 'invalid_query', 'Parameter URL tidak dikenal atau berulang.');
        $parameters[$key] = $value;
    }
    return $parameters;
}

function fields(array $body, array $required): void
{
    $actual = array_keys($body); sort($actual); $expected = $required; sort($expected);
    if ($actual !== $expected) reject(422, 'invalid_fields', 'Kolom permintaan tidak sesuai.');
}

function text(mixed $value, int $minimum, int $maximum): string
{
    if (!is_string($value) || strlen($value) > $maximum || !preg_match('//u', $value) || preg_match('/[\x00-\x1f\x7f]/', $value)) reject(422, 'invalid_text', 'Teks tidak valid.');
    $value = trim($value);
    if (strlen($value) < $minimum) reject(422, 'invalid_text', 'Teks belum memenuhi panjang minimum.');
    return $value;
}

function whole(mixed $value, int $minimum, int $maximum): int
{
    if ((!is_int($value) && (!is_float($value) || !is_finite($value) || floor($value) !== $value)) || $value < $minimum || $value > $maximum) reject(422, 'invalid_number', 'Angka harus integer dalam rentang yang diizinkan.');
    return (int) $value;
}

function operationKey(): string
{
    $key = requestHeader('X-Arcadia-Operation');
    if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/D', $key)) reject(422, 'invalid_operation', 'Kunci operasi tidak valid.');
    return $key;
}

function canonical(mixed $value): string
{
    if (is_array($value)) {
        if (!array_is_list($value)) ksort($value, SORT_STRING);
        foreach ($value as $key => $item) $value[$key] = json_decode(canonical($item), true, 16, JSON_THROW_ON_ERROR);
    }
    return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function intentHash(string $action, int $actorId, array $data): string
{
    return hash('sha256', canonical(['action' => $action, 'actorId' => $actorId, 'data' => $data]));
}

function respond(array $reply): never
{
    $encoded = json_encode($reply['body'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($encoded) > 1048576) reject(503, 'response_too_large', 'Respons belum dapat ditampilkan dalam batas demo.');
    http_response_code($reply['status']);
    foreach ($reply['headers'] ?? [] as $name => $value) header($name . ': ' . $value);
    echo $encoded; exit;
}
