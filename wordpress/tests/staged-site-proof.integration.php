<?php
declare(strict_types=1);
// CLI only; credential path/state supplied through environment, never exposed by the router.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/fixtures/trial-site-proof-bootstrap.php';
use PixflowDesign\WordPress\License\LicenseService;
use PixflowDesign\WordPress\License\CentralEntitlements;
use PixflowDesign\WordPress\License\InstallationRecovery;
try {
    $phase = $argv[1] ?? 'active';
    if (!in_array($phase, ['active', 'recovery-prepare', 'recovery-complete', 'expired', 'paid'], true)) throw new RuntimeException('Unknown phase');
    $fixture = $GLOBALS['qaFixture'];
    $previous = get_option('pixflow_design_central_entitlements_v2', []);
    if (get_option('qa_saved_content') === false) update_option('qa_saved_content', ['page' => 'Preserve this content', 'theme' => 'dark']);
    $content = get_option('qa_saved_content');
    if ($phase === 'recovery-prepare') {
        $prepared = (new InstallationRecovery())->prepare(new WP_REST_Request(['license_key' => $fixture['licenseKey']]));
        if (!$prepared instanceof WP_REST_Response || empty($prepared->data['ok'])) throw new RuntimeException('Recovery preparation failed');
        // Website test runner submits this public request to its authenticated account
        // endpoint. Private installation material remains only in the option store.
        $path = $GLOBALS['qaDirectory'] . '/recovery-request.json';
        file_put_contents($path, json_encode($prepared->data['request'], JSON_THROW_ON_ERROR)); chmod($path, 0600);
        if ($previous !== get_option('pixflow_design_central_entitlements_v2', [])) throw new RuntimeException('Recovery preparation replaced active identity');
    } elseif ($phase === 'recovery-complete') {
        $pending = get_option('pixflow_design_installation_recovery_v1', []);
        if (empty($pending['id'])) throw new RuntimeException('Prepare and approve recovery first');
        $completed = (new InstallationRecovery())->complete(new WP_REST_Request(['installation_id' => $pending['id']]));
        if (!$completed instanceof WP_REST_Response || empty($completed->data['ok'])) throw new RuntimeException('Recovery completion failed: ' . ($completed instanceof WP_Error ? $completed->code : 'unknown'));
        $current = get_option('pixflow_design_central_entitlements_v2', []);
        if (($current['installation']['id'] ?? '') !== $pending['id'] || ($current['installation']['thumbprint'] ?? '') !== $pending['thumbprint']
            || ($current['installation']['id'] ?? '') === ($previous['installation']['id'] ?? '')) throw new RuntimeException('Recovery did not rotate to approved key');
        if (($current['license_id'] ?? '') !== $fixture['licenseId'] || !(new CentralEntitlements())->allows('wordpress:mutate')) throw new RuntimeException('Recovered licence access missing');
        if (get_option('pixflow_design_installation_recovery_v1', null) !== null) throw new RuntimeException('Recovery candidate was not cleaned up');
    } elseif ($phase === 'expired') {
        if (empty($previous['installation']['id'])) throw new RuntimeException('Activate before expiry check');
        $client = new CentralEntitlements(); $client->refresh();
        $status = (new LicenseService())->status();
        if ($client->allows('wordpress:mutate') || !empty($status['pro']['eligible'])) throw new RuntimeException('Expired trial retained Pro access');
        if (empty($status['runtime_ready']) || !empty($status['requires_license'])) throw new RuntimeException('Expiry blocked Free');
        if (($previous['installation'] ?? null) !== (get_option('pixflow_design_central_entitlements_v2', [])['installation'] ?? null)) throw new RuntimeException('Expiry replaced installation identity');
    } else {
        $status = (new LicenseService())->validate($fixture['licenseKey']);
    $current = get_option('pixflow_design_central_entitlements_v2', []);
    if (empty($status['valid']) || !(new CentralEntitlements())->allows('wordpress:mutate')) throw new RuntimeException('Activation denied: ' . ($status['last_error'] ?? $status['central_entitlement']['code'] ?? 'unknown'));
    if (($current['license_id'] ?? '') !== $fixture['licenseId']) throw new RuntimeException('Licence identity changed');
    if (!empty($previous['installation']['id']) && $previous['installation']['id'] !== $current['installation']['id']) throw new RuntimeException('Installation changed on repeat activation');
        if ($phase === 'paid' && empty($status['pro']['eligible'])) throw new RuntimeException('Conversion did not restore Pro');
    }
    if (get_option('qa_saved_content') !== $content) throw new RuntimeException('Content fixture changed');
    echo json_encode(['passed' => true, 'phase' => $phase, 'real_staging_https' => true, 'real_wordpress' => false, 'persistent_isolated_php_harness' => true,
        'repeat_identity_preserved' => !empty($previous), 'requests' => $GLOBALS['requests']], JSON_UNESCAPED_SLASHES) . "\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n" . json_encode($GLOBALS['requests'], JSON_UNESCAPED_SLASHES) . "\n"); exit(1);
}
