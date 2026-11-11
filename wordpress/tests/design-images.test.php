<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
class WP_Error { public function __construct(public string $code, public string $message, public array $data=[]) {} }
function plugins_url($path, $file) { return 'https://local.test/wp-content/plugins/pixflow-ai/'.$path; }
function current_user_can($cap, ...$args) { return $GLOBALS['permitted']; }
function get_post_type($id) { return $id===1 ? 'attachment' : 'post'; }
function wp_get_upload_dir() { return ['basedir'=>dirname(__DIR__).'/assets/design-placeholders']; }
function get_attached_file($id) { return $GLOBALS['file']; }
function wp_normalize_path($path) { return str_replace('\\','/',$path); }
function wp_getimagesize($file) { return getimagesize($file); }
function wp_get_image_mime($file) { return getimagesize($file)['mime'] ?? ''; }
function wp_get_attachment_url($id) { return 'https://local.test/uploads/image.webp'; }
require __DIR__.'/../src/Media/DesignImages.php';
use PixflowDesign\WordPress\Media\DesignImages;
function check($condition, $message) { if (!$condition) throw new RuntimeException($message); }
$catalog=DesignImages::placeholders();
check(count($catalog['items'])===6, 'Six aspect ratios required');
foreach ($catalog['items'] as $item) {
    $file=dirname(__DIR__).'/assets/design-placeholders/'.basename($item['url']);
    $size=getimagesize($file);
    check($size[0]===$item['width'] && $size[1]===$item['height'] && $size['mime']==='image/webp', 'Asset dimensions/format mismatch');
    check(filesize($file)<15000 && !isset($item['id']) && $item['placeholder'], 'Compact attachment-free placeholder required');
}
$GLOBALS['permitted']=true;
$GLOBALS['file']=dirname(__DIR__).'/assets/design-placeholders/placeholder-1-1.webp';
$result=DesignImages::inspect(1);
check($result['width']===800 && base64_decode($result['content'],true)===file_get_contents($GLOBALS['file']), 'Visual bytes must match selected image');
$GLOBALS['permitted']=false;
check(DesignImages::inspect(1)->code==='media_permission', 'Permission check required');
$GLOBALS['permitted']=true;
check(DesignImages::inspect(2)->code==='media_missing', 'Reject non-attachments');
$GLOBALS['file']=__FILE__;
check(DesignImages::inspect(1)->code==='media_unavailable', 'Reject paths outside uploads');
$GLOBALS['file']=__DIR__.'/missing.webp';
check(DesignImages::inspect(1)->code==='media_unavailable', 'Missing file is unavailable, not inspected');
echo "Design placeholders and bounded media inspection passed.\n";
