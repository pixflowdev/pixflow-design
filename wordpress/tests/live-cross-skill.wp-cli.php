<?php

if (!defined('WP_CLI') || !WP_CLI) {
    throw new RuntimeException('Run this verifier through WP-CLI.');
}

/** @param mixed $actual */
function pixflow_phase16_assert(bool $condition, string $message, $actual = null): void
{
    if ($condition) return;
    throw new RuntimeException($message . ($actual === null ? '' : ': ' . wp_json_encode($actual)));
}

function pixflow_phase16_post(string $title): WP_Post
{
    $posts = get_posts([
        'post_type' => 'project_spotlight',
        'post_status' => 'draft',
        'title' => $title,
        'numberposts' => 2,
    ]);
    pixflow_phase16_assert(count($posts) === 1, "Expected exactly one draft {$title}", count($posts));
    return $posts[0];
}

function pixflow_phase16_verify_post(WP_Post $post, array $expected): array
{
    foreach ($expected['fields'] as $name => $value) {
        $actual = function_exists('get_field') ? get_field($name, $post->ID) : get_post_meta($post->ID, $name, true);
        pixflow_phase16_assert($actual === $value, "Unexpected {$name} on {$post->post_title}", $actual);
    }
    foreach ($expected['terms'] as $taxonomy => $slugs) {
        $actual = wp_get_object_terms($post->ID, $taxonomy, ['fields' => 'slugs']);
        pixflow_phase16_assert(!is_wp_error($actual), "Could not read {$taxonomy} terms");
        sort($actual);
        sort($slugs);
        pixflow_phase16_assert($actual === $slugs, "Unexpected {$taxonomy} terms on {$post->post_title}", $actual);
    }
    $thumbnail_id = get_post_thumbnail_id($post->ID);
    pixflow_phase16_assert($thumbnail_id > 0 && str_starts_with((string) get_post_mime_type($thumbnail_id), 'image/'), "Missing image featured media on {$post->post_title}", $thumbnail_id);
    return ['id' => $post->ID, 'featuredMediaId' => $thumbnail_id];
}

$post_type = get_post_type_object('project_spotlight');
pixflow_phase16_assert($post_type instanceof WP_Post_Type && (bool) $post_type->has_archive, 'Project Spotlights must be registered with an archive');
pixflow_phase16_assert(taxonomy_exists('project_sector') && is_object_in_taxonomy('project_spotlight', 'project_sector'), 'Project Sectors must be attached');
pixflow_phase16_assert(taxonomy_exists('project_region') && is_object_in_taxonomy('project_spotlight', 'project_region'), 'Project Regions must be attached');

$groups = function_exists('acf_get_field_groups') ? acf_get_field_groups(['post_type' => 'project_spotlight']) : [];
pixflow_phase16_assert(count(array_filter($groups, static fn(array $group): bool => ($group['title'] ?? '') === 'Project Details')) === 1, 'Project Details field group must exist');

foreach ([
    'project_sector' => ['renewable-energy', 'healthcare'],
    'project_region' => ['north-west', 'london'],
] as $taxonomy => $slugs) {
    foreach ($slugs as $slug) pixflow_phase16_assert((bool) get_term_by('slug', $slug, $taxonomy), "Missing {$taxonomy} term {$slug}");
}

$solar = pixflow_phase16_verify_post(pixflow_phase16_post('Solar Hub Modernisation'), [
    'fields' => [
        'client_name' => 'Northstar Energy',
        'project_date' => '2026-03-12',
        'project_url' => 'https://example.com/solar-hub',
        'result_summary' => 'Unified monitoring across 14 solar sites',
        'featured_project' => true,
    ],
    'terms' => ['project_sector' => ['renewable-energy'], 'project_region' => ['north-west']],
]);
$patient = pixflow_phase16_verify_post(pixflow_phase16_post('Digital Patient Intake'), [
    'fields' => [
        'client_name' => 'Harbour Health',
        'project_date' => '2026-04-28',
        'project_url' => 'https://example.com/patient-intake',
        'result_summary' => 'Reduced clinic waiting times by 35%',
        'featured_project' => false,
    ],
    'terms' => ['project_sector' => ['healthcare'], 'project_region' => ['london']],
]);

WP_CLI::log(wp_json_encode([
    'ok' => true,
    'postType' => 'project_spotlight',
    'taxonomies' => ['project_sector', 'project_region'],
    'fieldGroup' => 'Project Details',
    'posts' => ['solar' => $solar, 'patient' => $patient],
]));
