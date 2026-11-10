<?php
declare(strict_types=1);
$fixture=sys_get_temp_dir().'/pixflow-empty-recovery-'.bin2hex(random_bytes(6));
mkdir($fixture.'/public/plugin/resources/bundled-skills',0700,true);
mkdir($fixture.'/public/plugin/resources/bundled-plugins',0700,true);
mkdir($fixture.'/public/uploads/pixflow-design/resource-packs/empty/nested',0700,true);
define('ABSPATH',$fixture.'/public/');define('PIXFLOW_DESIGN_PLUGIN_DIR',ABSPATH.'plugin/');
function wp_upload_dir(...$args){return ['basedir'=>ABSPATH.'uploads'];}
require __DIR__.'/../src/autoload.php';
use PixflowDesign\WordPress\Resources\BundledResources;
try {
 if(BundledResources::needs_private_preparation())throw new RuntimeException('Empty retired trees must not require writable private storage');
 if(is_dir(ABSPATH.'uploads/pixflow-design/resource-packs'))throw new RuntimeException('Empty legacy tree remains');
 mkdir(ABSPATH.'uploads/pixflow-design/resource-packs/custom',0700,true);
 file_put_contents(ABSPATH.'uploads/pixflow-design/resource-packs/custom/design.md','Preserve exactly');
 if(!BundledResources::needs_private_preparation())throw new RuntimeException('Nonempty resources require migration');
 if(file_get_contents(ABSPATH.'uploads/pixflow-design/resource-packs/custom/design.md')!=='Preserve exactly')throw new RuntimeException('Resource changed');
 echo "Empty legacy cleanup and nonempty preservation passed\n";
}finally{
 foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($fixture,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST)as$f){if($f->isDir()&&!$f->isLink())rmdir($f->getPathname());else unlink($f->getPathname());}rmdir($fixture);
}
