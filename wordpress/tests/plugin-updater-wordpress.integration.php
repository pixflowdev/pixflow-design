<?php
declare(strict_types=1);

// Real WordPress updater and real CentralArtifacts byte verification, with a process-local
// HTTP/license fixture. No public catalog is changed. Plugin files live in a temporary root.
namespace PixflowDesign\WordPress\License {
    class CentralEntitlements { public static function delivery_origin(): string { return self::authority(); }
        public static function enabled(): bool {return true;}
        public static function authority(): string {return 'https://pixflow.dev';}
        public static function validation_url_matches(string $url): bool {return $url===self::authority().'/api/licensing/v1/validate';}
        public function deny(string $why): void {$GLOBALS['fixture_denied']=true;}
    }
    class SiteIdentity {
        public const PRODUCT_SLUG='pixflow-design';
        public static function normalize_url(string $url): string {return $url;}
        public function current_payload(): array {return [];}
    }
    class LicenseCache {public function private_payload(): array {return ['license_key'=>'local-fixture','validation_url'=>CentralEntitlements::authority().'/api/licensing/v1/validate'];}}
    class LicenseService {public function validation_url(): string {return CentralEntitlements::authority().'/api/licensing/v1/validate';}}
    class LicenseHttpClient {public function post_json(string $url,array $body): array {return ['status'=>200,'body'=>'{}'];}}
    class InstallationProof {public function envelope(array $installation,string $purpose,array $challenge,array $payload): array {return $payload;}}
}
namespace {
    if(!in_array(count($argv), [3, 4], true) || (isset($argv[3]) && !in_array($argv[3], ['pro', 'free'], true))) {fwrite(STDERR,"Usage: php plugin-updater-wordpress.integration.php <local wp-root> <built plugin ZIP> [pro|free]\n");exit(2);}
    $isPro = ($argv[3] ?? '') === 'pro';
    $isFree = ($argv[3] ?? '') === 'free';
    $folder = $isPro ? 'pixflow-design-pro' : 'pixflow-ai';
    $slug = $isPro ? 'pixflow-design-pro' : 'pixflow-design';
    $key = $folder . '/' . $folder . '.php';
    $oldVersion = '0.0.1';
    $testWpRoot=realpath($argv[1]);$zip=realpath($argv[2]);
    if(!$testWpRoot||!is_file($testWpRoot.'/wp-load.php')||!$zip)throw new \RuntimeException('Missing local test inputs');
    $archive=new \ZipArchive();
    if($archive->open($zip)!==true)throw new \RuntimeException('Cannot open built plugin ZIP');
    $entry=$archive->getFromName($key);$archive->close();
    if(!is_string($entry)||!preg_match('/^[ \t]*\*[ \t]*Version:[ \t]*([^\r\n]+)/m',$entry,$versionMatch))throw new \RuntimeException('Built plugin version missing');
    $expectedVersion=trim($versionMatch[1]);
    $fixture=str_replace('\\','/',sys_get_temp_dir()).'/pixflow-native-update-'.bin2hex(random_bytes(6));
    mkdir($fixture.'/plugins/'.$folder,0700,true);mkdir($fixture.'/mu-plugins',0700,true);
    define('WP_PLUGIN_DIR',$fixture.'/plugins');define('WPMU_PLUGIN_DIR',$fixture.'/mu-plugins');
    define('FS_METHOD','direct');define('DISABLE_WP_CRON',true);define('WP_ADMIN',true);
    $_SERVER['HTTP_HOST']='127.0.0.1:8088';
    require $testWpRoot.'/wp-load.php';
    if(home_url()!=='http://127.0.0.1:8088')throw new \RuntimeException('Only the local QA site may run this test');
    require_once ABSPATH.'wp-admin/includes/file.php';require_once ABSPATH.'wp-admin/includes/plugin.php';require_once ABSPATH.'wp-admin/includes/class-wp-upgrader.php';
    require dirname(__DIR__).'/src/License/FreeArtifacts.php';
    require dirname(__DIR__).'/src/License/CentralArtifacts.php';require dirname(__DIR__).'/src/Admin/PluginUpdater.php';
    $plugin=WP_PLUGIN_DIR.'/'.$key;
    $artifact=['artifact_id'=>'private-local-116','type'=>'plugin','slug'=>$slug,'channel'=>'stable','current'=>true,'name'=>'Pixflow Design','version'=>$expectedVersion,'filename'=>'local-116.zip','bytes'=>filesize($zip),'sha256'=>hash_file('sha256',$zip)];
    if ($isFree) $artifact += ['edition' => 'free', 'download_url' => 'https://pixflow.dev/api/plugins/v1/free/download/private-local-116'];
    $GLOBALS['fixture_mode']='ok';$GLOBALS['fixture_active']=[];$GLOBALS['fixture_denied']=false;$GLOBALS['fixture_downloads']=0;
    add_filter('pre_option_active_plugins',static fn()=> $GLOBALS['fixture_active']);
    add_filter('pre_option_pixflow_design_central_entitlements_v2',static fn()=>['installation'=>['id'=>'local-test','authority'=>'https://pixflow.dev','site_url'=>site_url('/'),'binding'=>hash('sha256','https://pixflow.dev|'.site_url('/').'|local-fixture')]]);
    add_filter('pre_http_request',static function($pre,$args,$url)use($zip,$artifact,$isFree){
        $allowed = $isFree ? 'https://pixflow.dev/api/plugins/v1/free/' : 'https://pixflow.dev/api/licensing/v2/';
        if(!str_starts_with($url,$allowed))return new \WP_Error('fixture_network_disabled','No external requests in local integration');
        $status=$GLOBALS['fixture_mode']==='revoked'?403:200;
        $response=['response'=>['code'=>$status,'message'=>'Fixture'],'headers'=>[],'body'=>''];
        if ($isFree && str_ends_with($url, '/latest')) $response['body'] = json_encode(['ok'=>true,'schema_version'=>1,'artifact'=>$artifact]);
        elseif(str_ends_with($url,'/artifacts'))$response['body']=json_encode(['ok'=>true,'artifacts'=>[$artifact]]);
        elseif(str_ends_with($url,'/download') || ($isFree && $url === $artifact['download_url'])) {
            $GLOBALS['fixture_downloads']++;
            if($GLOBALS['fixture_mode']==='corrupt')file_put_contents($args['filename'],'corrupt package');
            else copy($zip,$args['filename']);
            $response['headers']=['content-type'=>'application/zip','x-pixflow-artifact-sha256'=>$artifact['sha256']];
        } else return new \WP_Error('unexpected_fixture_route','Unexpected request');
        return $response;
    },10,3);
    $updater=new \PixflowDesign\WordPress\Admin\PluginUpdater($plugin,$oldVersion,$slug);$updater->register();
    function verify($condition,string $message): void {if(!$condition)throw new \RuntimeException($message);}
    $wpdb->query('START TRANSACTION');
    try {
        foreach(['inactive','active-bulk','corrupt','revoked'] as $mode) {
            file_put_contents($plugin,"<?php\n/*\nPlugin Name: Pixflow Design\nVersion: $oldVersion\n*/\n");
            wp_clean_plugins_cache(false);$GLOBALS['fixture_mode']='ok';$GLOBALS['fixture_active']=$mode==='active-bulk'?[$key]:[];
            add_filter('pre_set_site_transient_update_plugins',[$updater,'check_update']);
            $state=(object)['checked'=>[$key=>$oldVersion],'response'=>[],'no_update'=>[]];
            set_site_transient('update_plugins',$state);
            $update=get_site_transient('update_plugins');
            verify(($update->response[$key]->new_version??'')===$expectedVersion,'Native update notice missing');
            if(in_array($mode,['corrupt','revoked'],true))$GLOBALS['fixture_mode']=$mode;
            $installer=new \Plugin_Upgrader(new \Automatic_Upgrader_Skin());
            ob_start();try {
                $result=$mode==='active-bulk'?$installer->bulk_upgrade([$key],['clear_update_cache'=>false]):$installer->upgrade($key,['clear_update_cache'=>false]);
            } finally {ob_end_clean();}
            $version=get_plugin_data($plugin,false,false)['Version'];
            if(in_array($mode,['corrupt','revoked'],true)) {
                verify(is_wp_error($result)||$result===false||$result===null,'Invalid package was accepted');
                verify(str_contains(implode(' ', $installer->skin->get_upgrade_messages()), $mode === 'revoked' ? 'Refresh Pixflow update metadata' : ($isFree ? 'could not be retrieved or verified' : 'could not be authorized or verified')), 'Failed download must report a WordPress error');
                verify($version===$oldVersion,'Failed update changed installed version');
            } else {
                verify($mode==='active-bulk'?is_array($result)&&!is_wp_error($result[$key]??null):$result===true,'Native WordPress upgrade failed: '.(is_wp_error($result)?$result->get_error_message():json_encode($result)));
                verify($version===$expectedVersion,'Installed plugin version mismatch');
                if (!$isPro) verify(hash_file('sha256',WP_PLUGIN_DIR.'/pixflow-ai/src/Admin/PluginUpdater.php')===hash_file('sha256',dirname(__DIR__).'/src/Admin/PluginUpdater.php'),'Installed updater differs from tested source');
                verify(is_plugin_active($key)===($mode==='active-bulk'),'Activation state changed');
            }
            echo "$mode: native update notice, byte verification and WordPress installer passed\n";
        }
        if (!$isFree) verify($GLOBALS['fixture_denied'],'Revoked download did not deny access');
        else verify(!$GLOBALS['fixture_denied'], 'Free update failure must not mutate licensing');
        echo "Local native upgrade integration passed; no public release used\n";
    } finally {
        $wpdb->query('ROLLBACK');wp_cache_flush();
        $root=realpath($fixture);$temp=realpath(sys_get_temp_dir());
        if($root&&$temp&&str_starts_with($root,$temp.DIRECTORY_SEPARATOR)) {
            $iterator=new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root,\FilesystemIterator::SKIP_DOTS),\RecursiveIteratorIterator::CHILD_FIRST);
            foreach($iterator as $file){$file->isDir()?rmdir($file->getPathname()):unlink($file->getPathname());}rmdir($root);
        }
    }
}
