<?php
declare(strict_types=1);
$fixture=sys_get_temp_dir().'/pixflow-resource-private-'.bin2hex(random_bytes(8));
mkdir($fixture.'/public/uploads',0700,true);
define('ABSPATH',$fixture.'/public/'); $_SERVER['DOCUMENT_ROOT']=ABSPATH;
$options=[];
function wp_normalize_path($v){return str_replace('\\','/',$v);}
function trailingslashit($v){return rtrim($v,'/').'/';}
function wp_upload_dir(...$a){return ['basedir'=>ABSPATH.'uploads','baseurl'=>'https://test.invalid/uploads'];}
function wp_mkdir_p($v){return is_dir($v)||mkdir($v,0700,true);}
function get_option($k,$d=false){return $GLOBALS['options'][$k]??$d;}
function update_option($k,$v,...$a){$GLOBALS['options'][$k]=$v;}
function sanitize_key($v){return preg_replace('/[^a-z0-9_-]/','',strtolower($v));}
require __DIR__.'/../src/autoload.php';
$legacy=ABSPATH.'uploads/pixflow-design/resource-packs';
mkdir($legacy.'/plugins/1/plugins/demo',0700,true);
file_put_contents($legacy.'/plugins/1/plugins/demo/index.html','<h1>Preserved reference</h1>');
file_put_contents($legacy.'/plugins/1/plugins/demo/recipe.py','print("preserve recipe")');
$options['pixflow_design_resource_packs']=['plugins'=>['slug'=>'plugins','version'=>'1','path'=>$legacy.'/plugins/1','status'=>'installed','contentRoots'=>['plugins'=>'plugins']]];
try {
 $paths=new PixflowDesign\WordPress\Resources\ResourcePackPathService();
 $base=$paths->base_dir();
 if(str_starts_with($base,ABSPATH))throw new RuntimeException('Resource HTML must not live in the public root');
 if(is_dir($legacy))throw new RuntimeException('Legacy public copies must be gone');
 foreach(['index.html','recipe.py'] as $file)if(!is_file($base.'/plugins/1/plugins/demo/'.$file))throw new RuntimeException('Preserve '.$file);
 $record=(new PixflowDesign\WordPress\Resources\ResourcePackRepository())->get('plugins');
 if($record['path']!==$base.'/plugins/1')throw new RuntimeException('Existing record must resolve privately');
 if($paths->base_url()!=='')throw new RuntimeException('Never return a direct public base URL');
 if($paths->base_dir()!==$base)throw new RuntimeException('Idempotent');
 echo "Private resources: migration, references, recipes and no public URL passed\n";
} finally {
 foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($fixture,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){if($f->isDir()&&!$f->isLink())rmdir($f->getPathname());else unlink($f->getPathname());}rmdir($fixture);
}
