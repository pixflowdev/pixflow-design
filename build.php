<?php

declare(strict_types=1);

$root = __DIR__;
$mainFile = $root . DIRECTORY_SEPARATOR . 'pixflow-design.php';
$readmeFile = $root . DIRECTORY_SEPARATOR . 'readme.txt';
$distDir = $root . DIRECTORY_SEPARATOR . 'dist';
$slug = 'pixflow-ai';
$entryFile = 'pixflow-ai.php';

function fail(string $message): never
{
    fwrite(STDERR, "[Pixflow Build] ERROR: {$message}\n");
    exit(1);
}

function info(string $message): void
{
    fwrite(STDOUT, "[Pixflow Build] {$message}\n");
}

function run_command(string $command, string $cwd, ?array $env = null): void
{
    if ($env !== null) {
        $env = array_filter($env, static fn ($value): bool => is_scalar($value) || $value === null);
        $env = array_map(static fn ($value): string => (string) $value, $env);
    }

    info($command);
    $descriptorSpec = [
        0 => STDIN,
        1 => STDOUT,
        2 => STDERR,
    ];
    $process = proc_open($command, $descriptorSpec, $pipes, $cwd, $env);
    if (!is_resource($process)) {
        fail("Unable to start command: {$command}");
    }
    $exitCode = proc_close($process);
    if ($exitCode !== 0) {
        fail("Command failed with exit code {$exitCode}: {$command}");
    }
}

function read_file_required(string $path): string
{
    if (!is_file($path)) {
        fail("Missing required file: {$path}");
    }
    $contents = file_get_contents($path);
    if ($contents === false) {
        fail("Unable to read file: {$path}");
    }
    return $contents;
}

function remove_file_if_exists(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    if (!unlink($path)) {
        fail("Unable to remove stale package: {$path}");
    }
}

$main = read_file_required($mainFile);
if (!preg_match('/^[ \t]*\*[ \t]*Version:[ \t]*([^\r\n]+)\r?$/mi', $main, $headerMatch)) {
    fail('Unable to find Plugin Header Version in pixflow-design.php');
}
$headerVersion = trim($headerMatch[1]);

if (!preg_match("/define\('PIXFLOW_DESIGN_VERSION',\s*'([^']+)'\);/", $main, $defineMatch)) {
    fail('Unable to find PIXFLOW_DESIGN_VERSION in pixflow-design.php');
}
$defineVersion = trim($defineMatch[1]);

if ($headerVersion !== $defineVersion) {
    fail("Version mismatch: plugin header is {$headerVersion}, PIXFLOW_DESIGN_VERSION is {$defineVersion}");
}

$version = $headerVersion;
info("Version: {$version}");

$sourceZip = $distDir . DIRECTORY_SEPARATOR . $slug . '.zip';
$targetZip = $distDir . DIRECTORY_SEPARATOR . 'pixflow-design-' . $version . '.zip';

// Remove stale installable packages before the build starts. If the build
// fails, there should be no old same-version zip left in dist that can be
// installed by mistake and make a site appear to be on the new bundle.
remove_file_if_exists($sourceZip);
remove_file_if_exists($targetZip);

$readme = read_file_required($readmeFile);
$updatedReadme = preg_replace('/^Stable tag:\s*.*$/m', "Stable tag: {$version}", $readme, 1, $stableCount);
if ($updatedReadme === null || $stableCount !== 1) {
    fail('Unable to update Stable tag in readme.txt');
}

$changelogHeading = "= {$version} =";
if (!preg_match('/^=\s*' . preg_quote($version, '/') . '\s*=\s*$/m', $updatedReadme)) {
    $updatedReadme = preg_replace('/^== Changelog ==\s*$/m', "== Changelog ==\n\n{$changelogHeading}\n* Production package build.", $updatedReadme, 1, $changelogCount);
    if ($updatedReadme === null || $changelogCount !== 1) {
        fail('Unable to add changelog heading in readme.txt');
    }
}

if ($updatedReadme !== $readme) {
    if (file_put_contents($readmeFile, $updatedReadme) === false) {
        fail('Unable to write readme.txt');
    }
    info('Synced readme.txt Stable tag/changelog version.');
}

$env = array_merge($_ENV, $_SERVER, [
    'PIXFLOW_DESIGN_WORDPRESS_PACKAGE_SLUG' => $slug,
    'PIXFLOW_DESIGN_WORDPRESS_ENTRY_FILE' => $entryFile,
]);
run_command('pnpm wordpress:zip', $root, $env);

if (!is_file($sourceZip)) {
    fail("Expected package was not created: {$sourceZip}");
}
if (!copy($sourceZip, $targetZip)) {
    fail("Unable to create versioned package: {$targetZip}");
}

info('Created ' . str_replace($root . DIRECTORY_SEPARATOR, '', $targetZip));
info('Created ' . str_replace($root . DIRECTORY_SEPARATOR, '', $sourceZip));
