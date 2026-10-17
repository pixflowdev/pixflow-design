<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$releaseDir = $root . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'bridge-release';
$packageDir = $releaseDir . DIRECTORY_SEPARATOR . 'packages';
$workflowFile = 'pixflow-bridge-mac.yml';
$token = getenv('PIXFLOW_DESIGN_GITHUB_TOKEN') ?: (getenv('GH_TOKEN') ?: getenv('GITHUB_TOKEN'));
$requireMac = (string) getenv('PIXFLOW_DESIGN_REQUIRE_MAC_DMG') === '1';
$disableGithubBuild = (string) getenv('PIXFLOW_DESIGN_SKIP_GITHUB_MAC_BUILD') === '1';
$allowDirty = (string) getenv('PIXFLOW_DESIGN_ALLOW_DIRTY_GITHUB_MAC_BUILD') === '1';

function ghmac_info(string $message): void
{
    fwrite(STDOUT, "[Pixflow Bridge macOS CI] {$message}\n");
}

function ghmac_fail(string $message): never
{
    fwrite(STDERR, "[Pixflow Bridge macOS CI] ERROR: {$message}\n");
    exit(1);
}

function ghmac_run(array $command, string $cwd): string
{
    $process = proc_open($command, [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $pipes, $cwd);

    if (!is_resource($process)) {
        ghmac_fail("Unable to start command: {$command[0]}");
    }

    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($exitCode !== 0) {
        ghmac_fail("Command failed with exit code {$exitCode}: " . implode(' ', $command) . "\n{$stderr}");
    }

    return trim((string) $stdout);
}

function ghmac_parse_repo(string $remote): array
{
    $remote = trim($remote);
    if (preg_match('/github\.com[:\/]([^\/]+)\/([^\/\.]+)(?:\.git)?$/', $remote, $matches)) {
        return [$matches[1], $matches[2]];
    }
    ghmac_fail("Could not parse GitHub repository from origin remote: {$remote}");
}

function ghmac_request(string $method, string $url, string $token, ?array $payload = null, bool $json = true): mixed
{
    $headers = [
        'User-Agent: Pixflow-Design-Bridge-Release',
        'Authorization: Bearer ' . $token,
        'Accept: application/vnd.github+json',
        'X-GitHub-Api-Version: 2022-11-28',
    ];

    $options = [
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'ignore_errors' => true,
            'follow_location' => 1,
            'max_redirects' => 10,
            'timeout' => 120,
        ],
    ];

    if ($payload !== null) {
        $options['http']['header'] .= "\r\nContent-Type: application/json";
        $options['http']['content'] = json_encode($payload, JSON_THROW_ON_ERROR);
    }

    $context = stream_context_create($options);
    $body = file_get_contents($url, false, $context);
    $statusLine = $http_response_header[0] ?? '';
    preg_match('/\s(\d{3})\s/', $statusLine, $matches);
    $status = isset($matches[1]) ? (int) $matches[1] : 0;

    if ($body === false || $status < 200 || $status >= 300) {
        $preview = is_string($body) ? substr($body, 0, 500) : '';
        ghmac_fail("GitHub API request failed ({$status}) {$method} {$url}\n{$preview}");
    }

    if (!$json) {
        return $body;
    }

    if ($body === '') {
        return null;
    }

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        ghmac_fail("GitHub API response was not valid JSON: {$url}");
    }

    return $decoded;
}

function ghmac_stable_dmg_exists(string $packageDir, string $arch): bool
{
    return is_file($packageDir . DIRECTORY_SEPARATOR . "pixflow-design-bridge-mac-{$arch}.dmg");
}

function ghmac_find_files(string $dir, string $extension): array
{
    $files = [];
    if (!is_dir($dir)) {
        return $files;
    }

    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if ($file->isFile() && strtolower($file->getExtension()) === strtolower($extension)) {
            $files[] = $file->getPathname();
        }
    }

    return $files;
}

function ghmac_extract_zip(string $zipPath, string $destination): void
{
    $zip = new ZipArchive();
    $openResult = $zip->open($zipPath);
    if ($openResult !== true) {
        ghmac_fail("Could not open artifact zip: {$zipPath}");
    }

    if (!$zip->extractTo($destination)) {
        $zip->close();
        ghmac_fail("Could not extract artifact zip: {$zipPath}");
    }

    $zip->close();
}

if ($disableGithubBuild) {
    ghmac_info('GitHub macOS build skipped by PIXFLOW_DESIGN_SKIP_GITHUB_MAC_BUILD=1.');
    exit(0);
}

if (!is_dir($packageDir) && !mkdir($packageDir, 0777, true) && !is_dir($packageDir)) {
    ghmac_fail("Could not create package directory: {$packageDir}");
}

$explicitArm64 = getenv('PIXFLOW_DESIGN_MAC_ARM64_DMG');
$explicitX64 = getenv('PIXFLOW_DESIGN_MAC_X64_DMG');
$hasArm64 = $explicitArm64 !== false && $explicitArm64 !== '' || ghmac_stable_dmg_exists($packageDir, 'arm64');
$hasX64 = $explicitX64 !== false && $explicitX64 !== '' || ghmac_stable_dmg_exists($packageDir, 'x64');

if ($hasArm64 && $hasX64) {
    ghmac_info('macOS DMGs already provided locally; GitHub build not needed.');
    exit(0);
}

if (!$token) {
    $message = 'No GitHub token found. Set PIXFLOW_DESIGN_GITHUB_TOKEN or GH_TOKEN to build macOS DMGs online.';
    if ($requireMac) {
        ghmac_fail($message);
    }
    ghmac_info($message . ' Continuing without online macOS artifacts.');
    exit(0);
}

$remote = ghmac_run(['git', 'config', '--get', 'remote.origin.url'], $root);
[$owner, $repo] = ghmac_parse_repo($remote);
$branch = getenv('PIXFLOW_DESIGN_GITHUB_REF') ?: ghmac_run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], $root);
if ($branch === 'HEAD' || $branch === '') {
    ghmac_fail('Set PIXFLOW_DESIGN_GITHUB_REF to a branch or tag before triggering online macOS builds from a detached HEAD.');
}

$dirty = ghmac_run(['git', 'status', '--porcelain'], $root);
if ($dirty !== '' && !$allowDirty) {
    ghmac_fail('The worktree has uncommitted changes. Commit and push before online macOS builds, or set PIXFLOW_DESIGN_ALLOW_DIRTY_GITHUB_MAC_BUILD=1 if you intentionally want GitHub to build the pushed ref only.');
}

$localSha = ghmac_run(['git', 'rev-parse', 'HEAD'], $root);
$remoteShaLine = ghmac_run(['git', 'ls-remote', 'origin', 'refs/heads/' . $branch], $root);
if ($remoteShaLine === '') {
    ghmac_fail("Branch '{$branch}' was not found on origin. Push it before online macOS builds.");
}
$remoteSha = preg_split('/\s+/', $remoteShaLine)[0] ?? '';
if ($remoteSha !== $localSha) {
    ghmac_fail("Local HEAD {$localSha} does not match origin/{$branch} {$remoteSha}. Push the current commit before online macOS builds.");
}

$apiBase = "https://api.github.com/repos/{$owner}/{$repo}";
$dispatchUrl = "{$apiBase}/actions/workflows/{$workflowFile}/dispatches";
$startedAt = time();
ghmac_info("Dispatching {$workflowFile} on {$owner}/{$repo}@{$branch}.");
ghmac_request('POST', $dispatchUrl, $token, ['ref' => $branch]);

$timeout = (int) (getenv('PIXFLOW_DESIGN_GITHUB_MAC_TIMEOUT_SECONDS') ?: 3600);
$deadline = time() + max(300, $timeout);
$run = null;

while (time() < $deadline) {
    sleep(15);
    $runs = ghmac_request('GET', "{$apiBase}/actions/workflows/{$workflowFile}/runs?event=workflow_dispatch&branch=" . rawurlencode($branch) . '&per_page=20', $token);
    foreach (($runs['workflow_runs'] ?? []) as $candidate) {
        $createdAt = strtotime((string) ($candidate['created_at'] ?? '')) ?: 0;
        if (($candidate['head_sha'] ?? '') !== $remoteSha || $createdAt < $startedAt - 120) {
            continue;
        }
        $run = $candidate;
        break;
    }

    if (!$run) {
        ghmac_info('Waiting for GitHub macOS workflow run to appear...');
        continue;
    }

    $status = (string) ($run['status'] ?? '');
    $conclusion = (string) ($run['conclusion'] ?? '');
    $url = (string) ($run['html_url'] ?? '');
    ghmac_info("Workflow run #{$run['run_number']} status={$status}" . ($conclusion !== '' ? " conclusion={$conclusion}" : '') . ($url !== '' ? " {$url}" : ''));

    if ($status === 'completed') {
        if ($conclusion !== 'success') {
            ghmac_fail("macOS workflow completed with conclusion '{$conclusion}': {$url}");
        }
        break;
    }

    $run = ghmac_request('GET', "{$apiBase}/actions/runs/{$run['id']}", $token);
}

if (!$run || ($run['status'] ?? '') !== 'completed') {
    ghmac_fail("Timed out waiting for macOS workflow after {$timeout} seconds.");
}

$artifacts = ghmac_request('GET', "{$apiBase}/actions/runs/{$run['id']}/artifacts?per_page=100", $token);
$downloadRoot = $root . DIRECTORY_SEPARATOR . 'dist' . DIRECTORY_SEPARATOR . 'bridge-mac-github-artifacts';
if (!is_dir($downloadRoot) && !mkdir($downloadRoot, 0777, true) && !is_dir($downloadRoot)) {
    ghmac_fail("Could not create artifact directory: {$downloadRoot}");
}

$downloaded = [];
foreach (($artifacts['artifacts'] ?? []) as $artifact) {
    $name = (string) ($artifact['name'] ?? '');
    if (!str_starts_with($name, 'pixflow-design-bridge-mac-')) {
        continue;
    }

    $zipPath = $downloadRoot . DIRECTORY_SEPARATOR . $name . '.zip';
    $extractDir = $downloadRoot . DIRECTORY_SEPARATOR . $name;
    ghmac_info("Downloading artifact {$name}.");
    $archive = ghmac_request('GET', (string) $artifact['archive_download_url'], $token, null, false);
    file_put_contents($zipPath, $archive);
    ghmac_extract_zip($zipPath, $extractDir);

    foreach (ghmac_find_files($extractDir, 'dmg') as $dmgPath) {
        $target = $packageDir . DIRECTORY_SEPARATOR . basename($dmgPath);
        if (!copy($dmgPath, $target)) {
            ghmac_fail("Could not copy {$dmgPath} to {$target}");
        }
        $downloaded[] = $target;
        ghmac_info('Prepared ' . str_replace($root . DIRECTORY_SEPARATOR, '', $target));
    }
}

$hasArm64 = ghmac_stable_dmg_exists($packageDir, 'arm64');
$hasX64 = ghmac_stable_dmg_exists($packageDir, 'x64');
if (!$hasArm64 || !$hasX64) {
    ghmac_fail('GitHub macOS workflow did not produce both stable arm64 and x64 DMGs.');
}

ghmac_info('Downloaded macOS DMGs from GitHub Actions.');
