<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
class WP_Error { public function __construct(public string $code, public string $message, public array $data=[]) {} }
function plugins_url($path, $file) { return 'https://local.test/wp-content/plugins/pixflow-ai/'.$path; }
function current_user_can($cap, ...$args) { return $GLOBALS['permitted']; }
function get_post_type($id) { return $id===1 ? 'attachment' : 'post'; }
function wp_get_upload_dir() { return ['basedir'=>$GLOBALS['uploadRoot'] ?? dirname(__DIR__).'/assets/design-placeholders']; }
function wp_get_attachment_metadata($id) { return $GLOBALS['metadata'] ?? []; }
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
$temp=sys_get_temp_dir().'/pixflow-inspect-'.bin2hex(random_bytes(8));
mkdir($temp);
try {
    $GLOBALS['uploadRoot']=$temp;
    $GLOBALS['file']=$temp.'/original.webp';
    $source=dirname(__DIR__).'/assets/design-placeholders/placeholder-1-1.webp';
    file_put_contents($GLOBALS['file'],file_get_contents($source).str_repeat('x',8000001));
    copy($source,$temp.'/preview.webp');
    $GLOBALS['metadata']=['sizes'=>['large'=>['file'=>'preview.webp']]];
    $preview=DesignImages::inspect(1);
    check(is_array($preview) && $preview['preview']===true && $preview['attachmentId']===1, 'Oversized original must use its safe local preview');
    check(base64_decode($preview['content'],true)===file_get_contents($source), 'Preview bytes must match the derivative');
    $GLOBALS['metadata']=['sizes'=>['large'=>['file'=>'../preview.webp']]];
    check(DesignImages::inspect(1)->code==='media_inspection_limit', 'Reject traversal in derivative metadata');
    copy(dirname(__DIR__).'/assets/design-placeholders/placeholder-16-9.webp',$temp.'/crop.webp');
    $GLOBALS['metadata']=['sizes'=>['large'=>['file'=>'crop.webp']]];
    check(DesignImages::inspect(1)->code==='media_inspection_limit', 'A different crop must not stand in for the whole image');
    $GLOBALS['metadata']=[];
    check(DesignImages::inspect(1)->code==='media_inspection_limit', 'Keep byte limit without a safe preview');
} finally { unlink($temp.'/original.webp'); unlink($temp.'/preview.webp'); if (is_file($temp.'/crop.webp')) unlink($temp.'/crop.webp'); rmdir($temp); }
echo "Design placeholders and bounded media inspection passed.\n";
