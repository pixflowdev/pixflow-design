<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Media;
if (!defined('ABSPATH')) exit;

/** Local, provider-independent design assets. Never creates attachments or fetches remote URLs. */
final class DesignImages
{
    public static function placeholders(): array
    {
        $sizes = ['1:1'=>[800,800], '4:3'=>[1200,900], '3:2'=>[1200,800], '16:9'=>[1280,720], '3:4'=>[900,1200], '9:16'=>[720,1280]];
        $items = [];
        foreach ($sizes as $ratio => [$width, $height]) {
            $filename = 'placeholder-' . str_replace(':', '-', $ratio) . '.webp';
            $items[] = ['url'=>plugins_url('assets/design-placeholders/'.$filename, dirname(__DIR__, 2).'/pixflow-ai.php'), 'aspectRatio'=>$ratio, 'width'=>$width, 'height'=>$height, 'mimeType'=>'image/webp', 'placeholder'=>true, 'altText'=>'Image placeholder — replace before publishing'];
        }
        return ['items'=>$items, 'instructions'=>'Use the URL in a native image element with the returned dimensions. No attachment ID exists: never invent one or re-import these bundled files. Keep the intended crop and describe the required replacement in the handoff.'];
    }

    public static function inspect(int $id): array|\WP_Error
    {
        if (!current_user_can('upload_files') || !current_user_can('read_post', $id)) return new \WP_Error('media_permission', 'This image is not accessible to the current user.', ['status'=>403]);
        if (get_post_type($id) !== 'attachment') return new \WP_Error('media_missing', 'Select an existing image attachment.', ['status'=>404]);
        $root = realpath(wp_get_upload_dir()['basedir']);
        $file = realpath((string) get_attached_file($id));
        if (!$root || !$file || !is_file($file) || !is_readable($file) || !str_starts_with(wp_normalize_path($file), rtrim(wp_normalize_path($root), '/').'/')) return new \WP_Error('media_unavailable', 'No local image is available for inspection. Use a placeholder if it cannot be visually inspected.', ['status'=>422]);
        $size = wp_getimagesize($file);
        $mime = wp_get_image_mime($file);
        if (!$size || !in_array($mime, ['image/jpeg','image/png','image/webp','image/gif'], true) || $size[0]*$size[1]>32000000 || filesize($file)>8000000) return new \WP_Error('media_inspection_limit', 'This image exceeds the inspection limits or has an unsupported format. Use a smaller library image or a placeholder.', ['status'=>422]);
        $bytes = file_get_contents($file, false, null, 0, 8000001);
        if ($bytes === false || $bytes === '' || strlen($bytes)>8000000) return new \WP_Error('media_unavailable', 'The image could not be read within the inspection limit.', ['status'=>422]);
        return ['attachmentId'=>$id, 'url'=>wp_get_attachment_url($id), 'width'=>$size[0], 'height'=>$size[1], 'mimeType'=>$mime, 'content'=>base64_encode($bytes)];
    }
}
