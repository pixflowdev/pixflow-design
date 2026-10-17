<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\License {
    class CentralEntitlements { public static function delivery_origin(): string { return self::authority(); }
        public static function enabled(): bool { return true; }
        public static function authority(): string { return 'https://pixflow.dev'; }
    }
    class SiteIdentity {
        public const PRODUCT_SLUG='pixflow-design';
        public function current_payload(): array { return []; }
    }
    class LicenseCache { public function private_payload(): array { return []; } }
    class FreeArtifacts { public function current(): array|\WP_Error { return $GLOBALS['free_artifact'] ?? new \WP_Error('unavailable', 'Unavailable'); } public function download(string $url): string { return '/verified/free.zip'; } }
    class CentralArtifacts {
        public function catalog(): array|\WP_Error { return $GLOBALS['catalog']; }
        public static function select_current(array $catalog,string $type,string $slug): array|\WP_Error { return $catalog[0]??new \WP_Error('missing','Missing'); }
        public function current(string $type,string $slug): array|\WP_Error { $catalog=$this->catalog(); return $catalog instanceof \WP_Error ? $catalog : self::select_current($catalog,$type,$slug); }
        public function download(string $id,string $type): string { return '/verified-package.zip'; }
    }
}
namespace {
    define('ABSPATH', __DIR__.'/'); define('WP_PLUGIN_DIR',sys_get_temp_dir().'/pixflow-nonexistent-plugin-fixture');
    class WP_Error { public function __construct(public string $code,public string $message){} }
    function is_wp_error($value): bool {return $value instanceof WP_Error;}
    function plugin_basename($file): string {return 'pixflow-ai/pixflow-ai.php';}
    function plugins_url($path, $file): string {return 'https://customer.example/wp-content/plugins/'.basename(dirname($file)).'/'.$path;}
    function get_option($name,$default='') {return 'fixture';}
    function get_bloginfo($name): string {return '6.9';}
    function delete_transient($name): void {}
    function delete_site_transient($name): void {}
    function remove_filter(...$args): void {}
    function activate_plugin(...$args): void {$GLOBALS['activated']=true;}
    function trailingslashit($value): string {return rtrim($value,'/').'/';}
    function wp_parse_url($url,$component=-1) {return parse_url($url,$component);}
    function set_site_transient(...$args): void {}
    function wp_strip_all_tags($s): string {return strip_tags($s);}
    function sanitize_key($s): string {return $s;}
    function sanitize_text_field($s): string {return $s;}
    require dirname(__DIR__).'/src/Admin/PluginUpdater.php';
    function check($value,$message): void {if(!$value)throw new \RuntimeException($message);}
    $updater=new \PixflowDesign\WordPress\Admin\PluginUpdater('/pixflow-ai/pixflow-ai.php','1.1.5');
    $GLOBALS['catalog']=[['artifact_id'=>'plugin-116','version'=>'1.1.6','requires'=>'6.5','tested'=>'6.9','requires_php'=>'8.1','sections'=>['changelog'=>'Release notes']]];
    $key='pixflow-ai/pixflow-ai.php';
    $state=(object)['checked'=>[$key=>'1.1.5'],'response'=>[],'no_update'=>[$key=>(object)['new_version'=>'1.1.5']]];
    $result=$updater->check_update($state);
    check(isset($result->response[$key])&&!isset($result->no_update[$key]),'Update replaces stale no_update entry');
    check($result->response[$key]->requires_php==='8.1','Requirements reach native WordPress update UI');
    $icon='https://customer.example/wp-content/plugins/pixflow-ai/assets/brand/pixflow-plugin-icon.svg';
    check(($result->response[$key]->icons['svg']??null)===$icon,'Update list uses bundled Pixflow icon when server omits icons');
    $info=$updater->plugin_info(false,'plugin_information',(object)['slug'=>'pixflow-ai']);
    check($info->sections['changelog']==='Release notes','Details modal receives changelog');
    check(($info->icons['svg']??null)===$icon,'Plugin details use the same bundled icon');
    $GLOBALS['catalog'][0]['version']='1.1.5';
    $result=$updater->check_update($result);
    check(!isset($result->response[$key])&&isset($result->no_update[$key]),'No-update result removes stale update notice');
    check(($result->no_update[$key]->icons['svg']??null)===$icon,'Current plugin metadata retains its icon');
    $GLOBALS['catalog'][0]['icons']=['2x'=>'https://pixflow.dev/icon-256.png'];
    $result=$updater->check_update($result);
    check($result->no_update[$key]->icons===['2x'=>'https://pixflow.dev/icon-256.png'],'Valid server branding remains preferred');
    $GLOBALS['catalog'][0]['icons']=['default'=>'https://pixflow.dev/icon.svg'];
    $result=$updater->check_update($result);
    check($result->no_update[$key]->icons===['default'=>'https://pixflow.dev/icon.svg'],'WordPress default icon metadata remains supported');
    $GLOBALS['catalog'][0]['icons']=['svg'=>'javascript:alert(1)','1x'=>''];
    $result=$updater->check_update($result);
    check(($result->no_update[$key]->icons['svg']??null)===$icon,'Empty or non-web icon URLs fall back to bundled branding');
    $result->response[$key]=(object)['package'=>'stale'];
    $GLOBALS['catalog']=new WP_Error('denied','Denied');
    $result=$updater->check_update($result);
    check(!isset($result->response[$key]),'Revoked catalogue removes cached package');
    check(($result->no_update[$key]->icons['svg']??null)===$icon,'Unavailable catalogue retains local icon without offering a package');
    $GLOBALS['activated']=false;
    check($updater->after_install(true,['plugin'=>$key],['destination'=>WP_PLUGIN_DIR.'/pixflow-ai/'])===true,'Preserve upgrader boolean response');
    check(!$GLOBALS['activated'],'Updating an inactive plugin must not activate it');
    $failure=new WP_Error('earlier_failure','Earlier failure');
    check($updater->after_install($failure,['plugin'=>$key],[])===$failure,'Preserve earlier installer failure');
    check($updater->central_pre_download($failure,'ignored',null,['plugin'=>$key])===$failure,'Preserve earlier download failure');
    check($updater->fix_source_dir($failure,'/temporary',null,['plugin'=>$key])===$failure,'Preserve earlier extraction failure');
    $GLOBALS['wp_filesystem']=new class {public function move(...$args): bool {return false;}};
    check(is_wp_error($updater->fix_source_dir('/temporary/wrong','/temporary',null,['plugin'=>$key])),'Failed source rename must not report a usable package');
    $GLOBALS['catalog']=[['artifact_id'=>'protected-free','edition'=>'free','version'=>'2.0.4']];
    check($updater->central_pre_download(false,'/tmp/unrelated-plugin.zip',null,[])===false,'Authenticated Free metadata without a public URL must not break native plugin uploads');
    $result=$updater->check_update($result);
    check($result->response[$key]->package==='https://pixflow.dev/api/licensing/v2/download?artifact=protected-free','Protected fallback uses authenticated package route');
    check($updater->central_pre_download(false,$result->response[$key]->package,null,['plugin'=>$key])==='/verified-package.zip','Protected fallback still verifies the download');
    echo "Native WordPress updater lifecycle passed\n";
}
