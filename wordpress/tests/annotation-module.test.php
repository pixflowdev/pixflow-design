<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require dirname(__DIR__) . '/src/Modules/FeatureContributions.php';
use PixflowDesign\WordPress\Modules\FeatureContributions;
function ensure(bool $value): void { if (!$value) throw new RuntimeException('Feature contribution invariant failed'); }
ensure(!FeatureContributions::available('annotations'));
ensure(FeatureContributions::enqueue() === []);
$calls = 0;
FeatureContributions::add('annotations', function () use (&$calls): string { $calls++; return 'pixflow-annotations'; });
ensure($calls === 0);
ensure(FeatureContributions::available('annotations'));
ensure(FeatureContributions::enqueue() === ['pixflow-annotations']);
ensure($calls === 1);
try { FeatureContributions::add('annotations', fn() => 'other'); throw new RuntimeException('Duplicate accepted'); } catch (LogicException) {}
try { FeatureContributions::add('../unsafe', fn() => 'other'); throw new RuntimeException('Invalid ID accepted'); } catch (LogicException) {}
echo "PASS annotation module (8 checks)\n";
