<?php
declare(strict_types=1);
// Run with php -d disable_functions=gzencode,gzdecode.
define('ABSPATH', __DIR__ . '/');
require __DIR__ . '/../src/Chat/HistoryPayload.php';
require __DIR__ . '/../src/Chat/HistoryStorage.php';
use PixflowDesign\WordPress\Chat\HistoryPayload;
use PixflowDesign\WordPress\Chat\HistoryStorage;
if (HistoryPayload::available()) throw new RuntimeException('Disable gzip functions for this test');
$json = json_encode(['content' => str_repeat('Keep full content ', 1000)]);
if (HistoryPayload::encode($json) !== $json || HistoryPayload::message($json)['content'] !== str_repeat('Keep full content ', 1000)) throw new RuntimeException('Fallback lost data');
// Unavailable codec returns before accessing WordPress scheduling or database APIs.
HistoryStorage::schedule(); HistoryStorage::run();
if (HistoryStorage::batch()['rowsCompressed'] !== 0) throw new RuntimeException('Unavailable compression migrated data');
try { HistoryPayload::message('PFCHAT1:2:' . hash('sha256', '{}') . ':eA=='); throw new LogicException('Unreadable archive accepted'); }
catch (RuntimeException $expected) {}
echo "chat-history-no-zlib: plain JSON writes/reads, no worker, compressed reads fail closed passed\n";
