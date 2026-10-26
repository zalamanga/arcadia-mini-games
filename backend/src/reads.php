<?php
declare(strict_types=1);
namespace Arcadia;
use PDO;

function gameRow(PDO $db, string $id): array
{
    if (!isset(catalog()[$id])) reject(404, 'game_not_found', 'Game tidak ditemukan.');
    $row = query($db, 'SELECT id,name,category,difficulty,description FROM games WHERE id=? AND is_active=1', [$id])->fetch();
    if (!$row) reject(404, 'game_not_found', 'Game tidak ditemukan.');
    return $row;
}

function ranked(array $rows): array
{
    foreach ($rows as $index => &$row) {
        $row['rank'] = $index + 1;
        foreach (['userId', 'score', 'gamesPlayed'] as $key) if (isset($row[$key])) $row[$key] = (int) $row[$key];
    }
    unset($row); return $rows;
}

function gameLeaderboard(PDO $db, string $gameId, int $limit = 25): array
{
    $limit = $limit === 10 ? 10 : 25;
    return ranked(query($db, 'SELECT u.id AS userId,u.username,u.avatar,best.score FROM (SELECT user_id,MAX(score) AS score FROM scores WHERE game_id=? GROUP BY user_id) best JOIN users u ON u.id=best.user_id JOIN scores s ON s.user_id=best.user_id AND s.game_id=? AND s.score=best.score GROUP BY u.id,u.username,u.avatar,best.score ORDER BY best.score DESC,MIN(s.created_at) ASC,u.id ASC LIMIT ' . $limit, [$gameId, $gameId])->fetchAll());
}

function globalLeaderboard(PDO $db): array
{
    return ranked(query($db, 'SELECT u.id AS userId,u.username,u.avatar,SUM(best.best_score) AS score,COUNT(*) AS gamesPlayed FROM (SELECT user_id,game_id,MAX(score) AS best_score FROM scores GROUP BY user_id,game_id) best JOIN users u ON u.id=best.user_id GROUP BY u.id,u.username,u.avatar ORDER BY score DESC,gamesPlayed DESC,u.username ASC,u.id ASC LIMIT 25')->fetchAll());
}

function readRoute(PDO $db, string $route, array $parameters = []): array
{
    if ($route === 'health') return result(200, ['status' => 'ok', 'database' => 'mysql', 'demo' => true, 'schemaVersion' => 1]);
    if ($route === 'auth/me') {
        $user = currentUser($db);
        if ($user && requestHeader('X-Arcadia-Actor') !== '') $user = actor($db, false);
        return result(200, ['user' => $user]);
    }
    if ($route === 'operations') return operationStatus($db, text($parameters['operationKey'] ?? null, 36, 36));
    if ($route === 'games') {
        $rows = query($db, 'SELECT g.id,g.name,g.category,g.difficulty,g.description,COUNT(s.id) AS plays,COALESCE(MAX(s.score),0) AS topScore FROM games g LEFT JOIN scores s ON s.game_id=g.id WHERE g.is_active=1 GROUP BY g.id,g.name,g.category,g.difficulty,g.description ORDER BY FIELD(g.category,\'Puzzle\',\'Arcade\',\'Skill\'),g.name')->fetchAll();
        foreach ($rows as &$row) {
            if (!isset(catalog()[$row['id']])) reject(503, 'catalog_mismatch', 'Katalog database tidak cocok dengan sumber demo.');
            $row['slug'] = $row['id']; $row['plays'] = (int) $row['plays']; $row['topScore'] = (int) $row['topScore'];
        }
        unset($row); return result(200, ['games' => $rows, 'scoreTrust' => 'client-reported-demo']);
    }
    $parts = explode('/', $route);
    if (count($parts) === 2 && in_array($parts[0], ['games', 'scores', 'leaderboard'], true)) {
        $game = gameRow($db, $parts[1]);
        if ($parts[0] === 'games') return result(200, ['game' => $game, 'leaderboard' => gameLeaderboard($db, $game['id'], 10)]);
        return result(200, ['gameId' => $game['id'], $parts[0] === 'scores' ? 'scores' : 'leaderboard' => gameLeaderboard($db, $game['id'])]);
    }
    if ($route === 'leaderboard') return result(200, ['leaderboard' => globalLeaderboard($db), 'scoreTrust' => 'client-reported-demo']);
    if ($route === 'achievements') {
        $user = currentUser($db);
        if ($user && requestHeader('X-Arcadia-Actor') !== '') $user = actor($db, false);
        $rows = query($db, 'SELECT a.id,a.name,a.description,a.requirement,(ua.user_id IS NOT NULL) AS unlocked,ua.unlocked_at AS unlockedAt FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=? ORDER BY a.id', [$user['id'] ?? 0])->fetchAll();
        foreach ($rows as &$row) { $row['unlocked'] = (bool) $row['unlocked']; $row['unlockedAt'] = $row['unlockedAt'] === null ? null : (int) $row['unlockedAt']; }
        unset($row); return result(200, ['achievements' => $rows]);
    }
    if ($route === 'profile') {
        $user = actor($db, false);
        $stats = query($db, 'SELECT COUNT(*) AS sessions,COUNT(DISTINCT game_id) AS gamesPlayed,COALESCE(SUM(score),0) AS totalScore,COALESCE(MAX(score),0) AS bestScore,COALESCE(SUM(duration),0) AS totalDuration FROM game_sessions WHERE user_id=?', [$user['id']])->fetch();
        foreach ($stats as &$value) $value = (int) $value; unset($value);
        $history = query($db, 'SELECT s.id,s.game_id AS gameId,g.name AS gameName,s.result,s.score,s.duration,s.created_at AS createdAt FROM game_sessions s JOIN games g ON g.id=s.game_id WHERE s.user_id=? ORDER BY s.created_at DESC,s.id DESC LIMIT 20', [$user['id']])->fetchAll();
        foreach ($history as &$row) foreach (['id', 'score', 'duration', 'createdAt'] as $key) $row[$key] = (int) $row[$key]; unset($row);
        return result(200, ['user' => $user, 'stats' => $stats, 'history' => $history]);
    }
    if ($route === 'admin/stats') {
        $user = actor($db, false);
        if ($user['role'] !== 'admin') reject(403, 'admin_required', 'Akses pengelola diperlukan.');
        $today = (new \DateTimeImmutable('today', new \DateTimeZone('UTC')))->getTimestamp() * 1000;
        $totals = query($db, 'SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM game_sessions) AS sessions,(SELECT COUNT(*) FROM games WHERE is_active=1) AS games,(SELECT COUNT(*) FROM scores WHERE created_at>=?) AS scores_today', [$today])->fetch();
        foreach ($totals as &$value) $value = (int) $value; unset($value);
        return result(200, ['totals' => $totals]);
    }
    reject(404, 'not_found', 'Endpoint tidak ditemukan.');
}
