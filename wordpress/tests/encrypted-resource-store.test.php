<?php
declare(strict_types=1);
define('ABSPATH',__DIR__.'/');
require __DIR__.'/../src/autoload.php';
use PixflowDesign\WordPress\Storage\EncryptedResourceStore;
$root=sys_get_temp_dir().'/pixflow-vault-'.bin2hex(random_bytes(8));mkdir($root,0700,true);
$options=[];function get_option($k,$d=false){return $GLOBALS['options'][$k]??$d;}function add_option($k,$v,...$a){if(isset($GLOBALS['options'][$k]))return false;$GLOBALS['options'][$k]=$v;return true;}
$n=0;function check($v,$m){$GLOBALS['n']++;if(!$v)throw new RuntimeException($m);}function denied(callable $fn){try{$fn();return false;}catch(RuntimeException){return true;}}
try {
 $vault=EncryptedResourceStore::open($root.'/vault');
 $body='Private resource '.bin2hex(random_bytes(32));
 $vault->put('skills/custom/DESIGN.md',$body);check($vault->read('skills/custom/DESIGN.md')===$body,'Roundtrip');
 $vault->put('skills/custom/DESIGN.md',$body);check($vault->read('skills/custom/DESIGN.md')===$body,'Retry');
 check(denied(fn()=>$vault->put('skills/custom/DESIGN.md','different')),'Conflict must not overwrite');
 check($vault->read('skills/custom/DESIGN.md')===$body,'Original after conflict');
 check(denied(fn()=>$vault->read('../escape')),'Traversal');
 check(denied(fn()=>$vault->put('/absolute','x')),'Absolute path');
 check(denied(fn()=>$vault->put('x//y','x')),'Ambiguous path');
 $files=glob($root.'/vault/*.pxr');$cipher=file_get_contents($files[0]);
 check(!str_contains($cipher,$body),'No plaintext content');
 check(!str_contains($files[0],'DESIGN'),'No plaintext name');
 $vault->put('skills/other/DESIGN.md',$body);$files=glob($root.'/vault/*.pxr');
 check(file_get_contents($files[0])!==file_get_contents($files[1]),'Independent IVs/identity');
 $original=file_get_contents($files[0]);file_put_contents($files[0],file_get_contents($files[1]));
 check(denied(fn()=>$vault->read('skills/custom/DESIGN.md'))||denied(fn()=>$vault->read('skills/other/DESIGN.md')),'Substitution authentication');file_put_contents($files[0],$original);
 $key=base64_decode($options['pixflow_design_resource_encryption_key_v1']);
 foreach(glob($root.'/vault/*') as $f)check(!str_contains(file_get_contents($f),$key),'No key on disk');
 check(denied(fn()=>(new EncryptedResourceStore($root.'/vault',random_bytes(32)))->read('skills/custom/DESIGN.md')),'Wrong key');
 file_put_contents($root.'/source','Preserved source');$receipt=$vault->preserve_file('legacy/example.html',$root.'/source');
 check(file_get_contents($root.'/source')==='Preserved source','Source retained before retirement');
 check($receipt['sha256']===hash('sha256','Preserved source'),'Verified receipt');
 $vault->preserve_file('legacy/example.html',$root.'/source');check($vault->read('legacy/example.html')==='Preserved source','Interrupted migration retry');
 file_put_contents($root.'/source','New source');check(denied(fn()=>$vault->preserve_file('legacy/example.html',$root.'/source')),'Changed source blocks retirement');
 check(file_get_contents($root.'/source')==='New source','Changed source retained');
 unset($options['pixflow_design_resource_encryption_key_v1']);check(denied(fn()=>EncryptedResourceStore::open($root.'/vault')),'Lost key never replaced');
 check(!isset($options['pixflow_design_resource_encryption_key_v1']),'No replacement key');
 echo "Encrypted resource store: $n checks passed\n";
}finally{
 foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST)as$f){if($f->isDir()&&!$f->isLink())rmdir($f->getPathname());else unlink($f->getPathname());}rmdir($root);
}
