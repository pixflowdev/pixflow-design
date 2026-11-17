<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} }
function is_wp_error($value) { return $value instanceof WP_Error; }
function sanitize_file_name($value) { return basename($value); }
function wp_tempnam($name) { return tempnam(sys_get_temp_dir(), 'px-image-'); }
$quality = null; $fail = false; $encoded = 'encoded-webp';
function wp_get_image_editor($path) {
    return new class {
        function set_quality($value) { $GLOBALS['quality'] = $value; return true; }
        function save($path, $mime) {
            if ($GLOBALS['fail']) return new WP_Error('encoder', 'Encoder failed');
            file_put_contents($path, $GLOBALS['encoded']);
            return ['path'=>$path, 'mime-type'=>$mime];
        }
    };
}
require __DIR__ . '/../src/Media/GeneratedImageCompression.php';
use PixflowDesign\WordPress\Media\GeneratedImageCompression;
$path = tempnam(sys_get_temp_dir(), 'px-source-');
try {
    file_put_contents($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
    $result = GeneratedImageCompression::prepare($path, 'desk.png');
    if (is_wp_error($result) || $quality !== 80 || $result['filename'] !== 'desk.webp' || $result['mime'] !== 'image/webp') throw new RuntimeException('Generated images must encode at quality 80 before import');
    if (!is_file($path)) throw new RuntimeException('Must preserve the input until the caller finishes');
    unlink($result['path']);
    $encoded = str_repeat('x', 1000);
    $larger = GeneratedImageCompression::prepare($path, 'desk.png');
    if ($larger['path'] !== $path || $larger['mime'] !== 'image/png') throw new RuntimeException('Compression must not enlarge an already smaller image');
    $fail = true;
    if (!is_wp_error(GeneratedImageCompression::prepare($path, 'desk.png'))) throw new RuntimeException('Encoder failure must not silently import uncompressed bytes');
    file_put_contents($path, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    $quality = null;
    $svg = GeneratedImageCompression::prepare($path, 'icon.svg');
    if ($svg['path'] !== $path || $quality !== null) throw new RuntimeException('Vector media must not be rasterized');
    file_put_contents($path, 'audio content');
    if (GeneratedImageCompression::prepare($path, 'audio.mp3')['path'] !== $path) throw new RuntimeException('Audio must bypass raster compression');
} finally { unlink($path); }
echo "Generated image compression passed.\n";
