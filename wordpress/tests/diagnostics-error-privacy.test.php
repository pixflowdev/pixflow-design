<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
require dirname(__DIR__) . '/src/Diagnostics/DiagnosticsSnapshotService.php';
$class = new ReflectionClass(\PixflowDesign\WordPress\Diagnostics\DiagnosticsSnapshotService::class);
$service = $class->newInstanceWithoutConstructor();
$summarize = $class->getMethod('redact_error_line');
$result = $summarize->invoke($service, '[Pixflow] PHP Fatal error: rejected PRIVATE_PAGE_TEXT_7531 https://private.test/?token=secret');
if (str_contains($result, 'PRIVATE_PAGE_TEXT_7531') || str_contains($result, 'private.test') || str_contains($result, 'secret')) {
    throw new RuntimeException('PHP diagnostics retained private error content.');
}
if (!str_contains(strtolower($result), 'fatal')) throw new RuntimeException('Error category was lost.');
echo "diagnostics-error-privacy: ok\n";
