<?php
declare(strict_types=1);
$root=sys_get_temp_dir().'/pixflow-migration-'.bin2hex(random_bytes(8));mkdir($root.'/public/uploads',0700,true);mkdir($root.'/public/plugin',0700,true);
define('ABSPATH',$root.'/public/');define('PIXFLOW_DESIGN_PLUGIN_DIR',ABSPATH.'plugin/');
file_put_contents($root.'/blocked','blocked');define('PIXFLOW_DESIGN_PRIVATE_RESOURCE_DIR',$root.'/blocked/resources');
$_SERVER['DOCUMENT_ROOT']=ABSPATH;
require __DIR__.'/../src/autoload.php';
use PixflowDesign\WordPress\Resources\ResourcePackPathService;
use PixflowDesign\WordPress\Resources\BundledResources;
use PixflowDesign\WordPress\Storage\EncryptedResourceMigration;
$options=['chats'=>['one'=>'unchanged'],'settings'=>['locale'=>'en']];$checks=0;
function get_option($k,$d=false){return $GLOBALS['options'][$k]??$d;}
function update_option($k,$v,...$a){$GLOBALS['options'][$k]=$v;return true;}
function add_option($k,$v,...$a){if(isset($GLOBALS['options'][$k]))return false;$GLOBALS['options'][$k]=$v;return true;}
function wp_normalize_path($p){return str_replace('\\','/',$p);}
function trailingslashit($p){return rtrim($p,'/\\').'/';}
function wp_upload_dir(...$a){return ['basedir'=>ABSPATH.'uploads'];}
function wp_mkdir_p($p){return is_dir($p)||@mkdir($p,0700,true);}
function check($v,$m){$GLOBALS['checks']++;if(!$v)throw new RuntimeException($m);}
function rejected(callable $fn){try{$fn();return false;}catch(Throwable){return true;}}
$legacy=ABSPATH.'uploads/pixflow-design/resource-packs';mkdir($legacy.'/custom',0700,true);
file_put_contents($legacy.'/custom/SKILL.md','# preserved');
mkdir(PIXFLOW_DESIGN_PLUGIN_DIR.'skills');file_put_contents(PIXFLOW_DESIGN_PLUGIN_DIR.'skills/old.md','Older guidance');
try{
 $paths=new ResourcePackPathService();$base=$paths->base_dir();
 check(str_starts_with($base,'pixflow-resource://'),'Restricted host automatically selects encrypted backend');
 check(file_get_contents($paths->resolve_record_path($legacy.'/custom/SKILL.md'))==='# preserved','Saved absolute path still reads');
 check(is_file($legacy.'/custom/SKILL.md'),'Activation precedes source cleanup');
 BundledResources::prepare();
 check(file_get_contents(BundledResources::legacy_root('skills').'/old.md')==='Older guidance','Legacy guidance available');
 $workspace=new PixflowDesign\WordPress\Admin\DirectSiteWorkspace();
 check(file_get_contents($workspace->resolve_path('SKILL.md',$base.'/custom'))==='# preserved','Direct reader uses encrypted mount');
 check(rejected(fn()=>$workspace->resolve_path('../custom/SKILL.md',$base.'/custom')),'Direct reader traversal blocked');
 $registry=new ReflectionClass(PixflowDesign\WordPress\Od\RegistryService::class);
 $method=$registry->getMethod('safe_plugin_asset_path');
 $service=$registry->newInstanceWithoutConstructor();
 check($method->invoke($service,$base.'/custom','SKILL.md')===$base.'/custom/SKILL.md','Registry reader resolves encrypted assets');
 check($method->invoke($service,$base.'/custom','../custom/SKILL.md')===null,'Registry traversal blocked');
 $tree=$paths->encrypted_tree();
 check(rejected(fn()=>$tree->locked(fn()=>$paths->recover_encrypted_migration(),'recovery')),'Concurrent cleanup is excluded');
 check(file_get_contents($legacy.'/custom/SKILL.md')==='# preserved','Excluded cleanup leaves source intact');
 file_put_contents($legacy.'/custom/SKILL.md','# newer');
 check(rejected(fn()=>$paths->recover_encrypted_migration()),'Changed source retained');
 check(file_get_contents($legacy.'/custom/SKILL.md')==='# newer','New source not deleted');
 file_put_contents($legacy.'/custom/SKILL.md','# preserved');
 $encryptedFiles=glob(ABSPATH.'uploads/pixflow-design/encrypted-resources-v1/*.pxr');$savedCipher=[];
 foreach($encryptedFiles as $file){$savedCipher[$file]=file_get_contents($file);file_put_contents($file,$savedCipher[$file].'corrupt');}
 check(rejected(fn()=>$paths->recover_encrypted_migration()),'Corrupted ciphertext blocks source retirement');
 check(file_get_contents($legacy.'/custom/SKILL.md')==='# preserved','Original survives failed ciphertext verification');
 foreach($savedCipher as $file=>$bytes)file_put_contents($file,$bytes);
 $paths->recover_encrypted_migration();
 check(!file_exists($legacy)&&!file_exists(PIXFLOW_DESIGN_PLUGIN_DIR.'skills'),'Verified plaintext retired');
 check(file_get_contents($base.'/custom/SKILL.md')==='# preserved','Reads survive cleanup');
 $paths->recover_encrypted_migration();
 check((new ResourcePackPathService())->base_dir()===$base,'Reopen uses stable paths');
 check($options['chats']===['one'=>'unchanged']&&$options['settings']===['locale'=>'en'],'Chats/settings preserved');
 echo "Encrypted resource migration: $checks checks passed\n";
}finally{
 foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST)as$f){if($f->isDir()&&!$f->isLink())rmdir($f->getPathname());else unlink($f->getPathname());}rmdir($root);
}
