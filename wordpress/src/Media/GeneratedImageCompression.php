<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) exit;

/** Encode generated still images before attachment creation; never change existing media. */
final class GeneratedImageCompression
{
    public static function prepare(string $path, string $filename): array|\WP_Error
    {
        $info = @getimagesize($path);
        $mime = is_array($info) ? (string) ($info['mime'] ?? '') : '';
        $original = ['path'=>$path, 'filename'=>$filename, 'mime'=>$mime];
        if (!in_array($mime, ['image/png', 'image/jpeg', 'image/webp', 'image/avif'], true)) return $original;
        // A still-image editor must not flatten animated WebP/APNG assets.
        $header = (string) file_get_contents($path, false, null, 0, 32);
        if ($mime === 'image/webp' && substr($header, 12, 4) === 'VP8X' && (ord($header[20] ?? "\0") & 2)) return $original;
        if ($mime === 'image/png') {
            $stream = fopen($path, 'rb');
            if ($stream) {
                fseek($stream, 8);
                while (strlen($chunk = (string) fread($stream, 8)) === 8) {
                    $type = substr($chunk, 4, 4);
                    if ($type === 'acTL') { fclose($stream); return $original; }
                    if ($type === 'IDAT' || $type === 'IEND') break;
                    $length = unpack('N', substr($chunk, 0, 4))[1];
                    if ($length > filesize($path) || fseek($stream, $length + 4, SEEK_CUR) !== 0) break;
                }
                fclose($stream);
            }
        }
        $editor = wp_get_image_editor($path);
        if (is_wp_error($editor)) return self::error();
        if (is_wp_error($editor->set_quality(80))) return self::error();
        $temp = wp_tempnam('pixflow-generated');
        if (!$temp) return self::error();
        $output = $temp . '.webp';
        @unlink($temp);
        $saved = $editor->save($output, 'image/webp');
        if (is_wp_error($saved) || ($saved['mime-type'] ?? '') !== 'image/webp' || !is_file($output) || filesize($output) === 0) {
            @unlink($output);
            return self::error();
        }
        if (filesize($output) >= filesize($path)) {
            @unlink($output);
            return $original;
        }
        return ['path'=>$output, 'filename'=>sanitize_file_name(pathinfo($filename, PATHINFO_FILENAME)) . '.webp', 'mime'=>'image/webp'];
    }

    private static function error(): \WP_Error
    {
        return new \WP_Error('pixflow_media_compression_failed', 'The generated image could not be compressed at 80% quality. Check that the server image editor supports WebP, then retry saving the existing image.', ['status'=>422]);
    }
}
