<?php
declare(strict_types=1);
namespace Arcadia;

function environment(string $name): string
{
    $value = getenv($name);
    return $value === false ? '' : $value;
}

function configuredOrigin(string $value): string
{
    $parts = parse_url($value);
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host']) || !in_array($parts['scheme'], ['http', 'https'], true)
        || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
        || (isset($parts['path']) && $parts['path'] !== '') || !in_array($parts['host'], ['127.0.0.1', 'localhost', '[::1]'], true)) {
        reject(503, 'configuration', 'Origin demo harus berupa origin loopback yang lengkap, tanpa path.');
    }
    $port = $parts['port'] ?? ($parts['scheme'] === 'https' ? 443 : 80);
    $canonical = $parts['scheme'] . '://' . $parts['host'] . (($port === 80 && $parts['scheme'] === 'http') || ($port === 443 && $parts['scheme'] === 'https') ? '' : ':' . $port);
    if ($canonical !== $value) reject(503, 'configuration', 'Gunakan origin demo yang kanonik.');
    return $canonical;
}

function config(bool $initializer = false): array
{
    $database = environment('ARCADIA_DB_NAME');
    $port = environment('ARCADIA_DB_PORT');
    if (environment('ARCADIA_DEMO_MODE') !== 'true' || !preg_match('/^arcadia_demo_[a-z0-9_]{1,40}$/D', $database)
        || environment('ARCADIA_DB_HOST') !== '127.0.0.1' || !preg_match('/^[0-9]{1,5}$/D', $port) || (int) $port < 1 || (int) $port > 65535) {
        reject(503, 'configuration', 'Konfigurasi database demo loopback belum valid. Database lama tidak digunakan.');
    }
    $user = environment($initializer ? 'ARCADIA_INIT_USER' : 'ARCADIA_DB_USER');
    $password = environment($initializer ? 'ARCADIA_INIT_PASSWORD' : 'ARCADIA_DB_PASSWORD');
    if ($user === '' || strlen($user) > 64 || $password === '') reject(503, 'configuration', 'Isi kredensial database melalui environment privat.');
    if (!$initializer && strlen(environment('ARCADIA_RATE_KEY')) < 32) reject(503, 'configuration', 'ARCADIA_RATE_KEY demo belum diisi.');
    return ['database' => $database, 'host' => '127.0.0.1', 'port' => (int) $port, 'user' => $user, 'password' => $password,
        'frontendOrigin' => configuredOrigin(environment('ARCADIA_FRONTEND_ORIGIN')), 'apiOrigin' => configuredOrigin(environment('ARCADIA_API_ORIGIN')),
        'rateKey' => environment('ARCADIA_RATE_KEY')];
}
