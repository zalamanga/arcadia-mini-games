<?php
declare(strict_types=1);
namespace Arcadia;

function catalog(): array
{
    static $catalog;
    if ($catalog !== null) return $catalog;
    $raw = file_get_contents(__DIR__ . '/../../shared/games.json');
    if ($raw === false || strlen($raw) > 32768) reject(503, 'catalog_unavailable', 'Katalog permainan belum tersedia.');
    $items = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($items) || !array_is_list($items) || count($items) !== 13) reject(503, 'catalog_unavailable', 'Katalog permainan tidak cocok.');
    $catalog = [];
    foreach ($items as $item) {
        if (!is_array($item) || !is_string($item['id'] ?? null) || !preg_match('/^[a-z0-9-]{1,40}$/D', $item['id']) || isset($catalog[$item['id']])
            || !in_array($item['category'] ?? null, ['Puzzle', 'Arcade', 'Skill'], true)) reject(503, 'catalog_unavailable', 'Katalog permainan tidak cocok.');
        $catalog[$item['id']] = $item;
    }
    return $catalog;
}

function achievements(): array
{
    return [
        ['id' => 'first-run', 'name' => 'Run pertama', 'description' => 'Selesaikan satu permainan.', 'requirement' => '1 run'],
        ['id' => 'getting-warm', 'name' => 'Mulai terbiasa', 'description' => 'Selesaikan lima permainan.', 'requirement' => '5 run'],
        ['id' => 'arcade-explorer', 'name' => 'Jelajah arcade', 'description' => 'Mainkan lima judul berbeda.', 'requirement' => '5 game berbeda'],
        ['id' => 'score-hunter', 'name' => 'Seribu poin', 'description' => 'Dapatkan skor minimal seribu dalam satu run.', 'requirement' => 'Skor 1.000'],
        ['id' => 'dedicated', 'name' => 'Latihan rutin', 'description' => 'Selesaikan sepuluh run pada satu game.', 'requirement' => '10 run satu game'],
        ['id' => 'veteran', 'name' => 'Lima puluh run', 'description' => 'Selesaikan lima puluh permainan.', 'requirement' => '50 run'],
    ];
}
