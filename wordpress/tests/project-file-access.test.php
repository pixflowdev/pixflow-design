<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Projects {
    class ProjectRepository { public function find_by_uuid($id) { return ['id'=>1,'uuid'=>$id]; } public function list($args) { return [['id'=>1],['id'=>2]]; } }
    class ProjectVersionRepository { public function find($id) { return ['id'=>$id,'projectId'=>$id===1?1:2]; } public function latest_for_project($id) { return $this->find(1); } }
    class ProjectContextRepository { public function find_by_project($id) { return []; } }
    class ProjectAccessRepository {}
    class ProjectLockRepository {}
    class ProjectPermission { public function can_view($p) { return $GLOBALS['allowed']; } public function can_list() { return true; } }
    class ProjectStorage { public function absolute_upload_path($p) { if(str_contains($p,'..'))throw new \InvalidArgumentException(); return $GLOBALS['fixture']; } }
    class ProjectArchive {}
    class ProjectManifest { public function build($p,$v,$c) { return ['version'=>$v]; } }
}
namespace {
    define('ABSPATH',__DIR__);$allowed=true;
    require __DIR__.'/../src/Projects/ProjectService.php';
    $service=new PixflowDesign\WordPress\Projects\ProjectService();
    $fixture=tempnam(sys_get_temp_dir(),'pixflow-access-');file_put_contents($fixture,'private bytes');
    $checks=0;function check($ok,$message){$GLOBALS['checks']++;if(!$ok)throw new RuntimeException($message);}
    try {
        check(($service->manifest_for('fixture',2)['status']??0)===404,'Reject cross-project version ID');
        check(($service->manifest_for('fixture',1)['ok']??false),'Own version works');
        check(($service->manifest_for('fixture',0)['ok']??false),'Latest version works');
        check(($service->stored_file('fixture','files/image.png')['path']??'')===$fixture,'Owner downloads existing bytes');
        $allowed=false;
        check($service->list()['projects']===[],'Private project metadata is filtered from listings');
        check(($service->stored_file('fixture','files/image.png')['status']??0)===404,'Unrelated user cannot download');
        check(($service->manifest_for('fixture',1)['status']??0)===403,'Unrelated user cannot read manifest');
        $allowed=true;
        check(($service->stored_file('fixture','../other')['status']??0)===404,'Traversal cannot download');
        echo "project-file-access: $checks checks passed\n";
    } finally {unlink($fixture);}
}
