<?php

if (!defined('WP_CLI') || !WP_CLI) throw new RuntimeException('Run through WP-CLI.');

require_once ABSPATH . 'wp-admin/includes/plugin.php';
$plugin = 'pixflow-yoast-featured-description/pixflow-yoast-featured-description.php';
$was_active = is_plugin_active($plugin);
$tag = get_term_by('slug', 'featured', 'post_tag');
$created_tag = false;
$post_ids = [];

try {
    if (!$was_active) {
        $activated = activate_plugin($plugin);
        if (is_wp_error($activated)) throw new RuntimeException($activated->get_error_message());
    }
    if (!$tag) {
        $created = wp_insert_term('Featured', 'post_tag', ['slug' => 'featured']);
        if (is_wp_error($created)) throw new RuntimeException($created->get_error_message());
        $tag = get_term((int) $created['term_id'], 'post_tag');
        $created_tag = true;
    }
    $tagged_id = wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Pixflow tagged source test', 'post_content' => 'Test']);
    $plain_id = wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Pixflow plain source test', 'post_content' => 'Test']);
    if (is_wp_error($tagged_id) || is_wp_error($plain_id)) throw new RuntimeException('Could not create source-integration fixtures.');
    $post_ids = [(int) $tagged_id, (int) $plain_id];
    wp_set_post_terms((int) $tagged_id, [(int) $tag->term_id], 'post_tag', false);

    $run = static function (int $post_id): string {
        $query = new WP_Query(['p' => $post_id, 'post_type' => 'post', 'post_status' => 'publish']);
        $GLOBALS['wp_query'] = $query;
        $GLOBALS['wp_the_query'] = $query;
        if ($query->have_posts()) $query->the_post();
        $value = (string) apply_filters('wpseo_metadesc', 'Base description', null);
        wp_reset_postdata();
        return $value;
    };
    $tagged = $run((int) $tagged_id);
    $plain = $run((int) $plain_id);
    if ($tagged !== 'Base description — Featured insight') throw new RuntimeException('Tagged post did not receive the expected Yoast description suffix: ' . $tagged);
    if ($plain !== 'Base description') throw new RuntimeException('Untagged post was changed unexpectedly: ' . $plain);
    WP_CLI::log(wp_json_encode(['ok' => true, 'tagged' => $tagged, 'untagged' => $plain]));
} finally {
    foreach ($post_ids as $post_id) wp_delete_post($post_id, true);
    if ($created_tag && $tag instanceof WP_Term) wp_delete_term($tag->term_id, 'post_tag');
    if (!$was_active) deactivate_plugins($plugin, true);
}
