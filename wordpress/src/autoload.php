<?php

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

spl_autoload_register(static function (string $class): void {
    $prefixes = [
        'PixflowDesign\\WordPress\\' => __DIR__ . '/',
    ];

    foreach ($prefixes as $prefix => $directory) {
        if ($directory === '' || !str_starts_with($class, $prefix)) {
            continue;
        }
        $relative = substr($class, strlen($prefix));
        $path = $directory . str_replace('\\', '/', $relative) . '.php';
        if (is_readable($path)) {
            require_once $path;
        }
        return;
    }
});
