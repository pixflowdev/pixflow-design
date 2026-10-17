<?php

declare(strict_types=1);

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

if (!class_exists('WP_Error')) {
    final class WP_Error
    {
        public function __construct(
            private readonly string $code,
            private readonly string $message = '',
            private readonly mixed $data = null,
        ) {
        }

        public function get_error_code(): string
        {
            return $this->code;
        }

        public function get_error_message(): string
        {
            return $this->message;
        }

        public function get_error_data(): mixed
        {
            return $this->data;
        }
    }
}

if (!function_exists('wp_check_invalid_utf8')) {
    function wp_check_invalid_utf8(string $value): string
    {
        return $value;
    }
}

function assert_gutenberg_normalizer(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

require_once dirname(__DIR__) . '/src/Admin/Gutenberg/GutenbergBlockTreeNormalizer.php';

use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergBlockTreeNormalizer;

$normalizer = new GutenbergBlockTreeNormalizer();
$exact = "Opening <strong>paragraph</strong>\n<!-- editorial marker -->";
$tree = [[
    'name' => 'core/group',
    'attributes' => ['layout' => ['type' => 'constrained']],
    'innerBlocks' => [[
        'name' => 'core/paragraph',
        'attributes' => ['content' => $exact],
        'innerBlocks' => [],
    ]],
]];

$normalized = $normalizer->normalize($tree);
assert_gutenberg_normalizer(is_array($normalized), 'A valid typed block tree must normalize.');
assert_gutenberg_normalizer(
    ($normalized[0]['innerBlocks'][0]['attributes']['content'] ?? null) === $exact,
    'Block attribute HTML, comments, and line breaks must be preserved exactly.',
);

$deep = ['name' => 'core/paragraph', 'attributes' => ['content' => 'Leaf'], 'innerBlocks' => []];
for ($index = 0; $index < 12; $index++) {
    $deep = ['name' => 'core/group', 'attributes' => [], 'innerBlocks' => [$deep]];
}
$deep_result = $normalizer->normalize([$deep]);
assert_gutenberg_normalizer(is_array($deep_result), 'Valid editor documents deeper than the generic six-level limit must be accepted.');

$wide = [];
for ($index = 0; $index < 160; $index++) {
    $wide[] = ['name' => 'core/paragraph', 'attributes' => ['content' => "Paragraph {$index}"], 'innerBlocks' => []];
}
$wide_result = $normalizer->normalize($wide);
assert_gutenberg_normalizer(is_array($wide_result) && count($wide_result) === 160, 'Documents wider than the generic 128-item limit must use the dedicated bounded normalizer.');

$binding_result = $normalizer->normalize([[
    'name' => 'core/image',
    'attributes' => ['align' => 'wide'],
    'mediaBindings' => [[
        'role' => 'image',
        'attachmentId' => 42,
        'sizeSlug' => 'large',
        'altPolicy' => 'use-library-alt',
    ]],
    'innerBlocks' => [],
]]);
assert_gutenberg_normalizer(($binding_result[0]['mediaBindings'][0]['attachmentId'] ?? null) === 42, 'Typed media bindings must survive normalization.');

$table_result = $normalizer->normalize([[
    'name' => 'core/table',
    'attributes' => [
        'head' => [],
        'body' => [['cells' => [['content' => 'Option'], ['content' => 'Detail']]]],
        'foot' => [],
    ],
    'innerBlocks' => [],
]]);
assert_gutenberg_normalizer(
    is_array($table_result)
        && ($table_result[0]['attributes']['body'][0]['cells'][0]['tag'] ?? null) === 'td'
        && ($table_result[0]['attributes']['body'][0]['cells'][1]['tag'] ?? null) === 'td',
    'Certified core/table cells must receive the registered td default before browser serialization.',
);

$raw_markup = $normalizer->normalize([[
    'name' => 'core/paragraph',
    'attributes' => [],
    'rawMarkup' => '<!-- wp:paragraph --><p>Unsafe transport</p><!-- /wp:paragraph -->',
    'innerBlocks' => [],
]]);
assert_gutenberg_normalizer($raw_markup instanceof WP_Error && $raw_markup->get_error_code() === 'gutenberg_unknown_block_field', 'Proposed trees must reject raw serialized markup fields.');

$invalid_name = $normalizer->normalize([['name' => 'paragraph', 'attributes' => [], 'innerBlocks' => []]]);
assert_gutenberg_normalizer($invalid_name instanceof WP_Error && $invalid_name->get_error_code() === 'gutenberg_invalid_block_name', 'Block names must use an exact namespace/name identifier.');

echo "gutenberg-block-tree-normalizer: ok\n";
