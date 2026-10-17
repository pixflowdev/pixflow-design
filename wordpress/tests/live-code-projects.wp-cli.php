<?php

use PixflowDesign\WordPress\Admin\WpAdminCapabilityRegistry;
use PixflowDesign\WordPress\Admin\WpAdminCapabilitySafetyPlane;

if (!defined('WP_CLI') || !WP_CLI) {
    throw new RuntimeException('Run this harness through WP-CLI.');
}

$registry = new WpAdminCapabilityRegistry();
$plane = new WpAdminCapabilitySafetyPlane($registry);
$session = 'phase12-live-' . wp_generate_uuid4();
$evidence = [];

$run = static function (string $capability_id, array $arguments) use ($plane, $session, &$evidence): array {
    $request = [
        'surface' => 'wp_admin', 'sessionId' => $session, 'mode' => 'design',
        'capabilityId' => $capability_id, 'arguments' => $arguments,
    ];
    $approval = $plane->request_approval($request);
    if ($approval instanceof WP_Error) throw new RuntimeException($capability_id . ' approval failed: ' . $approval->get_error_code() . ' ' . $approval->get_error_message());
    $request['approvalToken'] = (string) $approval['approval']['token'];
    $request['idempotencyKey'] = 'phase12-' . hash('sha256', $capability_id . wp_json_encode($arguments));
    $execution = $plane->execute($request);
    if ($execution instanceof WP_Error) throw new RuntimeException($capability_id . ' execution failed: ' . $execution->get_error_code() . ' ' . $execution->get_error_message());
    $evidence[] = [
        'capabilityId' => $capability_id,
        'operationId' => $execution['operation']['operationId'] ?? null,
        'status' => $execution['operation']['status'] ?? null,
        'afterFingerprint' => $execution['operation']['afterFingerprint'] ?? null,
        'internalPathRedacted' => ($execution['result']['internalPath']['redacted'] ?? false) === true,
        'beforeContentRedacted' => !isset($execution['result']['beforeContent']) || ($execution['result']['beforeContent']['redacted'] ?? false) === true,
    ];
    return $execution;
};

$rollback = static function (array $execution) use ($plane, &$evidence): void {
    $result = $plane->rollback([
        'operationId' => (string) $execution['operation']['operationId'],
        'expectedAfterFingerprint' => (string) $execution['operation']['afterFingerprint'],
        'reason' => 'phase12_live_cleanup',
    ]);
    if ($result instanceof WP_Error || ($result['status'] ?? '') !== 'rolled_back') {
        $code = $result instanceof WP_Error ? $result->get_error_code() : (string) ($result['status'] ?? 'unknown');
        throw new RuntimeException('Rollback failed: ' . $code);
    }
    $evidence[] = ['rollbackOperationId' => $execution['operation']['operationId'], 'status' => 'rolled_back'];
};

$parent = sanitize_key((string) get_option('template'));
$child_slug = 'pixflow-phase12-child';
$plugin_slug = 'pixflow-phase12-plugin';
$mu_slug = 'pixflow-phase12-mu';

foreach ([get_theme_root() . '/' . $child_slug, WP_PLUGIN_DIR . '/' . $plugin_slug, WPMU_PLUGIN_DIR . '/' . $mu_slug . '.php'] as $fixture) {
    if (file_exists($fixture)) throw new RuntimeException('Fixture already exists; refusing to overwrite: ' . basename($fixture));
}

$ask_refusal = $plane->request_approval([
    'surface' => 'wp_admin', 'sessionId' => $session, 'mode' => 'ask',
    'capabilityId' => 'pixflow/wp-admin/code/create-plugin',
    'arguments' => ['slug' => 'never-created', 'name' => 'Never Created', 'content' => ''],
]);
if (!$ask_refusal instanceof WP_Error || !in_array($ask_refusal->get_error_code(), ['mode_not_allowed', 'mode_forbids_mutation'], true)) {
    throw new RuntimeException('Ask mode did not refuse a code-project mutation.');
}
$evidence[] = ['askMutationRefused' => true, 'code' => $ask_refusal->get_error_code()];

$child = $run('pixflow/wp-admin/code/create-child-theme', [
    'parentSlug' => $parent, 'slug' => $child_slug, 'name' => 'Pixflow Phase 12 Child',
]);
$child_file = $run('pixflow/wp-admin/code/write-child-theme-file', [
    'slug' => $child_slug, 'file' => 'assets/phase12.css', 'content' => ".phase12-fixture { color: inherit; }\n", 'expectedFingerprint' => 'absent',
]);
$rollback($child_file);
$rollback($child);

$plugin = $run('pixflow/wp-admin/code/create-plugin', [
    'slug' => $plugin_slug, 'name' => 'Pixflow Phase 12 Plugin',
    'content' => "add_action('init', static function (): void {});",
]);
$plugin_file = $run('pixflow/wp-admin/code/write-plugin-file', [
    'slug' => $plugin_slug, 'file' => 'assets/phase12.js', 'content' => "window.PixflowPhase12 = true;\n", 'expectedFingerprint' => 'absent',
]);
$rollback($plugin_file);
$rollback($plugin);

$mu = $run('pixflow/wp-admin/code/create-mu-plugin', [
    'slug' => $mu_slug, 'name' => 'Pixflow Phase 12 MU',
    'content' => "add_action('init', static function (): void {});",
]);
$rollback($mu);

$unsafe_request = [
    'surface' => 'wp_admin', 'sessionId' => $session, 'mode' => 'design',
    'capabilityId' => 'pixflow/wp-admin/code/create-plugin',
    'arguments' => ['slug' => 'pixflow-phase12-unsafe', 'name' => 'Unsafe', 'content' => 'eval($_GET["code"]);'],
];
$unsafe_approval = $plane->request_approval($unsafe_request);
if ($unsafe_approval instanceof WP_Error) throw new RuntimeException('Unsafe fixture approval unexpectedly failed before source validation.');
$unsafe_request['approvalToken'] = $unsafe_approval['approval']['token'];
$unsafe_request['idempotencyKey'] = 'phase12-unsafe-' . wp_generate_uuid4();
$unsafe = $plane->execute($unsafe_request);
if (!$unsafe instanceof WP_Error || $unsafe->get_error_code() !== 'php_construct_not_allowed' || is_dir(WP_PLUGIN_DIR . '/pixflow-phase12-unsafe')) {
    throw new RuntimeException('Unsafe PHP was not rejected before project creation.');
}
$evidence[] = ['unsafePhpRefused' => true, 'code' => $unsafe->get_error_code()];

echo wp_json_encode([
    'ok' => true,
    'parentTheme' => $parent,
    'capabilityCount' => count(array_filter($registry->capabilities(), static fn(array $capability): bool => str_starts_with((string) $capability['id'], 'pixflow/wp-admin/code/'))),
    'fixturesClean' => !is_dir(get_theme_root() . '/' . $child_slug) && !is_dir(WP_PLUGIN_DIR . '/' . $plugin_slug) && !is_file(WPMU_PLUGIN_DIR . '/' . $mu_slug . '.php'),
    'evidence' => $evidence,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
