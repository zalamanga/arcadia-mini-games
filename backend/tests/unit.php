<?php
declare(strict_types=1);
namespace Arcadia\Tests;
require_once __DIR__ . '/../src/bootstrap.php';
use Arcadia\HttpError;
use PDO;
use PDOStatement;

function same(mixed $actual, mixed $expected): void { if ($actual !== $expected) throw new \RuntimeException('Assertion failed.'); }
function denied(callable $action, int $status): void
{
    try { $action(); } catch (HttpError $error) { same($error->status, $status); return; }
    throw new \RuntimeException('Expected rejection.');
}

final class GuardStatement extends PDOStatement
{
    public function __construct() {}
    public function execute(?array $params = null): bool { return true; }
    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed { return ['id' => 1]; }
}

final class TransactionPDO extends PDO
{
    public array $calls = [];
    public bool $active = false;
    public string $fault = '';
    public function __construct() {}
    public function beginTransaction(): bool { $this->calls[] = 'begin'; $this->active = true; return true; }
    public function prepare(string $query, array $options = []): PDOStatement|false { $this->calls[] = 'guard'; return new GuardStatement(); }
    public function inTransaction(): bool { return $this->active; }
    public function commit(): bool { $this->calls[] = 'commit'; $this->active = false; if ($this->fault === 'ack') throw new \RuntimeException('Controlled ACK fault.'); return true; }
    public function rollBack(): bool { $this->calls[] = 'rollback'; if ($this->fault === 'rollback') throw new \RuntimeException('Controlled rollback fault.'); $this->active = false; return true; }
}

$tests = [
    'finite whole JSON numbers accept exponent form but reject strings/bools/fractions' => function (): void {
        same(\Arcadia\whole(2.0, 0, 10), 2); same(\Arcadia\whole(0, 0, 10), 0);
        foreach (['2', true, 2.1, INF, -1, 11] as $bad) denied(fn() => \Arcadia\whole($bad, 0, 10), 422);
    },
    'strict fields reject missing and unknown input' => function (): void {
        \Arcadia\fields(['a' => 1], ['a']);
        denied(fn() => \Arcadia\fields(['a' => 1, 'admin' => true], ['a']), 422);
        denied(fn() => \Arcadia\fields([], ['a']), 422);
    },
    'query parser rejects duplicate/array/unknown/malformed URL parameters' => function (): void {
        same(\Arcadia\queryParameters('route=leaderboard%2Fsnake'), ['route' => 'leaderboard/snake']);
        foreach (['route=games&route=profile', 'route[]=games', 'route=games&token=x', 'route=%xx', ''] as $bad) denied(fn() => \Arcadia\queryParameters($bad), 422);
    },
    'canonical score intent has stable keys and normalized numeric equality' => function (): void {
        $integer = \Arcadia\scoreIntent(['gameId' => 'snake', 'score' => 100, 'duration' => 10, 'result' => 'complete']);
        $exponent = \Arcadia\scoreIntent(['result' => 'complete', 'duration' => 10.0, 'score' => 100.0, 'gameId' => 'snake']);
        same(\Arcadia\intentHash('score.submit', 1, $integer), \Arcadia\intentHash('score.submit', 1, $exponent));
        same(\Arcadia\canonical(['action' => 'score.submit', 'actorId' => 1, 'data' => $integer]), '{"action":"score.submit","actorId":1,"data":{"duration":10,"gameId":"snake","result":"complete","score":100}}');
    },
    'score body rejects unknown game, excessive bounds and wrong result type' => function (): void {
        $body = ['gameId' => 'snake', 'score' => 100, 'duration' => 10, 'result' => 'complete'];
        denied(fn() => \Arcadia\scoreIntent([...$body, 'gameId' => 'simon-says']), 404);
        denied(fn() => \Arcadia\scoreIntent([...$body, 'score' => 1000000001]), 422);
        denied(fn() => \Arcadia\scoreIntent([...$body, 'result' => ['win']]), 422);
    },
    'profile normalization preserves valid username and rejects absent version/extra role' => function (): void {
        same(\Arcadia\profileIntent(['username' => ' player_1 ', 'avatar' => 'P2', 'expectedVersion' => 1]), ['username' => 'player_1', 'avatar' => 'P2', 'expectedVersion' => 1]);
        denied(fn() => \Arcadia\profileIntent(['username' => 'player_1', 'avatar' => 'P2']), 422);
        denied(fn() => \Arcadia\profileIntent(['username' => 'player_1', 'avatar' => 'P2', 'expectedVersion' => 1, 'role' => 'admin']), 422);
    },
    'receipt decoder keeps only exact saved profile metadata and rejects wrong actor/extra PII' => function (): void {
        $row = ['action' => 'profile.update', 'intent_hash' => str_repeat('a', 64), 'status' => 200, 'response_json' => '{"actorId":1,"profileVersion":2}'];
        same(\Arcadia\decodeReceipt($row, 1)['response'], ['actorId' => 1, 'profileVersion' => 2]);
        denied(fn() => \Arcadia\decodeReceipt($row, 2), 503);
        denied(fn() => \Arcadia\decodeReceipt([...$row, 'response_json' => '{"actorId":1,"profileVersion":2,"email":"qa@example.test"}'], 1), 503);
    },
    'receipt decoder rejects malformed JSON and score metadata mismatches' => function (): void {
        $row = ['action' => 'score.submit', 'intent_hash' => str_repeat('a', 64), 'status' => 201, 'response_json' => '{'];
        denied(fn() => \Arcadia\decodeReceipt($row, 1), 503);
        $row['response_json'] = '{"actorId":1,"score":{"id":1,"gameId":"snake","score":-1,"duration":10,"result":"complete","createdAt":1},"unlocked":[]}';
        denied(fn() => \Arcadia\decodeReceipt($row, 1), 503);
    },
    'transaction commits only after guard and returns the actual callback result' => function (): void {
        $db = new TransactionPDO();
        same(\Arcadia\withWrite($db, function () use ($db): int { $db->calls[] = 'mutate'; return 7; }), 7);
        same($db->calls, ['begin', 'guard', 'mutate', 'commit']); same($db->active, false);
    },
    'precommit callback failure rolls back and preserves the original error' => function (): void {
        $db = new TransactionPDO(); $original = new \RuntimeException('Synthetic primary error.');
        try { \Arcadia\withWrite($db, fn() => throw $original); } catch (\Throwable $error) { same($error, $original); }
        same($db->calls, ['begin', 'guard', 'rollback']); same($db->active, false);
    },
    'commit acknowledgement failure is unknown and never followed by rollback' => function (): void {
        $db = new TransactionPDO(); $db->fault = 'ack';
        try { \Arcadia\withWrite($db, fn() => 7); throw new \RuntimeException('Expected unknown.'); }
        catch (HttpError $error) { same($error->outcomeUnknown, true); same($error->errorCode, 'outcome_unknown'); }
        same($db->calls, ['begin', 'guard', 'commit']);
    },
    'rollback failure remains unknown rather than reporting a confirmed rejection' => function (): void {
        $db = new TransactionPDO(); $db->fault = 'rollback';
        try { \Arcadia\withWrite($db, fn() => throw new \RuntimeException('Synthetic primary.')); throw new \RuntimeException('Expected unknown.'); }
        catch (HttpError $error) { same($error->outcomeUnknown, true); }
        same($db->calls, ['begin', 'guard', 'rollback']);
    },
];

echo '1..' . count($tests) . "\n"; $failed = false; $index = 0;
foreach ($tests as $name => $action) {
    $index++;
    try { $action(); echo "ok $index - $name\n"; }
    catch (\Throwable) { $failed = true; echo "not ok $index - $name\n"; }
}
exit($failed ? 1 : 0);
