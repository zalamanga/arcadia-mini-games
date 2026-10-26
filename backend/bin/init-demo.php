<?php
declare(strict_types=1);
namespace Arcadia;
require_once __DIR__ . '/../src/bootstrap.php';

if (PHP_SAPI !== 'cli') { http_response_code(403); exit('CLI only.'); }
$db = null;
try {
    $options = [];
    foreach (array_slice($argv, 1) as $argument) {
        if ($argument === '--confirm-empty') { if (isset($options['confirm'])) throw new \RuntimeException(); $options['confirm'] = true; }
        elseif (str_starts_with($argument, '--database=')) { if (isset($options['database'])) throw new \RuntimeException(); $options['database'] = substr($argument, 11); }
        elseif (str_starts_with($argument, '--admin-email=')) { if (isset($options['adminEmail'])) throw new \RuntimeException(); $options['adminEmail'] = substr($argument, 14); }
        else throw new \RuntimeException();
    }
    $config = config(true);
    if (($options['confirm'] ?? null) !== true || ($options['database'] ?? null) !== $config['database']) throw new \RuntimeException();
    $adminEmail = email($options['adminEmail'] ?? null);
    if (!str_ends_with($adminEmail, '@example.test')) throw new \RuntimeException();
    $line = fgets(STDIN);
    if ($line === false) throw new \RuntimeException();
    $secret = password(rtrim($line, "\r\n"));
    $db = connect($config, false);
    $exists = query($db, 'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [$config['database']])->fetch();
    if (!$exists) $db->exec('CREATE DATABASE `' . $config['database'] . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $db->exec('USE `' . $config['database'] . '`');
    $count = (int) query($db, 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=?', [$config['database']])->fetchColumn();
    if ($count !== 0) reject(409, 'nonempty_database', 'Database tidak kosong. Initializer menolak reset, migrasi atau penghapusan data.');
    $schema = file_get_contents(__DIR__ . '/../schema.sql');
    if ($schema === false) throw new \RuntimeException();
    foreach (preg_split('/;\s*(?:\R|$)/', $schema) as $statement) if (trim($statement) !== '') $db->exec($statement);
    $db->beginTransaction(); $now = nowMs();
    query($db, 'INSERT INTO arcadia_write_guard(id) VALUES(1)');
    foreach (catalog() as $game) query($db, 'INSERT INTO games(id,name,category,difficulty,description) VALUES(?,?,?,?,?)', [$game['id'], $game['title'], $game['category'], $game['difficulty'], $game['description']]);
    foreach (achievements() as $achievement) query($db, 'INSERT INTO achievements(id,name,description,requirement) VALUES(?,?,?,?)', [$achievement['id'], $achievement['name'], $achievement['description'], $achievement['requirement']]);
    query($db, "INSERT INTO users(username,email,password_hash,role,created_at) VALUES('qa_admin',?,?,'admin',?)", [$adminEmail, password_hash($secret, PASSWORD_DEFAULT), $now]);
    query($db, "INSERT INTO arcadia_demo_meta(id,application,schema_version,state,created_at) VALUES(1,'arcadia-mini-games',1,'ready',?)", [$now]);
    $db->commit(); $db = null; unset($secret, $line);
    fwrite(STDOUT, "Fresh Arcadia demo initialized:13 games,6 achievements,1 explicit synthetic admin. No historical data imported.\n");
} catch (HttpError $error) {
    $db = null; fwrite(STDERR, $error->errorCode === 'nonempty_database' ? "Refused: database is not empty. Existing and partial state retained.\n" : "Initializer not confirmed. Inspect private configuration and retained partial state; do not reset automatically.\n"); exit(1);
} catch (\Throwable) {
    $db = null; fwrite(STDERR, "Initializer not confirmed. Existing and partial state retained; no automatic reset or retry.\n"); exit(1);
}
