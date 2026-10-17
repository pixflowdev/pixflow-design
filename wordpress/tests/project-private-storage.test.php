<?php
declare(strict_types=1);
$fixture = sys_get_temp_dir() . '/pixflow-private-test-' . bin2hex(random_bytes(8));
mkdir($fixture . '/public/uploads', 0700, true);
define('ABSPATH', $fixture . '/public/');
$_SERVER['DOCUMENT_ROOT'] = ABSPATH;
$options = [];
function wp_normalize_path($path) { return str_replace('\\', '/', $path); }
function trailingslashit($path) { return rtrim($path, '/') . '/'; }
function untrailingslashit($path) { return rtrim($path, '/'); }
function wp_upload_dir(...$args) { return ['basedir'=>ABSPATH.'uploads', 'baseurl'=>'https://example.test/uploads']; }
function wp_mkdir_p($path) { return is_dir($path) || mkdir($path, 0700, true); }
function get_option($key, $default = false) { return $GLOBALS['options'][$key] ?? $default; }
function update_option($key, $value, ...$args) { $GLOBALS['options'][$key]=$value; }
function rest_url($path) { return 'https://example.test/wp-json/'.$path; }
function wp_create_nonce($action) { return 'nonce'; }
function add_query_arg($key, $value, $url) { return $url.'?'.$key.'='.$value; }
require __DIR__.'/../src/Projects/ProjectStorage.php';
$uuid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
$legacy=ABSPATH.'uploads/pixflow-design/projects';
mkdir($legacy.'/'.$uuid.'/files',0700,true);
file_put_contents($legacy.'/'.$uuid.'/files/index.html','private saved content');
file_put_contents($legacy.'/'.$uuid.'/files/old.php','inert legacy content');
$checks=0;
function check($ok,$message) { $GLOBALS['checks']++; if(!$ok) throw new RuntimeException($message); }
try {
    $store=new PixflowDesign\WordPress\Projects\ProjectStorage();
    $path=$store->ensure_files_dir($uuid);
    check(!str_starts_with(wp_normalize_path($path),wp_normalize_path(ABSPATH)), 'Private files must be outside the document root');
    check(!file_exists($legacy), 'Public legacy tree must be removed atomically');
    check(file_get_contents($path.'/index.html')==='private saved content','Preserve HTML');
    check(file_get_contents($path.'/old.php')==='inert legacy content','Preserve legacy files privately');
    $logical='pixflow-design/projects/'.$uuid.'/files/index.html';
    check($store->absolute_upload_path($logical)===$path.'/index.html','Resolve old database paths');
    check($store->relative_upload_path($path.'/index.html')===$logical,'Keep logical paths stable');
    check(str_contains($store->upload_url($logical),'/projects/'.$uuid.'/stored/files/index.html?_wpnonce='),'Use authenticated download URL');
    check((new PixflowDesign\WordPress\Projects\ProjectStorage())->ensure_files_dir($uuid)===$path,'Repeated access is idempotent');
    $origin_key='pixflow_design_private_project_root_origin';$origin=$options[$origin_key];$options[$origin_key]='copied-database';
    $rejected=false;try{(new PixflowDesign\WordPress\Projects\ProjectStorage())->ensure_files_dir($uuid);}catch(Throwable){$rejected=true;}
    check($rejected,'A cloned database cannot reuse another installation storage');$options[$origin_key]=$origin;
    foreach(['../wp-config.php','pixflow-design/projects/'.$uuid.'/../secret','pixflow-design/projects/'.$uuid.'/files/../../secret','/etc/passwd','C:/secret','pixflow-design/projects/'.$uuid.'/files/a:stream'] as $bad) {
        $rejected=false; try {$store->absolute_upload_path($bad);}catch(Throwable){$rejected=true;}
        check($rejected,'Reject path escape '.$bad);
    }
    $key='pixflow_design_private_project_root'; $saved=$options[$key];
    $options[$key]=ABSPATH.'uploads/bad';
    $rejected=false;try{(new PixflowDesign\WordPress\Projects\ProjectStorage())->ensure_files_dir($uuid);}catch(Throwable){$rejected=true;}
    check($rejected,'Reject configured public storage');$options[$key]=$saved;
    mkdir($legacy.'/'.$uuid.'/files',0700,true);file_put_contents($legacy.'/'.$uuid.'/files/index.html','conflicting legacy file');
    $rejected=false;try{(new PixflowDesign\WordPress\Projects\ProjectStorage())->ensure_files_dir($uuid);}catch(Throwable){$rejected=true;}
    check($rejected,'Conflicting migration fails without overwriting either tree');
    check(file_get_contents($path.'/index.html')==='private saved content','Conflict preserves private copy');
    check(file_get_contents($legacy.'/'.$uuid.'/files/index.html')==='conflicting legacy file','Conflict preserves original');
    echo "project-private-storage: $checks checks passed\n";
} finally {
    $iterator=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($fixture,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
    foreach($iterator as $file){if($file->isDir()&&!$file->isLink())rmdir($file->getPathname());else unlink($file->getPathname());}rmdir($fixture);
}
