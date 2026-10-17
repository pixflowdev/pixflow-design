<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License {
    class CentralEntitlements { public static function delivery_origin(): string { return self::authority(); } public static function authority(): string { return $GLOBALS['authority']; } }
}
namespace PixflowDesign\WordPress\Resources {
    class ResourcePackRepository {
        public ?array $cached = null;
        public function remote_manifest(): ?array { return $this->cached; }
        public function save_remote_manifest(array $value): void { $this->cached = $value + ['cachedAt'=>time()]; }
    }
}
namespace {
    define('ABSPATH',__DIR__.'/');
    function sanitize_key($v) {return preg_replace('/[^a-z0-9_\-]/','',strtolower($v));}
    function sanitize_text_field($v) {return $v;}
    function sanitize_textarea_field($v) {return $v;}
    function esc_url_raw($v) {return $v;}
    function is_wp_error($v) {return false;}
    function wp_remote_get($url,$args) {$GLOBALS['requests'][]=$url; return ['body'=>json_encode($GLOBALS['remote'])];}
    function wp_remote_retrieve_response_code($v) {return 200;}
    function wp_remote_retrieve_body($v) {return $v['body'];}
    function check($v,$why) {if(!$v)throw new \RuntimeException($why);}
    require dirname(__DIR__).'/src/Resources/ResourcePackManifestService.php';
    $GLOBALS['authority']='https://preview.pixflow.dev'; $GLOBALS['requests']=[];
    $GLOBALS['remote']=['packs'=>[['slug'=>'plugins','artifact_id'=>'resource-plugins-1.1.4-test','version'=>'1.1.4','licenseRequired'=>true]]];
    $repository=new \PixflowDesign\WordPress\Resources\ResourcePackRepository();
    $service=new \PixflowDesign\WordPress\Resources\ResourcePackManifestService($repository);
    $result=$service->manifest();
    check($GLOBALS['requests']===['https://preview.pixflow.dev/api/catalogs/v1/resources'],'Local authority receives new discovery request');
    check($result['packs'][0]['artifact_id']==='resource-plugins-1.1.4-test','Protected artifact identity survives normalization');
    check($result['packs'][0]['archiveUrl']==='','Protected packs need no public URL');
    $service->manifest(); check(count($GLOBALS['requests'])===1,'Warm discovery cache');
    $repository->cached['cachedAt']=time()-301; $service->manifest();
    check(count($GLOBALS['requests'])===2,'Expired discovery refreshes automatically');
    $GLOBALS['authority']='https://pixflow.dev'; $service->manifest();
    check(end($GLOBALS['requests'])==='https://pixflow.dev/api/catalogs/v1/resources','Authority switch cannot reuse staging cache');
    $service->manifest(true); check(count($GLOBALS['requests'])===4,'Manual refresh bypasses warm cache');
    echo "Resource discovery lifecycle passed\n";
}
