<?php

declare(strict_types=1);

define('ABSPATH', __DIR__);

final class WP_Error
{
    public function __construct(
        public readonly string $code,
        public readonly string $message,
        public readonly array $data = []
    ) {
    }
}

function is_wp_error(mixed $value): bool
{
    return $value instanceof WP_Error;
}

require_once dirname(__DIR__) . '/src/Media/MediaLibraryService.php';

use PixflowDesign\WordPress\Media\MediaLibraryService;

function assert_media(bool $condition, string $message): void
{
    if ($condition) {
        return;
    }
    fwrite(STDERR, $message . "\n");
    exit(1);
}

$service = new MediaLibraryService();
$method = (new ReflectionClass(MediaLibraryService::class))->getMethod('validate_sideload_file');
$method->setAccessible(true);
$temp_dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pixflow-media-validation-' . bin2hex(random_bytes(4));
mkdir($temp_dir, 0700, true);

try {
    $invalid = $temp_dir . DIRECTORY_SEPARATOR . 'chunked.jpg';
    file_put_contents($invalid, "11f3\r\n\x1f\x8bnot-a-jpeg");
    $invalid_result = $method->invoke($service, $invalid, 'team.jpg');
    assert_media($invalid_result instanceof WP_Error, 'Chunked or compressed transport bytes must not become a WordPress image attachment.');
    assert_media($invalid_result->code === 'pixflow_media_invalid_image', 'Invalid raster media must return the image validation error.');

    $valid = $temp_dir . DIRECTORY_SEPARATOR . 'pixel.png';
    file_put_contents($valid, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', true));
    assert_media($method->invoke($service, $valid, 'pixel.png') === true, 'A valid PNG must remain importable.');
} finally {
    @unlink($invalid ?? '');
    @unlink($valid ?? '');
    @rmdir($temp_dir);
}

echo "Pixflow Design media sideload validation tests passed.\n";
