<?php

declare(strict_types=1);

$root = __DIR__;
$distDir = $root . DIRECTORY_SEPARATOR . 'dist';
$releaseDir = $distDir . DIRECTORY_SEPARATOR . 'bridge-release';
$zipPath = $distDir . DIRECTORY_SEPARATOR . 'pixflow-design-bridge.zip';
$manifestPath = $releaseDir . DIRECTORY_SEPARATOR . 'latest.json';
$buildStartedAt = time();

function bridge_fail(string $message): never
{
    fwrite(STDERR, "[Pixflow Bridge Build] ERROR: {$message}\n");
    exit(1);
}

function bridge_info(string $message): void
{
    fwrite(STDOUT, "[Pixflow Bridge Build] {$message}\n");
}

function bridge_run(string $command, string $cwd): void
{
    bridge_info($command);
    $process = proc_open($command, [STDIN, STDOUT, STDERR], $pipes, $cwd);
    if (!is_resource($process)) {
        bridge_fail("Unable to start command: {$command}");
    }

    $exitCode = proc_close($process);
    if ($exitCode !== 0) {
        bridge_fail("Command failed with exit code {$exitCode}: {$command}");
    }
}

bridge_run('pnpm bridge:zip', $root);
bridge_run('pnpm bridge:installer', $root);

if (!is_file($zipPath)) {
    bridge_fail("Expected package was not created: {$zipPath}");
}

if (!is_file($manifestPath)) {
    bridge_fail("Expected release manifest was not created: {$manifestPath}");
}

$manifest = json_decode((string) file_get_contents($manifestPath), true);
if (!is_array($manifest)) {
    bridge_fail("Release manifest is not valid JSON: {$manifestPath}");
}

$version = isset($manifest['version']) ? (string) $manifest['version'] : '';
$assetUrl = isset($manifest['assets'][0]['url']) ? (string) $manifest['assets'][0]['url'] : '';
$windowsInstallerUrl = isset($manifest['installers']['windows']) ? (string) $manifest['installers']['windows'] : '';
$versionedInstallerPath = $releaseDir . DIRECTORY_SEPARATOR . 'packages' . DIRECTORY_SEPARATOR . "pixflow-design-bridge-{$version}-win-x64-setup.exe";
$stableInstallerPath = $releaseDir . DIRECTORY_SEPARATOR . 'packages' . DIRECTORY_SEPARATOR . 'pixflow-design-bridge-win-x64-setup.exe';

if ($version === '' || $assetUrl === '') {
    bridge_fail('Release manifest is missing version or package URL.');
}

if ($windowsInstallerUrl === '' || !str_ends_with($windowsInstallerUrl, '.exe')) {
    bridge_fail('Release manifest is missing the Windows setup installer URL.');
}

foreach ([$versionedInstallerPath, $stableInstallerPath] as $installerPath) {
    if (!is_file($installerPath)) {
        bridge_fail("Expected Windows setup installer was not created: {$installerPath}");
    }

    $modifiedAt = filemtime($installerPath);
    if ($modifiedAt === false || $modifiedAt < $buildStartedAt) {
        bridge_fail("Windows setup installer is stale and was not rebuilt during this run: {$installerPath}");
    }
}

if (isset($manifest['resources'])) {
    bridge_fail('Release manifest still advertises bridge-side resource packs. The Local CLI bridge must not ship WP resources.');
}

$zipSize = filesize($zipPath);
bridge_info("Version: {$version}");
bridge_info("Created dist/pixflow-design-bridge.zip ({$zipSize} bytes)");
bridge_info("Created dist/bridge-release/latest.json");
bridge_info("Package URL: {$assetUrl}");
bridge_info("Windows installer URL: {$windowsInstallerUrl}");
bridge_info('Windows installer: dist/bridge-release/packages/' . basename($versionedInstallerPath));
bridge_info('Bridge mode: Local CLI connector only');
