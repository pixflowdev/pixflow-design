<?php

use PixflowDesign\WordPress\Bricks\ContentMutationService;

if (!defined('ABSPATH')) {
    throw new RuntimeException('Run this fixture through WP-CLI eval-file.');
}

$post_id = 197;
$meta_key = '_bricks_page_content_2';
$before = get_post_meta($post_id, $meta_key, true);
if (!is_array($before)) {
    throw new RuntimeException('The live Code fixture does not contain Bricks content.');
}

$target = null;
foreach ($before as $element) {
    if (is_array($element) && ($element['id'] ?? '') === 'p21cd1' && ($element['name'] ?? '') === 'code') {
        $target = $element;
        break;
    }
}
if (!is_array($target)) {
    throw new RuntimeException('The live Code fixture p21cd1 is missing.');
}

$source = "document.addEventListener('DOMContentLoaded', function () { document.documentElement.classList.add('ready'); });";

try {
    $result = (new ContentMutationService())->patch_elements($post_id, 'content', [[
        'id' => 'p21cd1',
        'settings' => [
            'javascriptCode' => $source,
            'executeCode' => true,
        ],
    ]], true, true, 'code_update');

    if (($result['ok'] ?? false) !== true) {
        throw new RuntimeException('The live authorized Code transaction returned a failure: ' . wp_json_encode($result));
    }
    $stored = get_post_meta($post_id, $meta_key, true);
    $stored_target = null;
    foreach (is_array($stored) ? $stored : [] as $element) {
        if (is_array($element) && ($element['id'] ?? '') === 'p21cd1') {
            $stored_target = $element;
            break;
        }
    }
    if (($stored_target['settings']['javascriptCode'] ?? '') !== $source
        || ($stored_target['settings']['executeCode'] ?? false) !== true
        || ($result['persistence']['engine'] ?? '') !== 'pixflow_authorized_bricks_code') {
        throw new RuntimeException('The live authorized Code transaction did not persist the exact approved state: ' . wp_json_encode($result));
    }

    WP_CLI::log(wp_json_encode([
        'ok' => true,
        'postId' => $post_id,
        'elementId' => 'p21cd1',
        'engine' => $result['persistence']['engine'] ?? '',
        'contentHash' => $result['persistence']['contentHash'] ?? '',
    ], JSON_UNESCAPED_SLASHES));
} finally {
    update_post_meta($post_id, $meta_key, wp_slash($before));
    clean_post_cache($post_id);
}
