<?php
declare(strict_types=1);
use PixflowDesign\WordPress\Diagnostics\SupportJournal;
define('ABSPATH',__DIR__.'/');
define('WP_DEBUG',false); define('WP_DEBUG_LOG',false);
$root = $argv[1] ?? (sys_get_temp_dir() . '/pixflow-journal-' . bin2hex(random_bytes(8)) . '/diagnostics');
define('PIXFLOW_DESIGN_PRIVATE_DIAGNOSTICS_DIR',$root);
define('WP_CONTENT_DIR',__DIR__.'/content');
function get_current_blog_id(){return $GLOBALS['blog'] ?? 1;}
function wp_upload_dir($time,$create){return ['basedir'=>__DIR__.'/uploads'];}
function wp_normalize_path($p){return str_replace('\\','/',$p);}
function wp_mkdir_p($p){return is_dir($p)||mkdir($p,0700,true);}
function update_option(...$args){return true;}
function add_filter(...$args){}
require dirname(__DIR__).'/src/autoload.php';
function check($ok,$m){if(!$ok)throw new RuntimeException($m);}
if (($argv[2] ?? '') === 'write') {
    SupportJournal::record('licence','verification-failed',0,'bridge:signature');
    SupportJournal::record('browser','PRIVATE_ERROR');
    SupportJournal::record('tools','rest-error',503,'PRIVATE_BODY');
    exit;
}
if (($argv[2] ?? '') === 'fatal') {
    SupportJournal::register();
    trigger_error('PRIVATE_FATAL_MESSAGE', E_USER_ERROR);
}
if (($argv[2] ?? '') === 'unavailable') {
    SupportJournal::record('tools','request-failed',503);
    check(SupportJournal::snapshot()['available'] === false, 'Unsafe storage must be reported unavailable');
    exit;
}
if (isset($argv[1])) throw new RuntimeException('Unexpected test arguments');
mkdir($root,0700,true);
try {
    $process=proc_open([PHP_BINARY,__FILE__,$root,'write'],[], $pipes);
    check(is_resource($process) && proc_close($process)===0,'Writer failed');
    $summary=SupportJournal::snapshot();
    check($summary['available'] && count($summary['entries'])===2, 'Events did not survive a new PHP process');
    check($summary['entries'][0]['check']==='bridge:signature' && !str_contains(json_encode($summary),'PRIVATE'), 'Sensitive text recorded');
    $process=proc_open([PHP_BINARY,'-d','display_errors=0','-d','log_errors=0',__FILE__,$root,'fatal'],[], $pipes);
    check(is_resource($process) && proc_close($process)!==0,'Fatal fixture did not terminate');
    $rows=SupportJournal::snapshot()['entries'];
    check(end($rows)['event']==='fatal' && end($rows)['file']===basename(__FILE__) && end($rows)['line']>0
        && !str_contains(json_encode($rows),'PRIVATE_FATAL_MESSAGE'), 'Fatal attribution or redaction failed');
    $GLOBALS['blog']=2;
    check(SupportJournal::snapshot()['entries']===[], 'Another site can see history');
    $GLOBALS['blog']=1;
    for($i=0;$i<150;$i++) SupportJournal::record('tools','rest-error',400+($i%2));
    check(count(SupportJournal::snapshot()['entries'])===128,'Unbounded file');
    $file=glob($root.'/site-1-*.json')[0];
    file_put_contents($file,json_encode([['at'=>time()-8*86400,'area'=>'php','event'=>'fatal','http'=>0]]));
    check(SupportJournal::snapshot()['entries']===[] && trim(file_get_contents($file))==='[]','Expired entries remain');
    check(SupportJournal::owned_file(dirname(__DIR__).'/src/Plugin.php'),'Pixflow file not recognized');
    check(!SupportJournal::owned_file(dirname(__DIR__).'-unrelated/runtime.php'),'Unrelated file accepted');
    $process=proc_open([PHP_BINARY,__FILE__,ABSPATH.'unsafe-storage','unavailable'],[], $pipes);
    check(is_resource($process) && proc_close($process)===0 && !file_exists(ABSPATH.'unsafe-storage'), 'Public fallback or uncaught failure');
    echo "Private support files pass across PHP processes with debugging off, site isolation, bounds, expiry and redaction.\n";
} finally {
    foreach(glob($root.'/*') as $file) unlink($file);
    rmdir($root);
    unlink(dirname($root).'/.diagnostics-migration.lock');
    rmdir(dirname($root));
}
