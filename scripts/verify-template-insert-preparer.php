<?php

declare(strict_types=1);

define('ABSPATH', __DIR__);

if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($value): string
    {
        return trim((string) $value);
    }
}

if (!function_exists('sanitize_key')) {
    function sanitize_key($value): string
    {
        return strtolower(preg_replace('/[^a-z0-9_\-]/', '', (string) $value) ?: '');
    }
}

if (!function_exists('sanitize_html_class')) {
    function sanitize_html_class($value): string
    {
        return preg_replace('/[^A-Za-z0-9_-]/', '', (string) $value) ?: '';
    }
}

if (!function_exists('wp_json_encode')) {
    function wp_json_encode($value): string|false
    {
        return json_encode($value);
    }
}

if (!function_exists('wp_rand')) {
    function wp_rand(int $min, int $max): int
    {
        return random_int($min, $max);
    }
}

if (!function_exists('get_option')) {
    function get_option(string $name, $default = false)
    {
        return $default;
    }
}

require_once __DIR__ . '/../wordpress/src/Templates/TemplatePayloadPreparer.php';
require_once __DIR__ . '/../wordpress/src/Templates/TemplateInsertService.php';

use PixflowDesign\WordPress\Templates\TemplateInsertService;
use PixflowDesign\WordPress\Templates\TemplatePayloadPreparer;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "[fail] {$message}\n");
        exit(1);
    }
}

$preparer = new TemplatePayloadPreparer();
$prepared = $preparer->prepare(
    [
        [
            'id' => 'abc123',
            'name' => 'section',
            'parent' => '',
            'children' => [],
            'settings' => [
                '_cssGlobalClasses' => ['class-root', 'class-card'],
                '_cssClasses' => 'hero-36 hero-36-card unrelated-hero-36-card',
                '_cssCustom' => '.hero-36-card:hover { color: red; } .x-hero-36-card { color: blue; }',
            ],
        ],
    ],
    [
        ['id' => 'class-root', 'name' => 'hero-36', 'settings' => ['_cssCustom' => '%root% { display: grid; }']],
        ['id' => 'class-card', 'name' => 'hero-36-card', 'settings' => ['_cssCustom' => '%root% { padding: 20px; }']],
    ],
    'wyre-hero',
    'hero-36'
);

$element_classes = (string) ($prepared['content'][0]['settings']['_cssClasses'] ?? '');
$class_names = array_values(array_filter(preg_split('/\s+/', $element_classes) ?: []));
$global_names = array_map(static fn(array $class): string => (string) ($class['name'] ?? ''), $prepared['globalClasses']);
$custom_css = (string) ($prepared['content'][0]['settings']['_cssCustom'] ?? '');

assert_true(in_array('wyre-hero-card', $class_names, true), 'Single-hyphen descendant class should be renamed in element classes.');
assert_true(!in_array('hero-36-card', $class_names, true), 'Old descendant class token should not remain in element classes.');
assert_true(in_array('unrelated-hero-36-card', $class_names, true), 'Longer unrelated class names should not be renamed.');
assert_true(in_array('wyre-hero-card', $global_names, true), 'Single-hyphen descendant global class should be renamed.');
assert_true(str_contains($custom_css, '.wyre-hero-card:hover'), 'Single-hyphen descendant custom CSS selector should be renamed.');
assert_true(str_contains($custom_css, '.x-hero-36-card'), 'Longer unrelated custom CSS selector should not be renamed.');

$service = (new ReflectionClass(TemplateInsertService::class))->newInstanceWithoutConstructor();
$method = new ReflectionMethod(TemplateInsertService::class, 'place_content');
$method->setAccessible(true);
$merged = $method->invoke(
    $service,
    [
        ['id' => 'section-a', 'name' => 'section', 'parent' => '', 'children' => ['container-a'], 'settings' => []],
        ['id' => 'container-a', 'name' => 'container', 'parent' => 'section-a', 'children' => ['text-a'], 'settings' => []],
        ['id' => 'text-a', 'name' => 'text', 'parent' => 'container-a', 'children' => [], 'settings' => []],
        ['id' => 'section-b', 'name' => 'section', 'parent' => '', 'children' => [], 'settings' => []],
    ],
    [
        ['id' => 'section-new', 'name' => 'section', 'parent' => '', 'children' => [], 'settings' => []],
    ],
    ['mode' => 'after', 'targetId' => 'section-a']
);

$ids = array_map(static fn(array $element): string => (string) $element['id'], $merged);
assert_true(
    $ids === ['section-a', 'container-a', 'text-a', 'section-new', 'section-b'],
    'Insert-after should place incoming content after the full target subtree.'
);

fwrite(STDOUT, "[ok] Template rename and insertion order checks passed.\n");
