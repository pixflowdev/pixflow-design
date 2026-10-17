<?php
/** Run with wp eval-file on the local QA site. Creates and cleans its own fixtures. */
if (!defined('ABSPATH')) throw new RuntimeException('Run through WP-CLI.');
function elementor_matrix_expect(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
$previous = get_current_user_id();
$admin = get_users(['role'=>'administrator','number'=>1])[0];
$subscriber = 0;
$post = 0;
try {
    wp_set_current_user($admin->ID);
    $document = \Elementor\Plugin::$instance->documents->create('wp-page', ['post_title'=>'Disposable Elementor permission QA','post_status'=>'draft','post_type'=>'page']);
    $post = $document->get_main_id();
    $before = get_post_meta($post, '_elementor_data', true);
    $valid = ['id'=>'qa12345','elType'=>'widget','widgetType'=>'heading','settings'=>['title'=>'Permission QA'],'elements'=>[]];
    $invalid = $valid;
    unset($invalid['id']);
    $missing = \PixflowDesign\WordPress\Elementor\ElementorTools::validate_styles($post, [$invalid]);
    $duplicate = \PixflowDesign\WordPress\Elementor\ElementorTools::validate_styles($post, [$valid,$valid]);
    elementor_matrix_expect(!$missing['valid'] && !$duplicate['valid'], 'Malformed IDs accepted.');
    elementor_matrix_expect(\PixflowDesign\WordPress\Elementor\ElementorTools::validate_styles($post, [$valid])['valid'], 'Valid classic tree rejected.');
    elementor_matrix_expect(get_post_meta($post, '_elementor_data', true)===$before, 'Validation mutated saved tree.');
    $subscriber = wp_insert_user(['user_login'=>'pf_elementor_matrix_'.wp_generate_uuid4(),'user_pass'=>wp_generate_password(40),'role'=>'subscriber']);
    elementor_matrix_expect(!is_wp_error($subscriber), 'Subscriber fixture failed.');
    foreach ([0,$subscriber] as $user) {
        wp_set_current_user($user);
        foreach ([['GET','/od/design-systems/elementor'],['GET','/icons/packs/elementor'],['POST','/wp-admin/direct/canvas'],['POST','/wp-admin/direct/sessions'],['POST','/wp-admin/direct/tools'],['POST','/license/recovery/prepare'],['POST','/license/recovery/complete']] as [$method,$path]) {
            $response=rest_do_request(new WP_REST_Request($method,'/pixflow-design/v1'.$path));
            elementor_matrix_expect(in_array($response->get_status(),[401,403],true),'Unauthorized route: '.$path.' '.$response->get_status());
        }
        $denied=false;
        try { \PixflowDesign\WordPress\Elementor\ElementorTools::validate_styles($post,[$valid]); } catch (RuntimeException $e) { $denied=true; }
        elementor_matrix_expect($denied,'Private document validation exposed.');
    }
    echo "PASS: malformed-ID rejection, read-only validation, anonymous/subscriber denial for Elementor systems/icons/native tools and installation recovery.\n";
} finally {
    wp_set_current_user($admin->ID);
    if ($post) wp_delete_post($post,true);
    if (is_int($subscriber) && $subscriber) {
        require_once ABSPATH.'wp-admin/includes/user.php';
        wp_delete_user($subscriber);
    }
    wp_set_current_user($previous);
}
