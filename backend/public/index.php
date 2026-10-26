<?php
declare(strict_types=1);
namespace Arcadia;
require_once __DIR__ . '/../src/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
$db = null;
try {
    $config = config();
    requestBoundary($config);
    $parameters = queryParameters((string) ($_SERVER['QUERY_STRING'] ?? ''));
    if (!is_string($parameters['route'] ?? null) || !preg_match('/^[a-z0-9\/-]{1,100}$/D', $parameters['route'])) reject(422, 'invalid_route', 'Route tidak valid.');
    $route = $parameters['route']; $method = $_SERVER['REQUEST_METHOD'];
    $keys = array_keys($parameters); sort($keys); $expected = $route === 'operations' ? ['operationKey', 'route'] : ['route']; sort($expected);
    if ($keys !== $expected) reject(422, 'invalid_query', 'Parameter route tidak sesuai.');
    $body = $method === 'GET' ? [] : requestBody();
    $db = connect($config); marked($db, $config);
    if ($method === 'GET') respond(readRoute($db, $route, $parameters));
    if ($method === 'POST' && in_array($route, ['auth/register', 'auth/login'], true)) respond(authenticate($db, $config, $route, $body));
    if ($method === 'POST' && $route === 'auth/logout') { fields($body, []); respond(logout($db)); }
    if ($method === 'POST' && $route === 'scores') respond(saveScore($db, $config, $body, operationKey()));
    if ($method === 'PATCH' && $route === 'profile') respond(saveProfile($db, $config, $body, operationKey()));
    reject(404, 'not_found', 'Endpoint tidak ditemukan.');
} catch (HttpError $error) {
    $db = null;
    respond(result($error->status, ['error' => ['code' => $error->errorCode, 'message' => $error->getMessage()], 'outcomeUnknown' => $error->outcomeUnknown],
        $error->retryAfter === null ? [] : ['Retry-After' => (string) $error->retryAfter]));
} catch (\Throwable) {
    $db = null;
    error_log('Arcadia request failed; private database diagnostic required.');
    respond(result(503, ['error' => ['code' => 'service_unavailable', 'message' => 'Layanan belum dapat memberi konfirmasi. Periksa status operasi sebelum mengirim ulang.'], 'outcomeUnknown' => true]));
}
