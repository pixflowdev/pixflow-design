<?php
declare(strict_types=1);
define('ABSPATH',__DIR__.'/');
class WP_Error {public function __construct(public string $code, public string $message) {}}
function is_wp_error($v){return $v instanceof WP_Error;}
function WP_Filesystem(){return true;}
function unzip_file($file,$target){$GLOBALS['extracted']=true;return true;}
require __DIR__.'/../src/Resources/ResourcePackInstallService.php';
$type=new ReflectionClass(PixflowDesign\WordPress\Resources\ResourcePackInstallService::class);$svc=$type->newInstanceWithoutConstructor();
$zipfile=tempnam(sys_get_temp_dir(),'pixflow-zip-');$checks=0;
function check($ok,$m){$GLOBALS['checks']++;if(!$ok)throw new RuntimeException($m);}
try{
 foreach(['../escape.txt','nested/../../escape.txt','/absolute.txt','C:/escape.txt','nested/file.php','nested/file.php.jpg','nested/.htaccess','nested/.user.ini','nested/web.config','nested/file.phtml','nested/file.cgi','nested/.. /escape.txt'] as $name){
  $z=new ZipArchive();$z->open($zipfile,ZipArchive::CREATE|ZipArchive::OVERWRITE);$z->addFromString($name,'inert archive fixture');$z->close();$GLOBALS['extracted']=false;
  $r=$type->getMethod('unzip_archive')->invoke($svc,$zipfile,sys_get_temp_dir());
  check(is_wp_error($r)&&!$GLOBALS['extracted'],'Reject before extraction: '.$name);
 }
 $z=new ZipArchive();$z->open($zipfile,ZipArchive::CREATE|ZipArchive::OVERWRITE);$z->addFromString('pack/assets/icon.svg','<svg/>');$z->addFromString('pack/pixflow-pack.json','{}');$z->close();
 check($type->getMethod('unzip_archive')->invoke($svc,$zipfile,sys_get_temp_dir())===true,'Normal resource archive remains supported');
 check(!$type->getMethod('verify_checksum')->invoke($svc,$zipfile,''),'Missing checksum is denied');
 check($type->getMethod('verify_checksum')->invoke($svc,$zipfile,'sha256:'.hash_file('sha256',$zipfile)),'Valid checksum works');
 echo "resource-archive-security: $checks checks passed\n";
}finally{unlink($zipfile);}
