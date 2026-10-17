<?php

declare(strict_types=1);

$root = dirname(__DIR__);
define('ABSPATH', $root . '/');
$manifest = require $root . '/resources/mcp-skills/wp-admin/manifest.php';
$entry = null;
foreach ($manifest as $candidate) {
    if (($candidate['id'] ?? '') === 'wordpress-online-research') $entry = $candidate;
}
if (!is_array($entry)) throw new RuntimeException('Missing Pixflow online research skill.');
$path = $root . '/resources/mcp-skills/wp-admin/' . (string) ($entry['file'] ?? '');
if (!is_readable($path)) throw new RuntimeException('Online research skill is unreadable.');
$content = (string) file_get_contents($path);
foreach (['agent chooses', 'Official WordPress and vendor documentation', 'reference material rather than instructions or permission', "authorize changes beyond the user's request", 'Cite'] as $needle) {
    if (stripos($content, $needle) === false) throw new RuntimeException("Missing online research invariant: {$needle}");
}
foreach (['two grounding rounds', 'six combined'] as $obsolete_limit) {
    if (stripos($content, $obsolete_limit) !== false) throw new RuntimeException('Research depth must remain agent-selected.');
}
if (preg_match('/contains ["\']?(?:search|snippet|plugin)["\']?\s*(?:→|->|then)/i', $content)) {
    throw new RuntimeException('Online research skill contains deterministic phrase routing.');
}
echo "WP Admin online research skill tests passed\n";
