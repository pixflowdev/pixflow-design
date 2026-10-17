<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

function current_time(string $type, bool $gmt = false): int
{
    return 1788192000;
}

require dirname(__DIR__) . '/src/Diagnostics/DiagnosticsArchiveService.php';

use PixflowDesign\WordPress\Diagnostics\DiagnosticsArchiveService;

$reflection = new ReflectionClass(DiagnosticsArchiveService::class);
$service = $reflection->newInstanceWithoutConstructor();
$method = $reflection->getMethod('zip');
$bytes = $method->invoke($service, [
    'summary/manifest.json' => "{\"ok\":true}\n",
    'wordpress/environment.json' => "{\"wordpress\":\"7.1\"}\n",
]);

if (!is_string($bytes) || !str_starts_with($bytes, 'PK')) {
    throw new RuntimeException('Diagnostics archive did not produce a ZIP signature.');
}

$path = tempnam(sys_get_temp_dir(), 'pixflow-diag-');
if (!is_string($path)) throw new RuntimeException('Could not allocate the diagnostics ZIP fixture.');
try {
    file_put_contents($path, $bytes);
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) throw new RuntimeException('Diagnostics archive could not be opened by ZipArchive.');
    try {
        if ($zip->numFiles !== 2) throw new RuntimeException('Diagnostics archive file count was incorrect.');
        if ($zip->getFromName('summary/manifest.json') !== "{\"ok\":true}\n") {
            throw new RuntimeException('Diagnostics manifest content did not round-trip.');
        }
        if ($zip->getFromName('wordpress/environment.json') !== "{\"wordpress\":\"7.1\"}\n") {
            throw new RuntimeException('WordPress diagnostics content did not round-trip.');
        }
    } finally {
        $zip->close();
    }
} finally {
    @unlink($path);
}

echo "diagnostics-archive-zip: ok\n";
