<?php
declare(strict_types=1);
namespace Arcadia;
use PDO;

function scoreIntent(array $body): array
{
    fields($body, ['gameId', 'score', 'duration', 'result']);
    $gameId = text($body['gameId'], 1, 40);
    if (!isset(catalog()[$gameId])) reject(404, 'game_not_found', 'Game tidak ditemukan.');
    $result = $body['result'];
    if (!is_string($result) || !in_array($result, ['win', 'loss', 'draw', 'complete'], true)) reject(422, 'invalid_result', 'Hasil permainan tidak valid.');
    return ['gameId' => $gameId, 'score' => whole($body['score'], 0, 1000000000), 'duration' => whole($body['duration'], 0, 86400000), 'result' => $result];
}

function unlockAchievements(PDO $db, int $userId): array
{
    $stats = query($db, 'SELECT COUNT(*) AS sessions,COUNT(DISTINCT game_id) AS unique_games,COALESCE(MAX(score),0) AS best_score FROM game_sessions WHERE user_id=?', [$userId])->fetch();
    $maxInGame = (int) query($db, 'SELECT COALESCE(MAX(total),0) FROM (SELECT COUNT(*) AS total FROM game_sessions WHERE user_id=? GROUP BY game_id) per_game', [$userId])->fetchColumn();
    $eligible = [];
    if ((int) $stats['sessions'] >= 1) $eligible[] = 'first-run';
    if ((int) $stats['sessions'] >= 5) $eligible[] = 'getting-warm';
    if ((int) $stats['unique_games'] >= 5) $eligible[] = 'arcade-explorer';
    if ((int) $stats['best_score'] >= 1000) $eligible[] = 'score-hunter';
    if ($maxInGame >= 10) $eligible[] = 'dedicated';
    if ((int) $stats['sessions'] >= 50) $eligible[] = 'veteran';
    $new = [];
    foreach ($eligible as $id) {
        $prior = query($db, 'SELECT achievement_id FROM user_achievements WHERE user_id=? AND achievement_id=?', [$userId, $id])->fetch();
        if (!$prior) { query($db, 'INSERT INTO user_achievements(user_id,achievement_id,unlocked_at) VALUES(?,?,?)', [$userId, $id, nowMs()]); $new[] = $id; }
    }
    return $new;
}

function saveScore(PDO $db, array $config, array $body, string $key): array
{
    $intent = scoreIntent($body);
    return protectedOperation($db, $config, 'score.submit', $key, $intent, function (array $user) use ($db, $intent): array {
        $active = query($db, 'SELECT id FROM games WHERE id=? AND is_active=1', [$intent['gameId']])->fetch();
        if (!$active) reject(409, 'game_inactive', 'Game ini tidak menerima skor baru.');
        capacity($db, 'scores', 20000); capacity($db, 'game_sessions', 20000);
        $now = nowMs();
        query($db, 'INSERT INTO scores(user_id,game_id,score,duration,result,created_at) VALUES(?,?,?,?,?,?)', [$user['id'], $intent['gameId'], $intent['score'], $intent['duration'], $intent['result'], $now]);
        $id = (int) $db->lastInsertId();
        query($db, 'INSERT INTO game_sessions(score_id,user_id,game_id,score,duration,result,created_at) VALUES(?,?,?,?,?,?,?)', [$id, $user['id'], $intent['gameId'], $intent['score'], $intent['duration'], $intent['result'], $now]);
        $unlocked = unlockAchievements($db, $user['id']);
        return result(201, ['score' => ['id' => $id, ...$intent, 'createdAt' => $now], 'unlocked' => $unlocked]);
    });
}

function profileIntent(array $body): array
{
    fields($body, ['username', 'avatar', 'expectedVersion']);
    $avatar = $body['avatar'];
    if (!is_string($avatar) || !in_array($avatar, ['P1', 'P2', 'PX', 'AI', 'GG', 'XP'], true)) reject(422, 'invalid_avatar', 'Avatar tidak valid.');
    return ['username' => username($body['username']), 'avatar' => $avatar, 'expectedVersion' => whole($body['expectedVersion'], 1, 9007199254740990)];
}

function saveProfile(PDO $db, array $config, array $body, string $key): array
{
    $intent = profileIntent($body);
    return protectedOperation($db, $config, 'profile.update', $key, $intent, function (array $user) use ($db, $intent): array {
        if ($user['version'] !== $intent['expectedVersion']) reject(409, 'profile_changed', 'Profil sudah berubah. Muat ulang sebelum menyimpan draft ini.');
        if (query($db, 'SELECT id FROM users WHERE username=? AND id<>?', [$intent['username'], $user['id']])->fetch()) reject(409, 'username_exists', 'Username sudah dipakai.');
        $next = $user['version'] + 1;
        $updated = query($db, 'UPDATE users SET username=?,avatar=?,version=? WHERE id=? AND version=?', [$intent['username'], $intent['avatar'], $next, $user['id'], $user['version']]);
        if ($updated->rowCount() !== 1) reject(409, 'profile_changed', 'Profil berubah sebelum penyimpanan.');
        return result(200, ['profileVersion' => $next]);
    });
}
