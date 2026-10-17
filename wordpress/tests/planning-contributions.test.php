<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
require __DIR__ . '/../src/Modules/FeatureContributions.php';
use PixflowDesign\WordPress\Modules\FeatureContributions as Features;
function verify(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
verify(!Features::available('planning') && Features::catalogue() === [] && Features::skill_roots() === [], 'Free exposes premium contributions');
try { Features::call('sitemap.save', []); throw new LogicException('Missing operation was accepted'); }
catch (RuntimeException $e) { verify(str_contains($e->getMessage(), 'Pro'), 'Unavailable operation is unclear'); }
Features::add('planning', static fn() => 'pixflow-planning', [
    'tools' => ['sitemap.save' => ['description' => 'Save plan']],
    'call' => static fn($tool, $args) => ['tool' => $tool, 'args' => $args],
    'skillRoots' => ['pixflow/sitemap/' => '/pro/sitemap'],
]);
verify(Features::available('planning'), 'Active contribution missing');
verify(Features::enqueue() === ['pixflow-planning'], 'Asset contribution lost');
verify(Features::call('sitemap.save', ['id' => 'test']) === ['tool' => 'sitemap.save', 'args' => ['id' => 'test']], 'Tool arguments lost');
verify(isset(Features::catalogue()['sitemap.save']) && Features::skill_roots()['pixflow/sitemap/'] === '/pro/sitemap', 'Discovery incomplete');
try { Features::add('planning', static fn() => 'duplicate'); throw new RuntimeException('Duplicate accepted'); } catch (LogicException) {}
echo "Planning contributions: Free denial, Pro discovery, dispatch and asset registration passed.\n";
