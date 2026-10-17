<?php

declare(strict_types=1);

// Simulate the short interval during a WordPress update where the plugin entry
// file is visible but neither the release nor source-tree autoloader has been
// copied into place yet.
$fixture_root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pixflow-bootstrap-' . bin2hex(random_bytes(6));
$fixture_entry = $fixture_root . DIRECTORY_SEPARATOR . 'pixflow-ai.php';

mkdir($fixture_root, 0777, true);
copy(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'pixflow-design.php', $fixture_entry);

define('ABSPATH', $fixture_root . DIRECTORY_SEPARATOR);

function plugin_dir_path(string $file): string
{
    return dirname($file) . DIRECTORY_SEPARATOR;
}

function plugin_dir_url(string $file): string
{
    return 'https://example.test/wp-content/plugins/pixflow-ai/';
}

try {
    require $fixture_entry;
} finally {
    unlink($fixture_entry);
    rmdir($fixture_root);
}

echo "plugin-bootstrap-partial-update: ok\n";
