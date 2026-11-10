<?php
declare(strict_types=1);
define('ABSPATH',__DIR__);
$options=[];$transients=[];
function get_option($key){return $GLOBALS['options'][$key]??false;}
function update_option($key,$value,$autoload=false){$GLOBALS['options'][$key]=$value;}
function delete_option($key){unset($GLOBALS['options'][$key]);}
function get_current_user_id(){return 1;}
function get_current_blog_id(){return 1;}
function current_user_can($cap,$id){return $id===10;}
function maybe_serialize($value){return serialize($value);}
function maybe_unserialize($value){return unserialize($value);}
function wp_cache_delete(...$args){}
function set_transient($key,$value,$ttl){$GLOBALS['transients'][$key]=$value;}
function get_transient($key){return $GLOBALS['transients'][$key]??false;}
$wpdb=new class {
 public $options='options';
 public function prepare($sql,...$args){return [$sql,$args];}
 public function get_var($query){$key=$query[1][0];return isset($GLOBALS['options'][$key])?serialize($GLOBALS['options'][$key]):null;}
 public function query($query){[$sql,$args]=$query;[$key,$value]=$args;
  if(str_starts_with($sql,'INSERT')){if(isset($GLOBALS['options'][$key]))return 0;$GLOBALS['options'][$key]=unserialize($value);return 1;}
  if(serialize($GLOBALS['options'][$key]??false)!==$value)return 0;unset($GLOBALS['options'][$key]);return 1;
 }
};
require dirname(__DIR__).'/src/Admin/DirectCanvasRelay.php';
function check($ok,$message){if(!$ok)throw new RuntimeException($message);}
$relay=new \PixflowDesign\WordPress\Admin\DirectCanvasRelay('gutenberg');
$id=str_repeat('a',32);$cmd=str_repeat('b',32);$key='pixflow_gutenberg_canvas_'.$id;
function seed($claimed=false,$readOnly=false){global $options,$key,$cmd,$transients;$transients=[];$options=[$key=>['userId'=>1,'blogId'=>1,'postId'=>10,'seenAt'=>time()],$key.'_command'=>['id'=>$cmd,'sessionKey'=>'session','readOnly'=>$readOnly]];if($claimed)$options[$key.'_command_claimed_'.$cmd]=$cmd;}
seed();
$relay->depart($id,10);
$result=$relay->result($cmd,'session');
check($result['executed']===false&&$result['code']==='editor_navigation','Queued work must settle as not executed.');
check(!isset($options[$key.'_command']),'Queued work must not execute after return.');
seed(true);
$relay->depart($id,10);
$result=$relay->result($cmd,'session');
check($result['outcome']==='unknown'&&!$result['ok'],'Dispatched mutations must remain uncertain.');
check(isset($options[$key.'_command']),'Real completion must still be deliverable.');
$relay->complete($id,$cmd,['ok'=>true,'result'=>['saved'=>true]]);
check($relay->result($cmd,'session')['ok'],'Late real completion must replace uncertain result.');
seed(true,true);$relay->depart($id,10);
check($relay->result($cmd,'session')['outcome']==='read_unavailable','Read interruption must not imply an edit.');
foreach(['postId','userId','blogId'] as $field){seed();$options[$key][$field]=20;$before=$options;try{$relay->depart($id,10);throw new LogicException('Missing rejection');}catch(RuntimeException $e){}check($options===$before,'Rejected departure must preserve mailbox');}
echo "direct-canvas-navigation: ok\n";

eval('namespace PixflowDesign\\WordPress\\Modules; class BuilderIntegrations { public static function active($builder) { return true; } }');
$origin=new \PixflowDesign\WordPress\Admin\DirectCanvasRelay('bricks');
$destination=['builder'=>'gutenberg','canvasId'=>str_repeat('c',32),'postId'=>10];
$source=['builder'=>'bricks','canvasId'=>$id,'postId'=>10];
$options=['pixflow_canvas_'.$id=>['userId'=>1,'blogId'=>1,'postId'=>10,'seenAt'=>time()], 'pixflow_gutenberg_canvas_'.$destination['canvasId']=>['userId'=>1,'blogId'=>1,'postId'=>10,'seenAt'=>time()]];
$origin->depart($id,10,$destination);
check($origin->navigation_target($source)===$destination,'Same-page authenticated handoff must expose the destination to the existing run.');
$other=$destination;$other['canvasId']=str_repeat('d',32);
$options['pixflow_gutenberg_canvas_'.$other['canvasId']]=$options['pixflow_gutenberg_canvas_'.$destination['canvasId']];
try {$origin->depart($id,10,$other);throw new LogicException('Duplicate destination accepted');}catch(RuntimeException $e){}
check($origin->navigation_target($source)===$destination,'Duplicate tab must not replace the destination.');
$options['pixflow_canvas_'.$id.'_command']=['id'=>$cmd];
try {$origin->navigation_target($source);throw new LogicException('Unconfirmed mutation accepted');}catch(RuntimeException $e){}
unset($options['pixflow_canvas_'.$id.'_command']);
unset($options['pixflow_canvas_'.$id.'_departed']);
check($origin->navigation_target($source)===$source,'Reopening source must revoke the handoff.');
$options['pixflow_canvas_'.$id.'_departed']=true;
$options['pixflow_gutenberg_canvas_'.$destination['canvasId']]['postId']=20;
try {$origin->navigation_target($source);throw new LogicException('Changed page accepted');}catch(RuntimeException $e){}
$options['pixflow_gutenberg_canvas_'.$destination['canvasId']]['postId']=10;
$options['pixflow_gutenberg_canvas_'.$destination['canvasId']]['userId']=2;
try {$origin->navigation_target($source);throw new LogicException('Other user accepted');}catch(RuntimeException $e){}
echo "direct-canvas-native-handoff: ok\n";
