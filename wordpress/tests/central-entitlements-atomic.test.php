<?php
declare(strict_types=1);
// Real WordPress/MySQL option-cache race, isolated in a connection-local table.
// No customer option or plugin is changed. Set PIXFLOW_QA_WP_ROOT explicitly.
$root = getenv('PIXFLOW_QA_WP_ROOT');
if (!$root || !is_file($root.'/wp-load.php')) { echo "Set PIXFLOW_QA_WP_ROOT for the isolated database check.\n"; exit(0); }
define('WP_PLUGIN_DIR', sys_get_temp_dir().'/pixflow-qa-no-plugins');
define('WPMU_PLUGIN_DIR', sys_get_temp_dir().'/pixflow-qa-no-mu-plugins');
define('DISABLE_WP_CRON', true);
require $root.'/wp-load.php';
require dirname(__DIR__).'/src/License/CentralEntitlements.php';
use PixflowDesign\WordPress\License\CentralEntitlements;
function atomic_check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
global $wpdb;
$original_table = $wpdb->options;
$table = $wpdb->prefix.'pixflow_qa_entitlements_'.bin2hex(random_bytes(5));
$option = 'pixflow_design_central_entitlements_v2';
$method = new ReflectionMethod(CentralEntitlements::class, 'replace_state');
$client = new CentralEntitlements();
atomic_check($wpdb->query("CREATE TEMPORARY TABLE `{$table}` LIKE `{$original_table}`") !== false, 'Cannot create isolated options fixture');
try {
    $wpdb->options = $table;
    // Existing cache entries are removed only from this PHP process. The
    // fixture bypasses add_option for setup and exercises the SQL CAS branch.
    $before = ['epoch'=>1, 'denied'=>false, 'tokens'=>['wordpress'=>'before']];
    $denied = ['epoch'=>2, 'denied'=>true, 'tokens'=>[], 'denial_code'=>'license_reset'];
    $grant = ['epoch'=>1, 'denied'=>false, 'tokens'=>['wordpress'=>'after']];
    atomic_check($wpdb->insert($table, ['option_name'=>$option,'option_value'=>maybe_serialize($before),'autoload'=>'no'])===1, 'Fixture insert failed');
    wp_cache_set($option, $before, 'options');
    atomic_check(get_option($option)===$before, 'Fixture cache was not primed');
    atomic_check($wpdb->update($table, ['option_value'=>maybe_serialize($denied)], ['option_name'=>$option])===1, 'Concurrent reset fixture failed');
    atomic_check(get_option($option)===$before, 'Fixture did not reproduce stale per-request cache');
    atomic_check($method->invoke($client, $before, $grant)===false, 'Stale grant overwrote concurrent database reset');
    atomic_check(maybe_unserialize($wpdb->get_var($wpdb->prepare("SELECT option_value FROM `{$table}` WHERE option_name=%s",$option)))===$denied, 'Reset state changed');
    $renewed = ['epoch'=>3, 'denied'=>false, 'tokens'=>['wordpress'=>'renewed']];
    atomic_check($method->invoke($client, $denied, $renewed)===true, 'Matching state failed to commit');
    atomic_check(get_option($option)===$renewed, 'Successful commit failed to invalidate stale cache');
    echo "Real WordPress stale-cache denial preservation and atomic commit passed.\n";
} finally {
    $wpdb->query("DROP TEMPORARY TABLE IF EXISTS `{$table}`");
    $wpdb->options = $original_table;
    wp_cache_delete($option,'options');
    wp_cache_delete('alloptions','options');
}
