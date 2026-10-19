<?php
declare(strict_types=1);

// Native editor saves belong to WordPress/builders, not Pixflow's AI revision guard.
$root = dirname(__DIR__);
foreach (['src/Plugin.php', 'src/Admin/Gutenberg/WpAdminGutenbergEditorBridge.php'] as $path) {
    $source = file_get_contents($root . '/' . $path);
    if (str_contains($source, 'EditorSaveGuard') || str_contains($source, 'pixflow-editor-save-guard')) {
        throw new RuntimeException('Native saves still intercepted in ' . $path);
    }
}
echo "Native Gutenberg save ownership passed.\n";
