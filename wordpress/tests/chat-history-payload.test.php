<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
require __DIR__ . '/../src/Chat/HistoryPayload.php';
use PixflowDesign\WordPress\Chat\HistoryPayload;
$checks = 0;
function payload_check(bool $ok, string $label): void { $GLOBALS['checks']++; if (!$ok) throw new RuntimeException($label); }
function payload_rejected(string $stored): bool { try { HistoryPayload::message($stored); return false; } catch (Throwable $error) { return true; } }

$small = '{"id":"small","content":"Keep me 日本語"}';
payload_check(HistoryPayload::encode($small) === $small, 'Small messages stay plain JSON');
foreach (['api', 'codex', 'composio'] as $provider) {
    $message = ['id' => "run:$provider/α", 'role' => 'assistant', 'agentId' => $provider,
        'content' => str_repeat("Line\nالعربية 日本語 🎨\0", 600),
        'events' => [['kind' => 'tool_result', 'output' => str_repeat('Original tool result ', 2000)]],
        'attachments' => [['url' => '/uploads/original.png', 'unknownFutureField' => [null, true, 1.25]]],
        'steering' => [['id' => 'steer-1', 'offset' => 23, 'content' => 'Latest correction']],
        'runStatus' => 'canceled', 'unknownField' => ['retain' => false]];
    $json = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $encoded = HistoryPayload::encode($json);
    payload_check(strlen($encoded) < strlen($json) / 4, "$provider substantial savings");
    payload_check(HistoryPayload::json($encoded) === $json, "$provider byte exact JSON");
    payload_check(HistoryPayload::message($encoded) === $message, "$provider full field preservation");
    payload_check(payload_rejected(substr($encoded, 0, -8)), 'Truncation fails closed');
    $parts = explode(':', $encoded, 4);
    $parts[2] = str_repeat('0', 64);
    payload_check(payload_rejected(implode(':', $parts)), 'Checksum fails closed');
    $parts = explode(':', $encoded, 4); $parts[1] = '1';
    payload_check(payload_rejected(implode(':', $parts)), 'Decompression bound enforced');
}
payload_check(payload_rejected('PFCHAT2:future'), 'Unknown encoding fails closed');
payload_check(payload_rejected('{broken'), 'Malformed legacy JSON fails closed');
payload_check(payload_rejected('null'), 'Invalid payload fails closed');
$random = json_encode(['content' => base64_encode(random_bytes(16000))]);
payload_check(HistoryPayload::encode($random) === $random, 'No growth for incompressible data');
$oversized = json_encode(['content' => str_repeat('x', HistoryPayload::MAX_BYTES)]);
payload_check(HistoryPayload::encode($oversized) === $oversized, 'Oversized legacy content remains unchanged and readable');
payload_check(HistoryPayload::message($oversized)['content'] === str_repeat('x', HistoryPayload::MAX_BYTES), 'Oversized plain JSON stays readable');
echo "chat-history-payload: {$checks} checks passed\n";
