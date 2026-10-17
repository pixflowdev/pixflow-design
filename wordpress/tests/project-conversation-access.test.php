<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Projects {
    class ProjectRepository {public function find_by_uuid($id){return ['id'=>1];}public function find_access_by_uuid($id){return ['id'=>1];}}
    class ProjectPermission {public function can_view($p){return $GLOBALS['view'];}public function can_edit($p){return $GLOBALS['edit'];}}
}
namespace {
define('ABSPATH',__DIR__);
function current_user_can($cap){return $cap==='edit_posts';}
function sanitize_text_field($text){return trim(strip_tags($text));}
class WP_REST_Request {public function __construct(private $method,private $path){}public function get_method(){return $this->method;}public function get_param($name){return $this->path;}}
require __DIR__.'/../src/Http/RestController.php';
$type=new ReflectionClass(PixflowDesign\WordPress\Http\RestController::class);$controller=$type->newInstanceWithoutConstructor();
$type->getProperty('project_repository')->setValue($controller,new PixflowDesign\WordPress\Projects\ProjectRepository());
$type->getProperty('project_permissions')->setValue($controller,new PixflowDesign\WordPress\Projects\ProjectPermission());
$view=false;$edit=false;$checks=0;
function check($ok,$m){$GLOBALS['checks']++;if(!$ok)throw new RuntimeException($m);}
foreach(['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','AAAAAAAA-AAAA-4AAA-AAAA-AAAAAAAAAAAA',' aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa '] as $uuid){
 foreach(['conversations','conversations/test/messages','files','context'] as $suffix){
  $path='projects/'.$uuid.'/'.$suffix;$view=false;$edit=false;
  check(!$controller->can_use_workspace_request(new WP_REST_Request('GET',$path)),'Private subroute read denied');
  check(!$controller->can_use_workspace_request(new WP_REST_Request('POST',$path)),'Private subroute write denied');
  $view=true;check($controller->can_use_workspace_request(new WP_REST_Request('GET',$path)),'Shared reader can read');
  check(!$controller->can_use_workspace_request(new WP_REST_Request('POST',$path)),'Shared reader cannot write');
  $edit=true;check($controller->can_use_workspace_request(new WP_REST_Request('POST',$path)),'Shared editor can write');
 }
}
echo "project-conversation-access: $checks checks passed\n";
}
