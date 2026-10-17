<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
$fixture=sys_get_temp_dir().'/pixflow-private-upload-'.bin2hex(random_bytes(6));mkdir($fixture,0700,true);
$GLOBALS['filters']=[];$GLOBALS['fixture']=$fixture;
function add_filter($name,$callback,$priority=10){$GLOBALS['filters'][$name][$priority][]=$callback;}
function remove_filter($name,$callback,$priority=10){foreach($GLOBALS['filters'][$name][$priority]??[] as$key=>$value)if($value===$callback)unset($GLOBALS['filters'][$name][$priority][$key]);}
function wp_normalize_path($path){return str_replace('\\','/',$path);}
function wp_delete_file($path){if(is_file($path))unlink($path);}
function wp_handle_upload(&$file,$overrides){
    $uploads=['path'=>'/public/uploads','basedir'=>'/public/uploads','url'=>'https://site.test/uploads','baseurl'=>'https://site.test/uploads','subdir'=>'','error'=>false];
    foreach($GLOBALS['filters']['upload_dir']??[]as$callbacks)foreach($callbacks as$callback)$uploads=$callback($uploads);
    $GLOBALS['observed']=[$uploads,$overrides];
    if(($GLOBALS['mode']??'')==='exception')throw new RuntimeException('Host failed');
    if(($GLOBALS['mode']??'')==='error')return ['error'=>'Denied by native upload validation'];
    $target=$uploads['path'].'/'.$overrides['unique_filename_callback']();
    if(($GLOBALS['mode']??'')==='redirect')$target=$GLOBALS['fixture'].'/outside.zip';
    $pre=null;
    foreach($GLOBALS['filters']['pre_move_uploaded_file']??[]as$callbacks)foreach($callbacks as$callback)$pre=$callback($pre,$file,$target);
    if($pre===false)return ['error'=>'Private destination check denied the move'];
    copy($file['tmp_name'],$target);
    if(($GLOBALS['mode']??'')==='partial-exception')throw new RuntimeException('Filter failed after moving the upload');
    if(($GLOBALS['mode']??'')==='unexpected')return ['file'=>$GLOBALS['fixture'].'/outside.zip'];
    return ['file'=>$target,'type'=>'application/zip','url'=>''];
}
require __DIR__.'/../src/Http/Routes/ProjectRoutes.php';
$class=new ReflectionClass(\PixflowDesign\WordPress\Http\Routes\ProjectRoutes::class);
$service=$class->newInstanceWithoutConstructor();$method=$class->getMethod('stage_native_upload');
$checks=0;function check($ok,$message){if(!$ok)throw new RuntimeException($message);$GLOBALS['checks']++;}
function call_stage($method,$service,$source,$stage){$method->invoke($service,['name'=>'project.zip','tmp_name'=>$source,'type'=>'application/zip','size'=>7,'error'=>0],$stage);}
$source=$fixture.'/temp-upload';file_put_contents($source,'archive');$stage=$fixture.'/private-version.zip.tmp-uuid';
call_stage($method,$service,$source,$stage);
check(file_get_contents($stage)==='archive','Native upload creates the exact complete private sibling stage');
$uploads=$GLOBALS['observed'][0];$overrides=$GLOBALS['observed'][1];
check(realpath($uploads['path'])===realpath($fixture)&&$uploads['url']===''&&$uploads['baseurl']==='','Native upload cannot use public uploads path or URL');
check($overrides['test_form']===false&&!isset($overrides['test_type']),'Only form action is skipped; native MIME/upload checks stay enabled');
check(isset($overrides['mimes']['zip'],$overrides['mimes']['png'])&&!isset($overrides['mimes']['php']),'Native MIME allowlist only supports project archive/previews');
check(empty($GLOBALS['filters']['upload_dir'][PHP_INT_MAX]),'Upload directory filter removed after success');
unlink($stage);file_put_contents($fixture.'/outside.zip','unrelated');
foreach(['error','unexpected','exception','partial-exception','redirect']as$mode){
    $GLOBALS['mode']=$mode;$failed=false;try{call_stage($method,$service,$source,$stage);}catch(RuntimeException){$failed=true;}
    check($failed,'Native validation/filter/host failure is reported');
    check(!is_file($stage),'Failed native staging leaves no partial stage');
    check(empty($GLOBALS['filters']['upload_dir'][PHP_INT_MAX]),'Upload directory filter always restored');
    check(empty($GLOBALS['filters']['pre_move_uploaded_file'][PHP_INT_MAX]),'Private move guard always restored');
    check(file_get_contents($fixture.'/outside.zip')==='unrelated','Unexpected filter result never authorizes deleting another path');
}
foreach(glob($fixture.'/*')as$path)unlink($path);rmdir($fixture);
echo 'Private native upload checks passed: '.$checks."\n";
