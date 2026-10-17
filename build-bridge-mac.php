<?php

declare(strict_types=1);

$root = __DIR__;
$releaseDir = $root . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'bridge-release';
$manifestPath = $releaseDir . DIRECTORY_SEPARATOR . 'latest.json';
$packageDir = $releaseDir . DIRECTORY_SEPARATOR . 'packages';

function bridge_mac_fail(string $message): never
{
    fwrite(STDERR, "[Pixflow Bridge Mac Build] ERROR: {$message}\n");
    exit(1);
}

function bridge_mac_info(string $message): void
{
    fwrite(STDOUT, "[Pixflow Bridge Mac Build] {$message}\n");
}

function bridge_mac_run(array $command, string $cwd): void
{
    bridge_mac_info(implode(' ', array_map('bridge_mac_shell_label', $command)));

    $processCommand = $command;
    if (DIRECTORY_SEPARATOR === '\\' && in_array(strtolower($command[0]), ['pnpm', 'npm', 'npx', 'corepack'], true)) {
        $processCommand = 'cmd.exe /d /s /c "' . implode(' ', array_map('bridge_mac_cmd_quote', $command)) . '"';
    }

    $process = proc_open($processCommand, [STDIN, STDOUT, STDERR], $pipes, $cwd);
    if (!is_resource($process)) {
        bridge_mac_fail("Unable to start command: {$command[0]}");
    }

    $exitCode = proc_close($process);
    if ($exitCode !== 0) {
        bridge_mac_fail("Command failed with exit code {$exitCode}: " . implode(' ', $command));
    }
}

function bridge_mac_shell_label(string $value): string
{
    return preg_match('/\s/', $value) ? '"' . str_replace('"', '\"', $value) . '"' : $value;
}

function bridge_mac_cmd_quote(string $value): string
{
    return preg_match('/[\s"&<>|^]/', $value) ? '"' . str_replace('"', '\"', $value) . '"' : $value;
}

function bridge_mac_putenv_default(string $key, string $value): void
{
    if (getenv($key) !== false) {
        return;
    }

    putenv("{$key}={$value}");
    $_ENV[$key] = $value;
}

function bridge_mac_read_manifest(string $manifestPath): array
{
    if (!is_file($manifestPath)) {
        bridge_mac_fail("Missing release manifest: {$manifestPath}. Run php build-bridge.php first if you need the full local release manifest.");
    }

    $manifest = json_decode((string) file_get_contents($manifestPath), true);
    if (!is_array($manifest)) {
        bridge_mac_fail("Release manifest is not valid JSON: {$manifestPath}");
    }

    return $manifest;
}

bridge_mac_info('Build on the MacBook Pro, or import its verified DMGs. Nothing will be uploaded.');
$arguments = array_slice($argv, 1);
if (PHP_OS_FAMILY !== 'Darwin' && !$arguments && !getenv('PIXFLOW_DESIGN_MAC_ARM64_DMG') && !getenv('PIXFLOW_DESIGN_MAC_X64_DMG')) {
    bridge_mac_fail('On Windows, pass --arm64 <verified ARM DMG> --x64 <verified Intel DMG>. Build both on the MacBook Pro using MAC-BUILD-HANDOFF.md.');
}
bridge_mac_run(array_merge(['node', 'scripts/build-pixflow-design-bridge-mac-installers.mjs'], $arguments), $root);

$manifest = bridge_mac_read_manifest($manifestPath);
$version = isset($manifest['version']) ? (string) $manifest['version'] : '';
$macArm64InstallerUrl = isset($manifest['installers']['macosArm64']) ? (string) $manifest['installers']['macosArm64'] : '';
$macX64InstallerUrl = isset($manifest['installers']['macosX64']) ? (string) $manifest['installers']['macosX64'] : '';

if ($version === '') {
    bridge_mac_fail('Release manifest is missing version.');
}

if ($macArm64InstallerUrl === '' || !str_ends_with($macArm64InstallerUrl, '.dmg')) {
    bridge_mac_fail('Release manifest is missing the macOS Apple Silicon DMG URL.');
}

$arm64Path = $packageDir . DIRECTORY_SEPARATOR . 'pixflow-design-bridge-mac-arm64.dmg';
$x64Path = $packageDir . DIRECTORY_SEPARATOR . 'pixflow-design-bridge-mac-x64.dmg';
if (!is_file($arm64Path)) {
    bridge_mac_fail("Expected Apple Silicon DMG was not created: {$arm64Path}");
}

bridge_mac_info("Version: {$version}");
bridge_mac_info('Apple Silicon DMG: dist/bridge-release/packages/' . basename($arm64Path));
if ($macX64InstallerUrl !== '' && is_file($x64Path)) {
    bridge_mac_info('Intel DMG: dist/bridge-release/packages/' . basename($x64Path));
} else {
    bridge_mac_info('No Intel x64 DMG found. Apple Silicon is ready; build the Intel DMG on the MacBook Pro and import it with --x64.');
}
bridge_mac_info('Updated local dist/bridge-release/latest.json with macOS installer entries.');
bridge_mac_info('No deploy was performed.');
