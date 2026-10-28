<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
require dirname(__DIR__) . '/src/autoload.php';
$reflection = new ReflectionClass(\PixflowDesign\WordPress\Od\RegistryService::class);
$registry = $reflection->newInstanceWithoutConstructor();
$missing = sys_get_temp_dir() . '/pixflow-absent-catalogue-' . bin2hex(random_bytes(12));
$result = $reflection->getMethod('skill_summaries')->invoke($registry, [$missing], 'template');
if ($result !== [] || file_exists($missing)) throw new RuntimeException('Missing optional catalogue must stay empty without creating files.');
echo "Absent catalogue preservation passed.\n";
