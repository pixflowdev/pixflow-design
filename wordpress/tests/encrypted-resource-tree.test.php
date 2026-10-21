<?php
declare(strict_types=1);
define('ABSPATH', __DIR__.'/');
require __DIR__.'/../src/autoload.php';
use PixflowDesign\WordPress\Storage\EncryptedResourceTree;
$options=[]; $rejectCommit=false; $commits=0;
function get_option($k,$d=false){return $GLOBALS['options'][$k]??$d;}
function add_option($k,$v,...$args){if(isset($GLOBALS['options'][$k]))return false;$GLOBALS['options'][$k]=$v;return true;}
function update_option($k,$v,...$args){if($GLOBALS['rejectCommit'])return false;$GLOBALS['commits']++;$GLOBALS['options'][$k]=$v;return true;}
$checks=0;
function check($v,$why){$GLOBALS['checks']++;if(!$v)throw new RuntimeException($why);}
function denied(callable $fn){try{$fn();return false;}catch(RuntimeException){return true;}}
$root=sys_get_temp_dir().'/pixflow-tree-'.bin2hex(random_bytes(8));mkdir($root,0700,true);
try {
 mkdir($root.'/source');mkdir($root.'/source/nested');
 file_put_contents($root.'/source/a.md','A');file_put_contents($root.'/source/nested/b.md','B');
 $tree=new EncryptedResourceTree($root.'/vault');
 $first=$tree->import($root.'/source','legacy',1);
 check(!$first['complete'] && $first['copied']===1,'Bounded import');
 $tree=new EncryptedResourceTree($root.'/vault');
 check($tree->import($root.'/source','legacy',1)['complete'],'Restart resumes existing copies');
 check($tree->read('legacy/a.md')==='A' && $tree->read('legacy/nested/b.md')==='B','All readers survive reopen');
 check(file_get_contents($root.'/source/a.md')==='A','Source retained');
 check($tree->import($root.'/source','legacy')['copied']===0,'Retry is idempotent');
 file_put_contents($root.'/source/a.md','changed');
 check(denied(fn()=>$tree->import($root.'/source','legacy')),'Changed source blocks migration');
 check($tree->read('legacy/a.md')==='A','Old encrypted copy retained');
 check(file_get_contents($root.'/source/a.md')==='changed','Changed source retained');
 $rejectCommit=true;
 check(denied(fn()=>$tree->put('new.md','pending')),'Database failure reported');
 check(denied(fn()=>$tree->read('new.md')),'Uncommitted object not visible');
 $rejectCommit=false;$tree->put('new.md','pending');
 check($tree->read('new.md')==='pending','Retry recovers orphaned encrypted object');
 $url=\PixflowDesign\WordPress\Storage\EncryptedResourceReader::mount($tree);
 check(file_get_contents($url.'/legacy/a.md')==='A','Stream read');
 check(is_dir($url.'/legacy') && is_file($url.'/legacy/a.md'),'Directory and file stat');
 $found=[];
 foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($url,FilesystemIterator::SKIP_DOTS))as$file)$found[]=$file->getPathname();
 check(count($found)===3,'Recursive readers enumerate nested resources');
 check(\PixflowDesign\WordPress\Storage\EncryptedResourceReader::canonical($url.'/legacy/a.md')===$url.'/legacy/a.md','Canonical mounted reference');
 check(\PixflowDesign\WordPress\Storage\EncryptedResourceReader::canonical($url.'/legacy/../new.md')===false,'Mounted traversal denied');
 check(@file_put_contents($url.'/new.md','bad')===false,'Read-only wrapper');
 check($tree->read('new.md')==='pending','Rejected stream write preserves bytes');
 $tree->put('inert.php','<?php $GLOBALS["resourceExecuted"]=true;');
 $GLOBALS['resourceExecuted']=false;
 @include $url.'/inert.php';
 check(!$GLOBALS['resourceExecuted'],'Encrypted resources cannot execute PHP');
 check(denied(fn()=>$tree->put('../escape','x')),'Traversal denied');
 check(denied(fn()=>$tree->locked(fn()=>(new EncryptedResourceTree($root.'/vault'))->put('concurrent.md','x'))),'Concurrent writer excluded');
 check(!isset($tree->entries()['concurrent.md']),'Rejected writer has no side effects');
 $savedOptions=$options;
 unset($options['pixflow_design_resource_encryption_key_v1']);
 check(denied(fn()=>new EncryptedResourceTree($root.'/vault')),'Missing key fails closed');
 $options=$savedOptions;
 check((new EncryptedResourceTree($root.'/vault'))->read('new.md')==='pending','Matching database backup restores access');
 mkdir($root.'/batch');file_put_contents($root.'/batch/one.md','one');file_put_contents($root.'/batch/two.md','two');
 $rejectCommit=true;
 check(denied(fn()=>$tree->import($root.'/batch','batch')),'Batch database commit failure reported');
 check(!isset($tree->entries()['batch/one.md'])&&!isset($tree->entries()['batch/two.md']),'Failed batch is not partially visible');
 check(is_file($root.'/batch/one.md')&&is_file($root.'/batch/two.md'),'Failed batch retains all sources');
 $rejectCommit=false;
 check($tree->import($root.'/batch','batch')['complete'],'Retry commits previously encrypted batch');
 mkdir($root.'/large');for($i=0;$i<125;$i++)file_put_contents($root.'/large/'.$i.'.md','Preserved '.$i);
 $commits=0;
 check(!$tree->import($root.'/large','large',50)['complete'],'Large import is bounded');
 check(!$tree->import($root.'/large','large',50)['complete'],'Large import resumes');
 check($tree->import($root.'/large','large',50)['complete'],'Large import completes');
 check($commits===3,'One index commit per batch, not per file');
 check(count(glob($root.'/large/*.md'))===125&&$tree->read('large/124.md')==='Preserved 124','Large source and encrypted content preserved');
 echo "Encrypted resource tree: $checks checks passed\n";
} finally {
 foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST)as$f){if($f->isDir()&&!$f->isLink())rmdir($f->getPathname());else unlink($f->getPathname());}rmdir($root);
}
