<?php

declare(strict_types=1);

$root = dirname(__DIR__, 2);

function resource_pipeline_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "resource-release-pipeline: {$message}\n");
        exit(1);
    }
}

$package = json_decode((string) file_get_contents($root . '/package.json'), true);
$scripts = is_array($package['scripts'] ?? null) ? $package['scripts'] : [];
$pluginZipCommand = (string) ($scripts['wordpress:zip'] ?? '');
resource_pipeline_assert($pluginZipCommand !== '', 'wordpress:zip is missing.');
resource_pipeline_assert(!str_contains($pluginZipCommand, 'wordpress:resources'), 'plugin ZIP must not rebuild resources.');

$pluginBuild = (string) file_get_contents($root . '/build.php');
resource_pipeline_assert(!str_contains($pluginBuild, 'PIXFLOW_DESIGN_RESOURCE_VERSION'), 'plugin build must not set the resource version.');
resource_pipeline_assert(!str_contains($pluginBuild, 'PIXFLOW_DESIGN_MIN_PLUGIN_VERSION'), 'plugin build must not set resource compatibility.');

// Behavior tests for publication, immutability and component isolation live in scripts/pixflow-release.test.ts.
foreach (['plugin', 'bridge', 'resources'] as $component) {
    resource_pipeline_assert(is_file($root . '/scripts/deploy-' . $component . '.ts'), 'TypeScript deployment entry point missing.');
    resource_pipeline_assert(!is_file($root . '/deploy-' . $component . '.php'), 'Legacy deployment path must be retired.');
}
$resourceBuild = (string) file_get_contents($root . '/build-resources.php');
resource_pipeline_assert(str_contains($resourceBuild, 'wordpress:resources'), 'Resource building remains independent of deployment.');
$release = json_decode((string) file_get_contents($root . '/wordpress/resource-packs-release.json'), true);
resource_pipeline_assert(($release['version'] ?? null) === '2.0.2', 'curated resource release must be 2.0.2.');
resource_pipeline_assert(($release['minimumPluginVersion'] ?? null) === '2.0.2', 'curated resource routing requires plugin 2.0.2.');

fwrite(STDOUT, "resource-release-pipeline: ok\n");
