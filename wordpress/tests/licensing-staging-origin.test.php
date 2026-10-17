<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
define('PIXFLOW_DESIGN_LICENSE_VALIDATION_URL', 'https://staging.pixflow.dev/api/licensing/v1/validate');
$GLOBALS['environment'] = 'local';
function wp_get_environment_type(): string { return $GLOBALS['environment']; }
require dirname(__DIR__) . '/src/License/CentralEntitlements.php';
use PixflowDesign\WordPress\License\CentralEntitlements as Authority;
function check(bool $ok, string $why): void { if (!$ok) throw new RuntimeException($why); }
check(Authority::authority() === 'https://preview.pixflow.dev', 'Staging keeps its established cryptographic issuer');
check(Authority::delivery_origin() === 'https://staging.pixflow.dev', 'Staging requests use the isolated service');
check(Authority::validation_url_matches(PIXFLOW_DESIGN_LICENSE_VALIDATION_URL), 'Configured staging endpoint accepted');
check(!Authority::validation_url_matches('https://pixflow.dev/api/licensing/v1/validate'), 'Production transport rejected in staging');
check(!Authority::validation_url_matches('https://staging.pixflow.dev.evil.test/api/licensing/v1/validate'), 'Lookalike transport rejected');
$GLOBALS['environment'] = 'production';
check(Authority::authority() === 'https://pixflow.dev' && Authority::delivery_origin() === 'https://pixflow.dev', 'Production ignores staging override');
check(!Authority::validation_url_matches(PIXFLOW_DESIGN_LICENSE_VALIDATION_URL), 'Production never validates via staging');
echo "Pinned staging issuer and transport checks passed\n";
