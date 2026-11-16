<?php
declare(strict_types=1);
// Isolated WordPress primitives: exercise authorization without opening a login session.
$transients=[]; $filters=[]; $allowed=true;
$post=(object)['post_type'=>'page','post_status'=>'draft'];
function get_post($id) { global $post; return $id===9 ? $post : null; }
function current_user_can(...$args) { global $allowed; return $allowed; }
function user_can(...$args) { return current_user_can(); }
function get_current_user_id() { return 4; }
function get_current_blog_id() { return 1; }
function set_transient($key,$value,$ttl) { global $transients; $transients[$key]=$value; }
function get_transient($key) { global $transients; return $transients[$key]??false; }
function delete_transient($key) { global $transients; unset($transients[$key]); }
function home_url($path) { return 'https://site.example/sub'.$path; }
function add_query_arg($args,$url) { return $url.'?'.http_build_query($args); }
function wp_parse_url($url,$component=-1) { return parse_url($url,$component); }
function add_filter($name,$callback,$priority=10) { global $filters; $filters[$name]=$callback; }
function wp_die(...$args) { throw new RuntimeException('denied'); }
require __DIR__.'/../src/Http/SavedPreviewAccess.php';
use PixflowDesign\WordPress\Http\SavedPreviewAccess as Preview;
function check($condition,$label) { if(!$condition) throw new RuntimeException($label); }
function denied(callable $run) { try {$run();} catch(RuntimeException $e) { return; } throw new RuntimeException('Unexpected access'); }
$session=['editorTarget'=>['postId'=>9],'userId'=>4,'blogId'=>1,'expiresAt'=>time()+3600];
set_transient('session',$session,3600);
$grant=Preview::issue($session,'session',9);
$_SERVER=['HTTP_X_PIXFLOW_PREVIEW'=>$grant['token'],'REQUEST_METHOD'=>'GET','REQUEST_URI'=>'/sub/?page_id=9&preview=true'];
check(Preview::authenticate(0)===4,'Exact saved draft authorized');
check($filters['wp_headers']([])['Cache-Control']==='private, no-store, max-age=0','Private cache policy');
foreach(['/sub/?page_id=10&preview=true','/wp-admin/','/sub/?page_id=9&preview=true&action=delete'] as $uri) {
    $_SERVER['REQUEST_URI']=$uri; denied(fn()=>Preview::authenticate(0));
}
$_SERVER['REQUEST_URI']='/sub/?page_id=9&preview=true';
$_SERVER['REQUEST_METHOD']='POST'; denied(fn()=>Preview::authenticate(0));
$_SERVER['REQUEST_METHOD']='GET';
$allowed=false; denied(fn()=>Preview::authenticate(0)); $allowed=true;
$post->post_status='trash'; denied(fn()=>Preview::authenticate(0)); $post->post_status='draft';
delete_transient('session'); denied(fn()=>Preview::authenticate(0)); set_transient('session',$session,3600);
Preview::revoke($grant['token'],'wrong-session'); check(Preview::authenticate(0)===4,'Other session cannot revoke');
Preview::revoke($grant['token'],'session'); denied(fn()=>Preview::authenticate(0));
$post->post_type='post'; $grant=Preview::issue($session,'session',9);
check(str_contains($grant['url'],'?p=9&'),'Posts use native post query');
$_SERVER['HTTP_X_PIXFLOW_PREVIEW']=$grant['token']; $_SERVER['REQUEST_URI']='/sub/?p=9&preview=true';
check(Preview::authenticate(0)===4,'Post preview authorized');
$_SERVER['HTTP_X_PIXFLOW_PREVIEW']=''; check(Preview::authenticate(7)===7,'Ordinary authentication unchanged');
denied(fn()=>Preview::issue($session,'session',10));
echo "Saved preview scope, revocation and read-only access passed.\n";
