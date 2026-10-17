<?php
declare(strict_types=1);
define('ABSPATH', __DIR__.'/');
function wp_normalize_path($p){return str_replace('\\','/',$p);}
function trailingslashit($p){return rtrim($p,'/').'/';}
require __DIR__.'/../src/Od/RegistryService.php';
$type=new ReflectionClass(PixflowDesign\WordPress\Od\RegistryService::class);$service=$type->newInstanceWithoutConstructor();$method=$type->getMethod('safe_plugin_asset_path');
$root=sys_get_temp_dir().'/resource-path-'.bin2hex(random_bytes(8));mkdir($root);file_put_contents($root.'/index.html','preserve');
try {
 foreach(['../index.html','%2e%2e/index.html','/index.html','C:/index.html','index.html:stream'] as $path){if($method->invoke($service,$root,$path)!==null)throw new RuntimeException('Reject '.$path);}
 if($method->invoke($service,$root,'index.html')!==wp_normalize_path($root.'/index.html'))throw new RuntimeException('Normal file');
 if($method->invoke($service,$root,'./index.html')!==wp_normalize_path($root.'/index.html'))throw new RuntimeException('Manifest-relative file');
 echo "Resource asset path validation passed\n";
}finally{unlink($root.'/index.html');rmdir($root);}
