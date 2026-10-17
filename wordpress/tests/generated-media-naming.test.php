<?php

declare(strict_types=1);

define('ABSPATH', __DIR__);

if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field(string $value): string
    {
        return trim(strip_tags($value));
    }
}

if (!function_exists('sanitize_key')) {
    function sanitize_key(string $value): string
    {
        return strtolower((string) preg_replace('/[^a-z0-9_-]+/i', '', $value));
    }
}

if (!function_exists('sanitize_title')) {
    function sanitize_title(string $value): string
    {
        $value = strtolower(trim($value));
        $value = (string) preg_replace('/[^a-z0-9]+/i', '-', $value);
        return trim($value, '-');
    }
}

if (!function_exists('wp_trim_words')) {
    function wp_trim_words(string $value, int $count, string $more = '...'): string
    {
        $words = preg_split('/\s+/', trim($value), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if (count($words) <= $count) return implode(' ', $words);
        return implode(' ', array_slice($words, 0, $count)) . $more;
    }
}

require_once dirname(__DIR__) . '/src/Media/GeneratedMediaNaming.php';
require_once dirname(__DIR__) . '/src/Media/MediaLibraryService.php';

function sanitize_textarea_field(string $value): string { return trim(strip_tags($value)); }
function sanitize_file_name(string $value): string { return preg_replace('/[^a-zA-Z0-9._-]/', '-', basename($value)); }

use PixflowDesign\WordPress\Media\GeneratedMediaNaming;

function assert_naming(bool $condition, string $message): void
{
    if ($condition) return;
    fwrite(STDERR, $message . "\n");
    exit(1);
}

$product_prompt = 'Make a moody product photo of a cobalt blue desk lamp on a pale stone table, soft morning light, no text.';
$product_title = GeneratedMediaNaming::title($product_prompt, 'image');
$product_stem = GeneratedMediaNaming::filename_stem($product_title, $product_prompt, 'image');
assert_naming(str_starts_with($product_title, 'moody product photo'), 'Imperative wording should be removed from the attachment title.');
assert_naming(!str_contains($product_stem, 'make-a'), 'Generated filenames must not retain the make-a prompt prefix.');
assert_naming(str_contains($product_stem, 'cobalt-blue-desk-lamp'), 'Generated filenames should name the image subject.');
assert_naming(!str_contains($product_stem, 'no-text'), 'Negative prompt constraints should not make noisy filenames.');

$dashboard_prompt = 'Create a clean studio image of a glassmorphism analytics dashboard in a warm neutral palette, no text.';
$dashboard_stem = GeneratedMediaNaming::filename_stem(
    GeneratedMediaNaming::title($dashboard_prompt, 'image'),
    $dashboard_prompt,
    'image',
);
assert_naming(!str_starts_with($dashboard_stem, 'create-a'), 'Generated filenames must not retain the create-a prompt prefix.');
assert_naming(str_contains($dashboard_stem, 'glassmorphism-analytics-dashboard'), 'Generated filenames should preserve the meaningful subject.');

$fallback = GeneratedMediaNaming::title('', 'image');
assert_naming($fallback === 'Pixflow generated image', 'Empty briefs should retain the media fallback title.');

$prepare = new ReflectionMethod(\PixflowDesign\WordPress\Media\MediaLibraryService::class, 'prepare_generated_metadata');
$service = new \PixflowDesign\WordPress\Media\MediaLibraryService();
$explicit = $prepare->invoke($service, [
    'source' => 'generated', 'filename' => 'clay-house-cups-original.png',
    'title' => 'Handmade ceramic cups', 'prompt' => 'Use case: photorealistic-natural. Create ceramic cups.',
], 'clay-house-cups-original.png', 'image/png');
assert_naming($explicit['filename'] === 'clay-house-cups-original.png', 'An explicit generated-media filename must survive import instead of becoming prompt boilerplate.');
$automatic = $prepare->invoke($service, ['source' => 'generated', 'prompt' => $product_prompt], 'unnamed-file', 'image/png');
assert_naming(str_contains($automatic['filename'], 'cobalt-blue-desk-lamp'), 'Imports without an explicit filename still derive a descriptive name.');

echo "Pixflow Design generated media naming tests passed.\n";
