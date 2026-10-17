<?php
declare(strict_types=1);
namespace {
    define('ABSPATH', __DIR__ . '/');
    final class WP_Error { public function __construct(public string $code, public string $message, public array $data=[]) {} public function get_error_code(): string { return $this->code; } }
    $GLOBALS['canEdit'] = true;
    $GLOBALS['calls'] = [];
    function current_user_can(string $cap, ...$args): bool { return $GLOBALS['canEdit']; }
    function get_post_type(int $id): string { return $id === 99 ? 'php_snippet' : 'post'; }
    function wp_kses_post(string $text): string { return strip_tags($text, '<p><strong><em><a>'); }
    function sanitize_text_field(string $text): string { return strip_tags($text); }
}
namespace PixflowDesign\WordPress\Admin {
    final class WpAdminWordPressCapabilityService {
        public function list_posts(array $args): array { return ['posts'=>$args]; }
        public function get_post(int $id): array { return ['id'=>$id,'modifiedGmt'=>'2026-10-16 12:00:00']; }
        public function create_post(array $args): array { $GLOBALS['calls'][]=$args; return ['created'=>true,'post'=>$args]; }
        public function update_post(array $args): array { $GLOBALS['calls'][]=$args; return ['updated'=>true,'post'=>$args]; }
        public function trash_post(array $args): array { $GLOBALS['calls'][]=$args; return ['result'=>'trashed']; }
        public function restore_post(array $args): array { $GLOBALS['calls'][]=$args; return ['result'=>'restored']; }
        public function list_terms(array $args): array { return ['terms'=>[],'taxonomy'=>$args['taxonomy']]; }
        public function create_term(array $args): array { $GLOBALS['calls'][]=$args; return ['created'=>true]; }
        public function update_term(array $args): array { $GLOBALS['calls'][]=$args; return ['updated'=>true]; }
    }
    final class WpAdminSettingsCapabilityService {
        public function read(): array { return ['settings'=>['blogname'=>'Original'],'fingerprint'=>'fresh']; }
        public function update(array $args): array|\WP_Error {
            if (($args['expectedFingerprint']??'')!=='fresh') return new \WP_Error('stale_settings','Stale');
            if(array_diff(array_keys($args['settings']??[]),['blogname']))return new \WP_Error('setting_not_allowlisted','Unsupported');
            $GLOBALS['calls'][]=$args;return ['updated'=>array_keys($args['settings'])];
        }
    }
}
namespace {
    require __DIR__ . '/../src/Admin/WordPressAdminOperations.php';
    use PixflowDesign\WordPress\Admin\WordPressAdminOperations;
    $service=new WordPressAdminOperations();$checks=0;
    function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);$GLOBALS['checks']++;}
    function error_is(mixed $result,string $code):bool{return $result instanceof WP_Error&&$result->code===$code;}
    check(!function_exists('wp_get_ability'), 'Fixture must have no Abilities API');
    check($service->call('wordpress.posts.get',['postId'=>12],false)['id']===12,'Native reads work without WordPress Abilities API');
    check($service->call('wordpress.posts.list',[],false)['posts']['postType']==='post','Standard posts remain discoverable');
    check($service->call('wordpress.posts.list',['postType'=>'page'],false)['posts']['postType']==='page','Pages remain discoverable');
    check(error_is($service->call('wordpress.posts.create',['title'=>'Draft'],false),'read_only_session'),'Read-only session cannot create content');
    check($GLOBALS['calls']===[],'Rejected request must not reach a write handler');
    foreach ([['postType'=>'php_snippet'],['postType'=>'wpcode'],['postType'=>'custom_css']] as $args) check(error_is($service->call('wordpress.posts.create',$args+['title'=>'Unsafe'],true),'post_type_not_allowed'),'Executable/custom types require dedicated integrations');
    check(error_is($service->call('wordpress.posts.update',['postId'=>99,'fields'=>['title'=>'Unsafe'],'expectedModifiedGmt'=>'now'],true),'post_type_not_allowed'),'Indirect writes to code snippet CPT rejected');
    foreach (['<?php evil();','<script>alert(1)</script>','<img src=x onerror="evil()">','<a href="javascript:evil()">x</a>'] as $content) check(error_is($service->call('wordpress.posts.create',['title'=>'Unsafe','content'=>$content],true),'executable_content_not_allowed'),'Executable content rejected');
    check(error_is($service->call('wordpress.posts.create',['title'=>'Draft','meta_input'=>['danger'=>'php']],true),'argument_not_allowlisted'),'Generic metadata payload rejected');
    check(error_is($service->call('wordpress.posts.update',['postId'=>12,'expectedModifiedGmt'=>'now','fields'=>['post_author'=>1]],true),'field_not_allowlisted'),'Generic post mutation fields rejected');
    check(error_is($service->call('wordpress.posts.update',['postId'=>12],true),'invalid_arguments'),'Missing update fields rejected');
    check(error_is($service->call('wordpress.posts.get',['postId'=>['bad']],false),'invalid_arguments'),'Malformed object ID rejected');
    check(error_is($service->call('wordpress.posts.create',['terms'=>['category'=>['1']]],true),'invalid_arguments'),'Term IDs must be actual integers');
    $created=$service->call('wordpress.posts.create',['title'=>'Draft','content'=>'<p>Safe</p>','terms'=>['category'=>[2]]],true);
    check($created['created']&&$created['post']['content']==='<p>Safe</p>','Safe native content reaches the validated handler');
    $updated=$service->call('wordpress.posts.update',['postId'=>12,'expectedModifiedGmt'=>'fresh','fields'=>['title'=>'<b>Plain title</b>']],true);
    check($updated['post']['fields']['title']==='Plain title','Titles cannot become a script editing surface');
    check($service->call('wordpress.terms.list',['taxonomy'=>'category'],false)['taxonomy']==='category','Category discovery remains Free');
    check(error_is($service->call('wordpress.settings.update',['expectedFingerprint'=>'old','settings'=>['blogname'=>'New']],true),'stale_settings'),'Settings handler keeps its stale fingerprint protection');
    check(error_is($service->call('wordpress.settings.update',['expectedFingerprint'=>'fresh','settings'=>['active_plugins'=>[]]],true),'setting_not_allowlisted'),'No generic option write through settings tool');
    check($service->call('wordpress.settings.update',['expectedFingerprint'=>'fresh','settings'=>['blogname'=>'New']],true)['updated']===['blogname'],'Basic site title update remains reachable');
    $GLOBALS['canEdit']=false;
    check(error_is($service->call('wordpress.posts.get',['postId'=>12],true),'target_permission_denied'),'Current account permission is rechecked per call');
    foreach(array_keys(WordPressAdminOperations::catalogue())as$tool)check(!preg_match('/(?:wordpress\.run|files\.|database\.)/',$tool),'Free catalogue has no raw code/file/SQL tool');
    echo 'Native WordPress operation checks passed: '.$checks."\n";
}
