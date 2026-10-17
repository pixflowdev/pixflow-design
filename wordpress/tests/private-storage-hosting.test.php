<?php
declare(strict_types=1);
$scenario=$argv[1]??'nested';$fixture=$argv[2]??(sys_get_temp_dir().'/hosting-'.bin2hex(random_bytes(8)));
if(!is_dir($fixture))mkdir($fixture,0700,true);
$web=$fixture.'/public';$wp=$web.($scenario==='nested'?'/wordpress':'');mkdir($wp.'/uploads',0700,true);
define('ABSPATH',$wp.'/');$_SERVER['DOCUMENT_ROOT']=$web;$options=[];
function wp_normalize_path($v){return str_replace('\\','/',$v);}
function wp_upload_dir(...$a){return ['basedir'=>ABSPATH.'uploads'];}
function wp_mkdir_p($p){return is_dir($p)||@mkdir($p,0700,true);}
function get_option($k,$d=false){return $GLOBALS['options'][$k]??$d;}
function update_option($k,$v,...$a){$GLOBALS['options'][$k]=$v;}
require __DIR__.'/../src/Storage/PrivateDirectory.php';
if($scenario==='public-config')define('PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR',$web.'/unsafe');
if($scenario==='blocked-parent'){file_put_contents($fixture.'/blocked','not a directory');define('PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR',$fixture.'/blocked/resources');}
if($scenario==='cli-unconfigured')unset($_SERVER['DOCUMENT_ROOT']);
$legacy=ABSPATH.'uploads/pixflow-design/resource-packs';mkdir($legacy.'/example',0700,true);file_put_contents($legacy.'/example/index.html','private-marker');
try {
 $store=new PixflowDesign\WordPress\Storage\PrivateDirectory('resource-packs','resource_root','PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR');
 try{$root=$store->directory();$denied=false;}catch(Throwable $e){$denied=true;}
 if(in_array($scenario,['public-config','blocked-parent','cli-unconfigured'],true)){
  if(!$denied||file_get_contents($legacy.'/example/index.html')!=='private-marker')throw new RuntimeException('Failure must preserve original');
 }else{
  if($denied||str_starts_with($root,wp_normalize_path($web).'/')||is_dir($legacy)||file_get_contents($root.'/example/index.html')!=='private-marker')throw new RuntimeException('Private migration: '.($denied ? $e->getMessage() : 'file or boundary assertion'));
  unset($_SERVER['DOCUMENT_ROOT']);if((new PixflowDesign\WordPress\Storage\PrivateDirectory('resource-packs','resource_root','PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR'))->directory()!==$root)throw new RuntimeException('CLI reuse');
 }
 echo json_encode(['scenario'=>$scenario,'denied'=>$denied,'public'=>$web,'root'=>$root??null])."\n";
}finally{
 if(!isset($argv[2])){foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($fixture,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $f){if($f->isDir()&&!$f->isLink())rmdir($f->getPathname());else unlink($f->getPathname());}rmdir($fixture);}
}
