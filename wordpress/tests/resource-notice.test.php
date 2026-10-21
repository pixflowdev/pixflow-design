<?php
declare(strict_types=1);
define('ABSPATH',__DIR__.'/');define('DAY_IN_SECONDS',86400);
$actions=[];$until=0;$admin=true;
function add_action($k,$v,...$a){$GLOBALS['actions'][$k]=$v;}
function add_filter(...$a){}
function current_user_can($c){return $GLOBALS['admin'];}
function get_option($k,$d=false){return $k==='pixflow_design_private_resource_error'?true:['reason'=>'A <safe> diagnostic'];}
function get_current_user_id(){return 7;}
function get_user_meta(...$a){return $GLOBALS['until'];}
function esc_html($s){return htmlspecialchars($s);}
function esc_attr($s){return htmlspecialchars($s);}
function esc_url($s){return $s;}
function admin_url($s=''){return '/wp-admin/'.$s;}
function wp_nonce_field($s){echo '<input name="nonce" value="test">';}
require __DIR__.'/../src/Resources/ResourcePackPathService.php';
PixflowDesign\WordPress\Resources\ResourcePackPathService::register();
function banner(){ob_start();$GLOBALS['actions']['admin_notices']();return ob_get_clean();}
if(!str_contains(banner(),'Dismiss for 28 days')||!str_contains(banner(),'A &lt;safe&gt; diagnostic'))throw new RuntimeException('Notice diagnostics/dismissal');
$until=time()+28*DAY_IN_SECONDS;if(banner()!=='')throw new RuntimeException('Dismissal not honoured');
$until=time()-1;if(!str_contains(banner(),'migration needs attention'))throw new RuntimeException('Expired dismissal hides failure');
$admin=false;if(banner()!=='')throw new RuntimeException('Non-admin sees diagnostics');
echo "Resource notice: expiry, per-user state, escaped diagnostic and capability checks passed\n";
