<?php
/** Local WordPress integration regression; run with wp eval-file. */
if (!defined('ABSPATH')) throw new RuntimeException('Run through WP-CLI eval-file.');
if (\PixflowDesign\WordPress\Bricks\BricksModuleLifecycle::active()) throw new RuntimeException('This scenario requires a non-Bricks active theme.');
$user = get_user_by('login', 'pixflow');
if (!$user) throw new RuntimeException('Local QA administrator missing.');
wp_set_current_user($user->ID);
$key = 'pixflow_design_app_config';
$before = get_option($key, []);
try {
    $request = new WP_REST_Request('PUT', '/pixflow-design/v1/od/app-config');
    $request->set_header('Content-Type', 'application/json');
    $request->set_body(wp_json_encode([
        'onboardingRoute' => 'none',
        'bricksAbilitiesEnabled' => false,
        'bricksExtensions' => ['gsap' => ['enabled' => false]],
    ]));
    $response = rest_do_request($request);
    if ($response->get_status() !== 200) throw new RuntimeException('Shared settings rejected without Bricks: ' . $response->get_status());
    $after = get_option($key, []);
    if (($after['onboardingRoute'] ?? '') !== 'none') throw new RuntimeException('Shared preference was not saved.');
    if (($after['bricksExtensions'] ?? []) !== ($before['bricksExtensions'] ?? [])) throw new RuntimeException('Inactive Bricks preferences were modified.');
    echo "Inactive Bricks shared app-config: PASS\n";
} finally {
    update_option($key, $before, false);
}
