<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
require __DIR__ . '/../src/Od/ProjectAdapter.php';
use PixflowDesign\WordPress\Od\ProjectAdapter;
$legacy = ['id'=>'old-1', 'role'=>'assistant', 'text'=>"Original café\n\nSecond paragraph", 'status'=>'complete', 'events'=>[['type'=>'text', 'text'=>'Original']]];
$modern = ['id'=>'new-1', 'role'=>'assistant', 'content'=>'Current content', 'text'=>'Older text', 'runStatus'=>'succeeded'];
$page = ['messages'=>[$legacy,$modern,['id'=>'empty','content'=>null]], 'nextCursor'=>'cursor', 'hasMore'=>true];
$before = serialize($page);
$actual = ProjectAdapter::to_app_message_page($page);
if ($actual['messages'][0]['content'] !== $legacy['text']) throw new RuntimeException('Legacy text must render as content');
if ($actual['messages'][1] !== $modern) throw new RuntimeException('Modern messages must remain unchanged');
if ($actual['messages'][2]['content'] !== '') throw new RuntimeException('Empty legacy messages need string content');
foreach ($legacy as $key=>$value) if ($actual['messages'][0][$key] !== $value) throw new RuntimeException('Legacy fields changed');
if (serialize($page) !== $before) throw new RuntimeException('Stored input changed');
if ($actual['nextCursor'] !== 'cursor' || $actual['hasMore'] !== true) throw new RuntimeException('Pagination changed');
echo "workspace-legacy-message: 6 checks passed\n";
