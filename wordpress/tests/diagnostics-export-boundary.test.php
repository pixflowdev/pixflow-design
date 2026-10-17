<?php

declare(strict_types=1);

function assert_diagnostics_boundary(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$service = (string) file_get_contents(dirname(__DIR__) . '/src/Diagnostics/DiagnosticsSnapshotService.php');
$archive = (string) file_get_contents(dirname(__DIR__) . '/src/Diagnostics/DiagnosticsArchiveService.php');
$routes = (string) file_get_contents(dirname(__DIR__) . '/src/Http/RestController.php');
$button = (string) file_get_contents(dirname(__DIR__, 2) . '/apps/web/src/components/ExportDiagnosticsButton.tsx');
$daemon = (string) file_get_contents(dirname(__DIR__, 2) . '/apps/daemon/src/diagnostics-export.ts');

assert_diagnostics_boundary(
    str_contains($routes, "'/diagnostics/snapshot'")
        && str_contains($routes, "'permission_callback' => [\$this, 'can_manage_site_settings']"),
    'Site-wide diagnostics must require a WordPress administrator independently of Pro access.'
);
assert_diagnostics_boundary(
    str_contains($service, "'postContentIncluded' => false")
        && str_contains($service, "'promptsIncluded' => false")
        && str_contains($service, "'credentialsIncluded' => false"),
    'The default WordPress snapshot must explicitly exclude content, prompts, and credentials.'
);
assert_diagnostics_boundary(
    str_contains($service, 'ERROR_LOG_TAIL_BYTES')
        && str_contains($service, "stripos(\$line, 'pixflow')"),
    'PHP error evidence must be bounded and filtered to Pixflow lines.'
);
assert_diagnostics_boundary(
    str_contains($routes, "'/diagnostics/prepare'")
        && str_contains($routes, "'/diagnostics/download/(?P<ticket>[a-f0-9]{64})'")
        && str_contains($routes, "'X-Pixflow-Raw-Binary' => '1'")
        && str_contains($button, "pixflowWordPressRestFetch('/diagnostics/prepare'")
        && !str_contains($button, "pixflowOptionalBridgeFetch('pixflow/diagnostics"),
    'WordPress must own a same-origin browser download that works without the optional Bridge.'
);
assert_diagnostics_boundary(
    str_contains($archive, 'TICKET_TTL_SECONDS = 120')
        && str_contains($archive, 'delete_transient($key)')
        && str_contains($archive, 'MAX_ARCHIVE_BYTES = 26214400')
        && str_contains($archive, "'credentialsIncluded' => false"),
    'WordPress diagnostics tickets must be short-lived, one-time, bounded, and privacy explicit.'
);
assert_diagnostics_boundary(
    str_contains($daemon, 'maxZipBytes: 25 * 1024 * 1024')
        && str_contains($daemon, 'maxCollectedBytes: 64 * 1024 * 1024')
        && str_contains($daemon, "privacy: { includeHostIdentity: false }"),
    'Pixflow diagnostics must enforce collection/compressed budgets and omit host identity.'
);
assert_diagnostics_boundary(
    str_contains($daemon, 'buildPixflowRunSummary')
        && str_contains($daemon, "if (event === 'agent' && !['status', 'usage', 'error'].includes(type)) continue"),
    'Pixflow exports must summarize run telemetry without exporting raw conversation deltas.'
);

echo "diagnostics-export-boundary: ok\n";
