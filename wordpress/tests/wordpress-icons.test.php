<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
$options=[];
function get_option($k,$d=[]){return $GLOBALS['options'][$k]??$d;}
function sanitize_key($s){return strtolower($s);}
function sanitize_title($s){return strtolower(str_replace(' ','-',$s));}
function sanitize_text_field($s){return strip_tags($s);}
function get_post_mime_type($id){return $id===99?'text/plain':'image/svg+xml';}
function wp_get_attachment_url($id){return 'https://site.test/'.$id.'.svg';}
function check($ok,$s){if(!$ok)throw new RuntimeException($s);}
function wp_kses($content,$allowed){$GLOBALS['svgAllowed']=$allowed;return $content;}
require __DIR__.'/../src/Icons/WordPressIconLibrary.php';
require __DIR__.'/../src/Modules/BuilderIntegrations.php';
use PixflowDesign\WordPress\Icons\WordPressIconLibrary as Icons;
$sets=[['id'=>'lucide','name'=>'Lucide','icons'=>[['id'=>'arrow-left','name'=>'Arrow left','attachment_id'=>7],['id'=>'bad','attachment_id'=>99]]],['id'=>'disabled','enabled'=>false,'icons'=>[['id'=>'x','attachment_id'=>8]]]];
$options['pixflow_ai_icon_sets_installed']=$sets;
set_error_handler(static function($severity, $message) { throw new RuntimeException($message); });
check(Icons::entries([false, null, 'invalid'])===[], 'First-install empty option values are ignored without warnings');
restore_error_handler();
check(count(Icons::entries($sets))===1,'Only enabled SVGs enter picker');
check(count(Icons::entries($sets,false))===2,'Disabled placed SVGs remain renderable');
check(Icons::entries($sets)[0]['name']==='pixflow-lucide/arrow-left-7','Stable names retain media id');
$state=Icons::state();
check(!$state['native'] && $state['icons'][0]['block']['name']==='core/image','Older WordPress receives ordinary Image fallback');
check($state['icons'][0]['block']['attributes']['id']===7,'Fallback is connected to real media');
check(!isset($state['icons'][0]['block']['attributes']['width']), 'Fallback avoids version-dependent Image dimension attribute types');
$response=new class {public array $data=[['name'=>'core/home'],['name'=>'pixflow-lucide/arrow-left-7'],['name'=>'pixflow-disabled/x-8']];function get_data(){return $this->data;}function set_data($d){$this->data=$d;}function get_status(){return 200;}};
$request=new class {public string $route='/wp/v2/icons';function get_route(){return $this->route;}};
Icons::filter_picker($response,null,$request);check(count($response->data)===2,'Picker omits disabled names without removing core');
$request->route='/wp/v2/icons/pixflow-disabled/x-8';$response->data=['name'=>'pixflow-disabled/x-8'];
Icons::filter_picker($response,null,$request);check($response->data===['name'=>'pixflow-disabled/x-8'],'Placed icon lookup remains available');
$outline='<svg viewBox="0 0 24 24" stroke="currentColor"><g fill="none"><rect width="18" height="18"/><circle r="3"/></g></svg>';
check(Icons::sanitize_content($outline)===$outline,'Safe outline content reaches KSES');
check(isset($svgAllowed['g']['fill'],$svgAllowed['rect']['width'],$svgAllowed['svg']['stroke'],$svgAllowed['circle']['r']),'Outline geometry and presentation have explicit allowances');
check(!isset($svgAllowed['script'],$svgAllowed['svg']['onload'],$svgAllowed['use'],$svgAllowed['path']['style']),'No executable SVG allowances');
foreach(['<svg onload="alert(1)"/>','<svg><script/></svg>','<svg><use href="https://example.com"/></svg>','<svg><path stroke="url(https://example.com)"/></svg>','<svg><path fill="u&#114;l(https://example.com)"/></svg>','<!DOCTYPE svg><svg/>'] as $bad) check(Icons::sanitize_content($bad)==='', 'Reject active or externally referenced SVG');
echo "WordPress icons: enabled collections, native names, legacy fallback and retained lookups passed.\n";
