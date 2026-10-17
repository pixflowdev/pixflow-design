<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License {
    class LicenseService { public function status(): array { return ['pro'=>$GLOBALS['pro']]; } }
    class CentralEntitlements { public static function delivery_origin(): string { return 'https://pixflow.dev'; } }
}
namespace {
    define('ABSPATH', __DIR__);
    define('PIXFLOW_DESIGN_ASSETS_URL', 'https://site.test/plugin/assets/');
    define('PIXFLOW_DESIGN_PLUGIN_FILE', '/plugin/pixflow-ai/pixflow-ai.php');
    function plugin_basename($file) { return 'pixflow-ai/pixflow-ai.php'; }
    function current_user_can($cap) { return $GLOBALS['allowed'] ?? true; }
    function is_network_admin() { return false; }
    function get_current_user_id() { return 7; }
    function get_user_meta($id,$key,$single) { return $GLOBALS['dismissed'] ?? false; }
    function get_current_screen() { return (object)['base'=>$GLOBALS['screen'] ?? 'plugins']; }
    function esc_url($s) { return htmlspecialchars($s,ENT_QUOTES); }
    function esc_html($s) { return htmlspecialchars($s,ENT_QUOTES); }
    function esc_attr($s) { return htmlspecialchars($s,ENT_QUOTES); }
    function __($text, $domain) { return ($GLOBALS['translations'] ?? [])[$text] ?? $text; }
    function admin_url($s='') { return 'https://site.test/wp-admin/'.$s; }
    function wp_nonce_field($action) { echo '<input name="_wpnonce" value="test">'; }
    function check_ajax_referer($action,$field,$die) { return $GLOBALS['nonce'] ?? true; }
    function update_user_meta($id,$key,$value) { $GLOBALS['dismissed']=$value; }
    function wp_send_json_error($data,$status) { $GLOBALS['response']=['success'=>false,'status'=>$status]; }
    function wp_send_json_success() { $GLOBALS['response']=['success'=>true]; }
    function wp_die($message, $title = '', $args = []) { throw new RuntimeException($message); }
    function check($ok,$message) { if (!$ok) throw new RuntimeException($message); }
    require dirname(__DIR__).'/src/License/ProUpgradeNotice.php';
    $notice=new \PixflowDesign\WordPress\License\ProUpgradeNotice();
    $GLOBALS['pro']=['eligible'=>false,'installation'=>'missing','trial_url'=>'https://pixflow.dev/account#pro-trial'];
    check($notice->offer()['label']==='Check Pro trial','Unknown account must not promise eligibility');
    $GLOBALS['pro']['trial_status']='eligible';
    check($notice->offer()['label']==='Try Pro for 7 days','Eligible trial CTA');
    foreach(['used','expired','ineligible','active'] as $state) {
        $GLOBALS['pro']['trial_status']=$state;
        check($notice->offer()['label']==='Upgrade to Pro','Previously claimed trial must not be offered again');
    }
    $GLOBALS['pro']+=['plugins_url'=>'https://site.test/wp-admin/plugins.php','account_url'=>'https://pixflow.dev/account#pro-download'];
    $GLOBALS['pro']['eligible']=true;
    check($notice->offer()['label']==='Download Pro','Paid customer download');
    $GLOBALS['pro']['installation']='inactive';
    check($notice->offer()['label']==='Activate Pro','Paid customer activation');
    $GLOBALS['pro']['installation']='active';
    check($notice->offer()===null,'No upsell for active paid users');
    $GLOBALS['pro']['eligible']=false;
    $GLOBALS['dismissed']=true;
    check($notice->offer()===null,'Dismissal respected');
    $GLOBALS['dismissed']=false;
    $GLOBALS['allowed']=false;
    check($notice->offer()===null,'Not visible without plugin permission');
    $GLOBALS['allowed']=true;
    $GLOBALS['screen']='post';
    check($notice->offer()===null,'Keep editor uninterrupted');
    $GLOBALS['screen']='plugins';
    ob_start(); $notice->render(); $html=ob_get_clean();
    check(str_contains($html,'name="_wpnonce"') && str_contains($html,'method="post"'),'Nonce-protected dismissal form');
    check(str_contains($html,'Dismiss Pixflow Pro banner'),'Accessible dismissal');
    $GLOBALS['allowed']=false;
    $notice->dismiss_ajax();
    check($GLOBALS['response']['status']===403 && !$GLOBALS['dismissed'],'Unauthorised dismissal rejected');
    $GLOBALS['allowed']=true;
    $GLOBALS['nonce']=false;
    $notice->dismiss_ajax();
    check($GLOBALS['response']['status']===403 && !$GLOBALS['dismissed'],'Forged dismissal rejected');
    $GLOBALS['nonce']=true;
    $notice->dismiss_ajax();
    check($GLOBALS['response']['success'] && $GLOBALS['dismissed'],'Authenticated AJAX dismissal persists');
    $links=$notice->plugin_meta(['View details'], 'pixflow-ai/pixflow-ai.php');
    check(count($links)===2 && str_contains($links[1],'Upgrade to Pro'),'Plugin upgrade link remains after dismissal');
    check($notice->plugin_meta(['View details'], 'other/plugin.php')===['View details'],'Other plugin links unchanged');
    $GLOBALS['pro']['trial_status']='eligible';
    check(str_contains($notice->plugin_meta([], 'pixflow-ai/pixflow-ai.php')[0],'Start your 7-day Pro trial'),'Eligible plugin-row trial link');
    $GLOBALS['translations']=['Try Pro for 7 days'=>'Pro 7 Tage testen', 'Start your 7-day Pro trial'=>'7-tägige Pro-Testphase starten'];
    check(str_contains($notice->plugin_meta([], 'pixflow-ai/pixflow-ai.php')[0],'7-tägige Pro-Testphase starten'),'Trial link uses stable state instead of comparing translated copy');
    $GLOBALS['allowed']=false;
    $GLOBALS['translations']=['You cannot dismiss this notice.'=>'<img src=x onerror=alert(1)>'];
    try { $notice->dismiss(); throw new RuntimeException('Expected forbidden dismissal'); }
    catch (RuntimeException $error) { check($error->getMessage()==='&lt;img src=x onerror=alert(1)&gt;', 'Forbidden notice dismissal must escape translated HTML'); }
    echo "Pro upgrade notice: passed\n";
}
