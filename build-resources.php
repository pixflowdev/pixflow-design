<?php

declare(strict_types=1);

$root = __DIR__;
$releaseFile = $root . DIRECTORY_SEPARATOR . 'wordpress' . DIRECTORY_SEPARATOR . 'resource-packs-release.json';
$outputDir = $root . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'wordpress-resource-packs';

function resource_build_fail(string $message): never
{
    fwrite(STDERR, "[Pixflow Resource Build] ERROR: {$message}\n");
    exit(1);
}

function resource_build_info(string $message): void
{
    fwrite(STDOUT, "[Pixflow Resource Build] {$message}\n");
}

function resource_build_run(array $command, string $cwd): void
{
    resource_build_info(implode(' ', $command));
    $processCommand = $command;
    if (DIRECTORY_SEPARATOR === '\\' && in_array(strtolower($command[0]), ['pnpm', 'npm', 'npx', 'corepack'], true)) {
        $quoted = array_map(static fn (string $value): string => preg_match('/[\s"&<>|^]/', $value)
            ? '"' . str_replace('"', '\\"', $value) . '"'
            : $value, $command);
        $processCommand = 'cmd.exe /d /s /c "' . implode(' ', $quoted) . '"';
    }
    $process = proc_open($processCommand, [STDIN, STDOUT, STDERR], $pipes, $cwd);
    if (!is_resource($process)) {
        resource_build_fail("Unable to start command: {$command[0]}");
    }
    $exitCode = proc_close($process);
    if ($exitCode !== 0) {
        resource_build_fail("Command failed with exit code {$exitCode}: " . implode(' ', $command));
    }
}

function resource_build_read_json(string $path): array
{
    if (!is_file($path)) {
        resource_build_fail("Missing JSON file: {$path}");
    }
    $data = json_decode((string) file_get_contents($path), true);
    if (!is_array($data)) {
        resource_build_fail("Invalid JSON file: {$path}");
    }
    return $data;
}

$release = resource_build_read_json($releaseFile);
$version = trim((string) ($release['version'] ?? ''));
$minimumPluginVersion = trim((string) ($release['minimumPluginVersion'] ?? ''));
if ($version === '' || $minimumPluginVersion === '') {
    resource_build_fail('Resource release config must declare version and minimumPluginVersion.');
}

resource_build_info("Resource release {$version}; minimum plugin {$minimumPluginVersion}.");
resource_build_run(['pnpm', 'wordpress:resources'], $root);

$manifest = resource_build_read_json($outputDir . DIRECTORY_SEPARATOR . 'latest.json');
if ((string) ($manifest['minimumPluginVersion'] ?? '') !== $minimumPluginVersion) {
    resource_build_fail('Built manifest minimumPluginVersion does not match the resource release config.');
}

$packs = is_array($manifest['packs'] ?? null) ? $manifest['packs'] : [];
$packsBySlug = [];
foreach ($packs as $pack) {
    if (!is_array($pack)) {
        continue;
    }
    $slug = (string) ($pack['slug'] ?? '');
    if ($slug !== '') {
        $packsBySlug[$slug] = $pack;
    }
}

foreach (['plugins', 'design-templates', 'design-systems'] as $slug) {
    $pack = $packsBySlug[$slug] ?? null;
    if (!is_array($pack)) {
        resource_build_fail("Built manifest is missing required pack: {$slug}");
    }
    if ((string) ($pack['version'] ?? '') !== $version) {
        resource_build_fail("Pack {$slug} does not use configured resource version {$version}.");
    }
    if ((string) ($pack['compatibility']['minPluginVersion'] ?? '') !== $minimumPluginVersion) {
        resource_build_fail("Pack {$slug} has the wrong minimum plugin version.");
    }
    $archiveUrl = (string) ($pack['archiveUrl'] ?? '');
    $archivePath = parse_url($archiveUrl, PHP_URL_PATH);
    $archiveName = is_string($archivePath) ? basename($archivePath) : '';
    $localArchive = $outputDir . DIRECTORY_SEPARATOR . 'packages' . DIRECTORY_SEPARATOR . $archiveName;
    if ($archiveName === '' || !is_file($localArchive)) {
        resource_build_fail("Missing archive for pack {$slug}.");
    }
    $expectedChecksum = preg_replace('/^sha256:/', '', (string) ($pack['checksum'] ?? ''));
    $actualChecksum = hash_file('sha256', $localArchive);
    if (!is_string($actualChecksum) || !hash_equals((string) $expectedChecksum, $actualChecksum)) {
        resource_build_fail("Checksum mismatch for pack {$slug}.");
    }
    resource_build_info("Verified {$archiveName} ({$actualChecksum}).");
}

resource_build_info('Resource packs are ready in dist/wordpress-resource-packs.');
