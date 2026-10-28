<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require dirname(__DIR__).'/src/License/CentralEntitlements.php';
use PixflowDesign\WordPress\License\CentralEntitlements;
$deleted=[];
function wp_cache_delete($key,$group) { $GLOBALS['deleted'][]=[$key,$group]; }
function maybe_serialize($value) { return serialize($value); }
$wpdb=new class {
    public string $options='isolated_options';
    public function prepare($query,...$args) { return $query; }
    public function query($query) { return 0; }
};
$method=new ReflectionMethod(CentralEntitlements::class,'replace_state');
$result=$method->invoke(new CentralEntitlements(),['epoch'=>1],['epoch'=>1,'tokens'=>['wordpress'=>'new']]);
if ($result!==false) throw new RuntimeException('Conflicting grant must not overwrite newer storage');
foreach ([['pixflow_design_central_entitlements_v2','options'],['alloptions','options']] as $entry) {
    if (!in_array($entry,$deleted,true)) throw new RuntimeException('Rejected commit must invalidate stale persistent option cache');
}
echo "Rejected entitlement commit preserves storage and invalidates stale cache.\n";
