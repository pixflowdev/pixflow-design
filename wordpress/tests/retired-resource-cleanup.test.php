<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Resources {
 class ResourcePackPathService {
  public function base_dir():string { return $GLOBALS['base']; }
  public function resolve_record_path(string $p):string { return $p; }
 }
}
namespace {
 define('ABSPATH',__DIR__.'/');
 $base=str_replace('\\','/',sys_get_temp_dir()).'/pixflow-retired-'.bin2hex(random_bytes(6));mkdir($base);
 $options=[];$scheduled=false;
 function wp_normalize_path($p){return str_replace('\\','/',$p);}
 function sanitize_key($v){return preg_replace('/[^a-z0-9_-]/','',strtolower($v));}
 function get_option($k,$d=false){return $GLOBALS['options'][$k]??$d;}
 function update_option($k,$v,...$a){$GLOBALS['options'][$k]=$v;}
 function delete_option($k){unset($GLOBALS['options'][$k]);}
 function wp_next_scheduled($k){return $GLOBALS['scheduled'];}
 function wp_schedule_single_event(...$args){$GLOBALS['scheduled']=true;}
 function wp_clear_scheduled_hook(...$args){$GLOBALS['scheduled']=false;}
 function check($v,$m){if(!$v)throw new \RuntimeException($m);}
 require __DIR__.'/../src/Resources/ResourcePackRepository.php';
 require __DIR__.'/../src/Resources/RetiredResourceCleanup.php';
 $class=\PixflowDesign\WordPress\Resources\RetiredResourceCleanup::class;
 $repo=new \PixflowDesign\WordPress\Resources\ResourcePackRepository();
 foreach($class::SLUGS as $slug){foreach(['old','new']as$v){mkdir($base.'/'.$slug.'/'.$v,0700,true);file_put_contents($base.'/'.$slug.'/'.$v.'/file','retired');}$repo->save_pack($slug,['version'=>'new','path'=>'/outside/never-delete','status'=>'installed']);}
 mkdir($base.'/_bundled');file_put_contents($base.'/_bundled/guidance','keep');mkdir($base.'/custom');file_put_contents($base.'/custom/design','keep');
 $repo->save_pack('custom',['path'=>$base.'/custom','version'=>'1','status'=>'installed']);$custom=$repo->get('custom');
 $options['pixflow_design_app_config']=['preserve'=>true];
 $options['pixflow_design_resource_pack_operations']=['old'=>['slug'=>'plugins'],'custom'=>['slug'=>'custom']];
 $options['pixflow_design_resource_pack_manifest']=['old'=>true];
 $repo->acquire_lock('plugins','running');$state=$class::run(2);check(is_file($base.'/plugins/old/file'),'In-flight work is deferred');$repo->release_lock('plugins','running');
 $state=$class::run(2);check(!$state['complete']&&$scheduled,'Partial cleanup reschedules');check($repo->get('plugins')!==null,'Record retained until all versions deleted');
 for($i=0;$i<30&&!$state['complete'];$i++)$state=$class::run(2);
 check($state['complete']&&!$scheduled,'Cleanup completes and clears schedule');check($state['bytesRemoved']===42,'Bytes accounted across batches');
 foreach($class::SLUGS as$slug){check(!file_exists($base.'/'.$slug),'All old/new downloaded versions gone');check($repo->get($slug)===null,'Retired record gone');}
 check(file_get_contents($base.'/_bundled/guidance')==='keep','Bundled guidance preserved');check($repo->get('custom')===$custom&&file_get_contents($base.'/custom/design')==='keep','User resources preserved');check($options['pixflow_design_app_config']===['preserve'=>true],'Settings preserved');check(!isset($options['pixflow_design_resource_pack_manifest']),'Stale remote catalogue removed');check(count($options['pixflow_design_resource_pack_operations'])===1,'Unrelated operations preserved');check($class::run()===$state,'Idempotent');
 // A linked retired directory must never be traversed, even when its target is inside the resource root.
 unset($options['pixflow_design_retired_resources_cleanup_v1']);
 $linked=@symlink($base.'/custom',$base.'/plugins');
 if($linked){$s=$class::run();check(!$s['complete']&&($s['retryNeeded']??false),'Unsafe path fails closed');check(file_get_contents($base.'/custom/design')==='keep','Symlink target preserved');unlink($base.'/plugins');echo "Symlink boundary passed\n";}
 else echo "Symlink creation unavailable on this host\n";
 foreach(new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($base,\FilesystemIterator::SKIP_DOTS),\RecursiveIteratorIterator::CHILD_FIRST)as$f){if($f->isDir())rmdir($f->getPathname());else unlink($f->getPathname());}rmdir($base);
 echo "Retired cleanup: bounded batches, locks, all versions, records, metadata, preservation and idempotence passed\n";
}
