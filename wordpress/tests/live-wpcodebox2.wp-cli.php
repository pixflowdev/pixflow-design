<?php

use PixflowDesign\WordPress\Admin\WpAdminCapabilityRegistry;
use PixflowDesign\WordPress\Admin\WpAdminCapabilitySafetyPlane;

if (!defined('WP_CLI') || !WP_CLI) throw new RuntimeException('Run through WP-CLI.');
if (!defined('WPCODEBOX2_VERSION')) throw new RuntimeException('WPCodeBox 2 must be active.');
wp_set_current_user(1);
if (!current_user_can('manage_options')) throw new RuntimeException('The live harness requires an administrator fixture.');

$registry = new WpAdminCapabilityRegistry();
$plane = new WpAdminCapabilitySafetyPlane($registry);
$session = 'phase13-' . wp_generate_uuid4();
$nonce = substr(str_replace('-', '', wp_generate_uuid4()), 0, 10);
$evidence = [];

$read = static function (string $id, array $arguments = []) use ($plane, $session): array {
    $response = $plane->execute(['surface' => 'wp_admin', 'sessionId' => $session, 'mode' => 'ask', 'capabilityId' => $id, 'arguments' => $arguments, 'idempotencyKey' => wp_generate_uuid4()]);
    if ($response instanceof WP_Error) throw new RuntimeException($id . ': ' . $response->get_error_code() . ' ' . $response->get_error_message());
    return (array) ($response['result'] ?? []);
};
$run = static function (string $id, array $arguments) use ($plane, $session, &$evidence): array {
    $request = ['surface' => 'wp_admin', 'sessionId' => $session, 'mode' => 'design', 'capabilityId' => $id, 'arguments' => $arguments];
    $approval = $plane->request_approval($request);
    if ($approval instanceof WP_Error) throw new RuntimeException($id . ' approval: ' . $approval->get_error_code() . ' ' . $approval->get_error_message());
    $request['approvalToken'] = $approval['approval']['token'];
    $request['idempotencyKey'] = wp_generate_uuid4();
    $response = $plane->execute($request);
    if ($response instanceof WP_Error) throw new RuntimeException($id . ' execution: ' . $response->get_error_code() . ' ' . $response->get_error_message());
    $evidence[] = ['capabilityId' => $id, 'status' => $response['operation']['status'] ?? null, 'beforeRecordRedacted' => !isset($response['result']['rollback']['beforeRecord']) || ($response['result']['rollback']['beforeRecord']['redacted'] ?? false) === true];
    return $response;
};
$rollback = static function (array $response) use ($plane, &$evidence): void {
    $result = $plane->rollback(['operationId' => (string) $response['operation']['operationId'], 'expectedAfterFingerprint' => (string) $response['operation']['afterFingerprint']]);
    if ($result instanceof WP_Error || ($result['status'] ?? '') !== 'rolled_back') throw new RuntimeException('Rollback failed.');
    $evidence[] = ['rollback' => $response['operation']['operationId']];
};
$refuse = static function (array $arguments, string $expected) use ($plane, $session, &$evidence): void {
    $request = ['surface' => 'wp_admin', 'sessionId' => $session, 'mode' => 'design', 'capabilityId' => 'pixflow/wp-admin/wpcodebox2/create-snippet', 'arguments' => $arguments];
    $approval = $plane->request_approval($request);
    if ($approval instanceof WP_Error) {
        if ($approval->get_error_code() !== $expected) throw new RuntimeException('Unexpected approval refusal: ' . $approval->get_error_code());
        $evidence[] = ['refused' => $expected, 'at' => 'approval'];
        return;
    }
    $request['approvalToken'] = $approval['approval']['token'];
    $request['idempotencyKey'] = wp_generate_uuid4();
    $response = $plane->execute($request);
    if (!$response instanceof WP_Error || $response->get_error_code() !== $expected) throw new RuntimeException('Expected refusal: ' . $expected);
    $evidence[] = ['refused' => $expected, 'at' => 'execution'];
};

$setup = $read('pixflow/wp-admin/wpcodebox2/setup');
if (($setup['integration'] ?? '') !== 'wpcodebox2' || count((array) ($setup['snippetTypes'] ?? [])) !== 12) throw new RuntimeException('Setup metadata is incomplete.');

$types = [
    'php' => 'add_filter("the_content", static fn($value) => $value);',
    'css' => '.pixflow-phase13 { color: inherit; }',
    'scss' => '$phase13: inherit; .pixflow-phase13 { color: $phase13; }',
    'less' => '@phase13: inherit; .pixflow-phase13 { color: @phase13; }',
    'scssp' => '$phase13-partial: inherit;',
    'js' => 'window.PixflowPhase13 = true;',
    'html' => '<div class="pixflow-phase13">Phase 13</div>',
    'ex_css' => '', 'ex_js' => '', 'txt' => 'Phase 13 text', 'md' => '# Phase 13', 'json' => '{"phase":13}',
];
$created = [];
foreach ($types as $type => $code) {
    $arguments = ['title' => 'Pixflow Phase 13 ' . strtoupper($type) . ' ' . $nonce, 'codeType' => $type, 'code' => $code, 'runType' => 'always'];
    if (in_array($type, ['ex_css', 'ex_js'], true)) $arguments['externalUrl'] = 'https://example.com/phase13.' . ($type === 'ex_css' ? 'css' : 'js');
    if ($type === 'scssp') $arguments['renderType'] = 'none';
    $created[$type] = $run('pixflow/wp-admin/wpcodebox2/create-snippet', $arguments);
    $created_snippet = (array) ($created[$type]['result']['snippet'] ?? []);
    if (($created_snippet['enabled'] ?? true) !== false) throw new RuntimeException($type . ' was not created disabled.');
    if (($created_snippet['title'] ?? '') !== $arguments['title'] || ($created_snippet['codeType'] ?? '') !== $type || ($created_snippet['runType'] ?? '') !== 'always') {
        throw new RuntimeException($type . ' did not persist the reviewed definition.');
    }
    $persisted = $read('pixflow/wp-admin/wpcodebox2/get-snippet', ['snippetId' => (int) $created_snippet['id']]);
    if (($persisted['snippet']['code'] ?? null) !== $code) throw new RuntimeException($type . ' source did not round-trip.');
}

$css = $created['css'];
$css_id = (int) $css['result']['snippet']['id'];
$updated = $run('pixflow/wp-admin/wpcodebox2/update-snippet', ['snippetId' => $css_id, 'description' => 'Updated by live harness.', 'code' => '.pixflow-phase13 { color: currentColor; }', 'expectedFingerprint' => (string) $css['result']['snippet']['fingerprint']]);
$rollback($updated);

$current = $read('pixflow/wp-admin/wpcodebox2/get-snippet', ['snippetId' => $css_id]);
$conditioned = $run('pixflow/wp-admin/wpcodebox2/set-snippet-conditions', ['snippetId' => $css_id, 'conditions' => [['conditions' => [['type' => 'location', 'operator' => 'frontend'], ['type' => 'post_type', 'operator' => 'is', 'value' => ['post']]]]], 'expectedFingerprint' => (string) $current['fingerprint']]);
$current = $read('pixflow/wp-admin/wpcodebox2/get-snippet', ['snippetId' => $css_id]);
if (count((array) ($current['snippet']['conditions'] ?? [])) !== 1) throw new RuntimeException('Conditions were not written.');
$cleared = $run('pixflow/wp-admin/wpcodebox2/set-snippet-conditions', ['snippetId' => $css_id, 'conditions' => [], 'expectedFingerprint' => (string) $current['fingerprint']]);
$rollback($cleared);
$rollback($conditioned);

$current = $read('pixflow/wp-admin/wpcodebox2/get-snippet', ['snippetId' => $css_id]);
$enabled = $run('pixflow/wp-admin/wpcodebox2/set-snippet-status', ['snippetId' => $css_id, 'enabled' => true, 'expectedFingerprint' => (string) $current['fingerprint']]);
if (($enabled['result']['snippet']['enabled'] ?? false) !== true) throw new RuntimeException('Status enable failed.');
$rollback($enabled);
foreach ($created as $response) $rollback($response);

$delete_fixture = $run('pixflow/wp-admin/wpcodebox2/create-snippet', ['title' => 'Pixflow Phase 13 Delete ' . $nonce, 'codeType' => 'txt', 'code' => 'Delete me', 'runType' => 'never']);
$stale_request = ['surface' => 'wp_admin', 'sessionId' => $session, 'mode' => 'design', 'capabilityId' => 'pixflow/wp-admin/wpcodebox2/delete-snippet', 'arguments' => ['snippetId' => (int) $delete_fixture['result']['snippet']['id'], 'expectedFingerprint' => str_repeat('0', 64)]];
$stale_approval = $plane->request_approval($stale_request);
if ($stale_approval instanceof WP_Error) throw new RuntimeException('Stale-fingerprint approval unexpectedly failed: ' . $stale_approval->get_error_code());
$stale_request['approvalToken'] = $stale_approval['approval']['token'];
$stale_request['idempotencyKey'] = wp_generate_uuid4();
$stale_result = $plane->execute($stale_request);
if (!$stale_result instanceof WP_Error || $stale_result->get_error_code() !== 'stale_snippet') throw new RuntimeException('A stale fingerprint was not refused.');
$evidence[] = ['refused' => 'stale_snippet', 'at' => 'execution'];
$deleted = $run('pixflow/wp-admin/wpcodebox2/delete-snippet', ['snippetId' => (int) $delete_fixture['result']['snippet']['id'], 'expectedFingerprint' => (string) $delete_fixture['result']['snippet']['fingerprint']]);
if (($deleted['operation']['afterFingerprint'] ?? '') !== 'absent') throw new RuntimeException('Delete did not reconcile to absent.');

$refuse(['title' => 'Unsafe Run ' . $nonce, 'codeType' => 'php', 'code' => 'echo 1;', 'runType' => 'once'], 'schema_enum_invalid');
$unsafe_code = implode('', ['e', 'v', 'a', 'l', '(', '"echo unsafe;"', ')', ';']);
$refuse(['title' => 'Unsafe PHP ' . $nonce, 'codeType' => 'php', 'code' => $unsafe_code], 'unsafe_php');
$refuse(['title' => 'Unsafe Condition ' . $nonce, 'codeType' => 'css', 'code' => '.x{}', 'conditions' => [['conditions' => [['conditionTitle' => 'Custom PHP Condition']]]]], 'custom_php_condition_not_allowed');

$remaining = $read('pixflow/wp-admin/wpcodebox2/list-snippets', ['search' => $nonce, 'perPage' => 100]);
if ((int) ($remaining['count'] ?? -1) !== 0) throw new RuntimeException('Fixtures remain.');
wp_set_current_user(0);
$permission_result = $plane->execute(['surface' => 'wp_admin', 'sessionId' => $session, 'mode' => 'ask', 'capabilityId' => 'pixflow/wp-admin/wpcodebox2/setup', 'arguments' => [], 'idempotencyKey' => wp_generate_uuid4()]);
if (!$permission_result instanceof WP_Error || $permission_result->get_error_code() !== 'target_permission_denied') throw new RuntimeException('An unauthenticated user was not refused.');
$evidence[] = ['refused' => 'target_permission_denied', 'at' => 'execution'];
wp_set_current_user(1);
echo wp_json_encode(['ok' => true, 'version' => WPCODEBOX2_VERSION, 'capabilityCount' => count(array_filter($registry->capabilities(), static fn(array $capability): bool => str_starts_with((string) $capability['id'], 'pixflow/wp-admin/wpcodebox2/'))), 'typesTested' => array_keys($types), 'fixturesClean' => true, 'evidence' => $evidence], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
