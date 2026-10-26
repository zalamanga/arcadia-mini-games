<?php
declare(strict_types=1);
namespace Arcadia;

final class HttpError extends \RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message,
        public readonly bool $outcomeUnknown = false, public readonly ?int $retryAfter = null)
    {
        parent::__construct($message);
    }
}

function reject(int $status, string $code, string $message): never
{
    throw new HttpError($status, $code, $message);
}

function nowMs(): int { return (int) floor(microtime(true) * 1000); }
function result(int $status, array $body, array $headers = []): array { return ['status' => $status, 'body' => $body, 'headers' => $headers]; }
