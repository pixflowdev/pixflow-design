<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License {
    function time(): int { return $GLOBALS['licence_test_clock'] ?? \time(); }
}
namespace {
    use PixflowDesign\WordPress\License\CentralEntitlements;
    use PixflowDesign\WordPress\License\LicenseService;

    require __DIR__ . '/central-entitlements-lifecycle.test.php';
    $begin = $now;
    $client = new CentralEntitlements();
    $baseline = $domain_baseline;
    $option = 'pixflow_design_central_entitlements_v2';
    $cache = 'pixflow_design_site_license_cache';

    function visit_at(int $offset): void {
        global $begin;
        $GLOBALS['licence_test_clock'] = $begin + $offset;
        $GLOBALS['actions'] = [];
        (new ReflectionProperty(CentralEntitlements::class, 'request_refresh_scheduled'))->setValue(null, false);
        foreach ($GLOBALS['transient_expiry'] ?? [] as $key => $expires) {
            if ($expires <= $GLOBALS['licence_test_clock']) unset($GLOBALS['transients'][$key]);
        }
    }
    function signed_responses(): array {
        global $challenge, $grants, $jwks, $now;
        $now = $GLOBALS['licence_test_clock'];
        $fresh = $grants;
        $fresh['entitlements']['wordpress']['token'] = central_token('pixflow-design-wordpress-local');
        $fresh['entitlements']['bridge']['token'] = central_token('pixflow-design-bridge');
        return [response(200, array_merge($challenge, ['expires_at' => $now+120])), response(200,$fresh), response(200,$jwks)];
    }
    $GLOBALS['options'] = $baseline;
    $GLOBALS['transients'] = [];
    $GLOBALS['editor_authenticated'] = true;
    visit_at(0);
    $GLOBALS['responses'] = signed_responses();
    check($client->refresh()['ok'], 'Initial refresh failed');
    $stored_key = $GLOBALS['options'][$cache];
    $stored_install = $GLOBALS['options'][$option]['installation'];
    $count = count($GLOBALS['requests']);
    visit_at(299);
    check($client->allows('wordpress:mutate') && empty($GLOBALS['actions']['shutdown']) && count($GLOBALS['requests']) === $count, 'Premature refresh');
    for ($second = 300; $second <= 172800; $second += 300) {
        visit_at($second);
        $GLOBALS['responses'] = signed_responses();
        check($client->allows('wordpress:mutate') && $client->allows('wordpress:mutate'), "Healthy session lost Pro at $second");
        check(count($GLOBALS['actions']['shutdown'] ?? []) === 1, 'Multiple refresh callbacks');
        ($GLOBALS['actions']['shutdown'][0])();
        check($client->status()['expires_at'] === $begin+$second+900, 'Grant expiry did not advance');
        check($GLOBALS['options'][$option]['installation'] === $stored_install && $GLOBALS['options'][$cache] === $stored_key, 'Changed installation or saved key');
    }
    check(count($GLOBALS['requests']) === $count + 576*3, 'Incorrect number of renewal exchanges');
    echo "PASS: 48 simulated hours, 576 signed renewals, one exchange per due request.\n";

    // The last good grant was issued at hour 48. Fail the authority call after expiry.
    $last = 172800;
    foreach ([900 => true, 12*3600 => true, 86399 => true, 86400 => false, 86401 => false] as $elapsed => $valid) {
        visit_at($last+$elapsed);
        $GLOBALS['responses'] = [response(503, ['code'=>'service_unavailable'])];
        check($client->allows('wordpress:mutate') === $valid, "Wrong offline allowance at +$elapsed");
        foreach ($GLOBALS['actions']['shutdown'] ?? [] as $refresh) $refresh();
        check($client->status()['valid'] === $valid, 'Status and capabilities diverged');
    }
    echo "PASS: 15-minute expiry, overnight offline access, cutoff at exactly 24h.\n";
    visit_at($last+7*86400);
    $GLOBALS['responses'] = signed_responses();
    $status = (new LicenseService())->status();
    check($status['pro']['eligible'] && $status['central_entitlement']['valid'] && empty($status['central_entitlement']['offline']), 'First admin visit after a week failed to recover');
    check($GLOBALS['options'][$option]['installation'] === $stored_install && $GLOBALS['options'][$cache] === $stored_key, 'Idle recovery changed identity');
    echo "PASS: week-idle admin visit recovers online without cron or re-entry.\n";

    $originalSite = $GLOBALS['site'];
    $GLOBALS['site'] = 'http://localhost';
    $attempts = count($GLOBALS['requests']);
    $snapshot = $GLOBALS['options'];
    $service = new LicenseService();
    check(!$service->status()['license']['present'] && $service->private_license_payload() === [], 'Alternate site received saved credentials');
    check($GLOBALS['options'] === $snapshot, 'CLI/site URL mismatch erased or modified a saved licence');
    check(!$client->refresh()['ok'] && count($GLOBALS['requests']) === $attempts, 'Wrong-site cron contacted the authority');
    $GLOBALS['site'] = $originalSite;
    check((new LicenseService())->status()['pro']['eligible'], 'Returning to the real site required re-entry');
    echo "PASS: wrong-site admin/CLI/cron are denied without damaging the original licence.\n";

    foreach ([response(503, ['code' => 'service_unavailable']), response(429), response(200, ['unexpected'=>true])] as $badResponse) {
        $GLOBALS['responses'] = [$badResponse];
        check($service->private_license_payload() === [], 'Failed template revalidation returned a credential');
        check($GLOBALS['options'][$cache] === $stored_key, 'Temporary template validation failure erased the saved key');
    }
    $denyKey = response(403, ['valid'=>false, 'access_granted'=>false, 'status'=>'invalid_key']);
    $GLOBALS['responses'] = [$denyKey];
    check(!$service->validate('wrong-test-key')['valid'] && $GLOBALS['options'][$cache] === $stored_key, 'Rejected replacement key erased the good one');
    echo "PASS: template token validation refuses a JSON 503 without erasing the saved key.\n";

    foreach (['expired challenge', 'security page'] as $index => $variant) {
        visit_at($last+7*86400+300*($index+1));
        $GLOBALS['responses'] = [$index === 0 ? response(200,$challenge) : ['status'=>403,'body'=>'<html>Security check</html>']];
        check(!$client->refresh()['ok'] && !$client->status()['valid'], 'Bad authority response must fail closed');
        visit_at($last+7*86400+300*($index+1)+61);
        $GLOBALS['responses'] = signed_responses();
        check((new LicenseService())->status()['pro']['eligible'], "Saved licence stuck after $variant");
    }
    echo "PASS: expired challenge and HTML security page recover only with fresh verified grants.\n";

    $client->deny('invalid_challenge'); // Stored by earlier releases.
    visit_at($last + 8*86400);
    $GLOBALS['responses'] = signed_responses();
    $attempts = count($GLOBALS['requests']);
    $GLOBALS['editor_authenticated'] = false;
    check(!$client->allows('wordpress:mutate') && count($GLOBALS['requests']) === $attempts, 'Anonymous visitor initiated recovery');
    $GLOBALS['editor_authenticated'] = true;
    check($client->allows('wordpress:mutate') && $service->status()['pro']['eligible'], 'First builder action after a legacy challenge failure required Dashboard');
    echo "PASS: first authenticated builder action recovers a legacy failure; anonymous traffic cannot initiate it.\n";

    $GLOBALS['responses'] = [$denyKey];
    check(!$service->validate('fixture-key')['valid'] && $license->private_payload() === [], 'Explicit denial of the installed key ignored');
    echo "PASS: authoritative denial of the matching key still removes access.\n";
}
