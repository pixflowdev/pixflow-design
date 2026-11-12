<?php
declare(strict_types=1);
namespace HappyFiles { class User {public static $folder_access='full';static function get_folder_access(){}} class Settings {public static $multiple_folders=true;} }
namespace {
define('ABSPATH',__DIR__);define('HAPPYFILES_FILE',__DIR__.'/happyfiles-pro.php');define('HAPPYFILES_TAXONOMY','happyfiles_category');
class WP_Error {function __construct(public $code,public $message,public $data=[]) {}}
$active=true;$allowed=true;$editable=true;$writes=[];$terms=[];
function current_user_can($cap,$id=0){return $GLOBALS['allowed']&&($cap!=='edit_post'||$GLOBALS['editable']);}
function is_wp_error($x){return $x instanceof WP_Error;}
function taxonomy_exists($x){return $GLOBALS['active'];}
function absint($x){return abs((int)$x);}
function sanitize_text_field($x){return trim(strip_tags($x));}
function term_exists($id,$tax){return in_array($id,[1,2],true);}
function get_ancestors($id,$tax,$type){return $id===2?[1]:[];}
function get_post_type($id){return $id===10?'attachment':'post';}
function get_terms($args){return $GLOBALS['terms']?: (isset($args['parent'])&&$args['parent']===1?[(object)['term_id'=>2]]:[]);}
function get_term($id,$tax){foreach($GLOBALS['terms'] as $term)if($term->term_id===$id)return $term;return null;}
function update_term_meta($id,$key,$value){$GLOBALS['writes'][]=[$id,$key,$value];return true;}
function get_term_meta($id,$key,$single){return 0;}
function wp_set_object_terms(...$args){$GLOBALS['writes'][]=$args;return [];}
function wp_insert_term(...$args){$GLOBALS['writes'][]=$args;return [];}
function wp_update_term(...$args){$GLOBALS['writes'][]=$args;return [];}
function wp_delete_term(...$args){$GLOBALS['writes'][]=$args;return true;}
require __DIR__.'/../src/Media/MediaFolders.php';
use PixflowDesign\WordPress\Media\MediaFolders as F;
function check($ok,$message){if(!$ok)throw new \RuntimeException($message);}
check(!is_wp_error(F::change(['provider'=>'pixflow','action'=>'assign','id'=>1,'attachmentIds'=>[10]])),'native assign');
check($writes[0]===[10,[1],'pixflow_media_folder',false],'native changed wrong source');
$writes=[];$active=false;
check(is_wp_error(F::change(['provider'=>'happyfiles','action'=>'assign','id'=>1,'attachmentIds'=>[10]]))&&$writes===[],'inactive HappyFiles must not write');
check(!is_wp_error(F::read('pixflow')),'native survives deactivation');$active=true;
check(!is_wp_error(F::change(['provider'=>'happyfiles','action'=>'assign','id'=>2,'attachmentIds'=>[10],'append'=>true])),'reactivated assign');
check($writes[0]===[10,[2],'happyfiles_category',true],'HappyFiles assignment semantics');
$writes=[];check(is_wp_error(F::change(['provider'=>'pixflow','action'=>'update','id'=>1,'parent'=>2,'name'=>'Cycle'])),'cycle accepted');
check(is_wp_error(F::change(['provider'=>'pixflow','action'=>'delete','id'=>1])),'subtree deleted');
$editable=false;check(is_wp_error(F::change(['provider'=>'pixflow','action'=>'assign','id'=>1,'attachmentIds'=>[10]])),'attachment permission bypass');$editable=true;
\HappyFiles\User::$folder_access='view';check(is_wp_error(F::change(['provider'=>'happyfiles','action'=>'create','name'=>'No'])),'HappyFiles permission bypass');
check(!is_wp_error(F::read('happyfiles')),'view permission denied');
check(F::filter('pixflow',0)[0]['operator']==='NOT EXISTS','unfiled filter');
check(F::filter('pixflow',2)[0]['include_children']===false,'direct folder scope');
check(is_wp_error(F::filter('pixflow',99)),'missing folder silently lists media');
check(is_wp_error(F::change(['provider'=>'pixflow','action'=>'assign','id'=>1,'attachmentIds'=>['10']])),'invalid IDs accepted');
check($writes===[],'rejected actions wrote data');
check(is_wp_error(F::change(['provider'=>'pixflow','action'=>'create','name'=>str_repeat('a',121)])),'overlong name accepted');
check(!is_wp_error(F::change(['provider'=>'pixflow','action'=>'create','name'=>str_repeat('é',120)])),'valid Unicode name rejected');
$terms=[(object)['term_id'=>1,'parent'=>0,'name'=>'Alpha','count'=>0],(object)['term_id'=>2,'parent'=>0,'name'=>'Beta','count'=>0]];
$writes=[];
check(!is_wp_error(F::change(['provider'=>'pixflow','action'=>'reorder','id'=>2,'beforeId'=>1])),'reorder rejected');
check($writes===[[2,'pixflow_folder_position',0],[1,'pixflow_folder_position',1]],'reorder did not persist correct positions');
$writes=[];
check(is_wp_error(F::change(['provider'=>'pixflow','action'=>'reorder','id'=>2,'beforeId'=>99]))&&$writes===[],'foreign target accepted');
$terms[1]->parent=1;$writes=[];
check(!is_wp_error(F::change(['provider'=>'pixflow','action'=>'reorder','id'=>2,'parent'=>0,'beforeId'=>1])),'child promotion rejected');
check($writes[0]===[2,'pixflow_media_folder',['parent'=>0]],'child promotion did not update parent');
$writes=[];
check(is_wp_error(F::change(['provider'=>'pixflow','action'=>'reorder','id'=>1,'parent'=>2,'beforeId'=>0]))&&$writes===[],'reorder allowed descendant cycle');
echo "Media folder permission, isolation, cycle, assignment and filter checks passed.\n";
}
