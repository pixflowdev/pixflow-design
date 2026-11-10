<?php
/** Run through wp eval-file on an isolated/authorised test site with Pixflow active. */
use PixflowDesign\WordPress\Admin\WpAdminWordPressCapabilityService;
if (!defined('ABSPATH')) throw new RuntimeException('WordPress is required');
wp_set_current_user((int)get_users(['role'=>'administrator','number'=>1,'fields'=>'ID'])[0]);
$id=wp_insert_post(['post_type'=>'page','post_status'=>'draft','post_title'=>'Pixflow first-edit revision QA','post_content'=>'<p>Original section.</p><p>Owner note to preserve.</p>'],true);
if(is_wp_error($id))throw new RuntimeException($id->get_error_message());
try {
 $service=new WpAdminWordPressCapabilityService();$before=get_post($id);
 $result=$service->update_post(['postId'=>$id,'expectedModifiedGmt'=>$before->post_modified_gmt,'fields'=>['content'=>'<p>Updated section.</p><p>Owner note to preserve.</p>']]);
 if(is_wp_error($result))throw new RuntimeException($result->get_error_code());
 $revision=null;foreach(wp_get_post_revisions($id) as $r)if($r->post_content===$before->post_content)$revision=$r;
 if(!$revision)throw new RuntimeException('First AI edit lost the native pre-edit revision');
 $after=get_post_field('post_content',$id);
 $stale=$service->update_post(['postId'=>$id,'expectedModifiedGmt'=>'2000-01-01 00:00:00','fields'=>['content'=>'Wrong']]);
 if(!is_wp_error($stale)||get_post_field('post_content',$id)!==$after)throw new RuntimeException('Stale edit changed content');
 if(!wp_restore_post_revision($revision->ID)||get_post_field('post_content',$id)!==$before->post_content)throw new RuntimeException('Native undo did not restore the original');
 echo "PASS: first edit retains native undo and stale writes preserve owner content.\n";
} finally { wp_delete_post($id,true); }
