<?php

if (!defined('WP_CLI') || !WP_CLI) {
    throw new RuntimeException('Run this fixture through wp eval-file.');
}

$expect = getenv('PIXFLOW_PHASE14_EXPECT') ?: 'present';
$cleanup = getenv('PIXFLOW_PHASE14_CLEANUP') === '1';
$event_field_count = (int) (getenv('PIXFLOW_PHASE14_EVENT_FIELD_COUNT') ?: '6');
$group_keys = ['group_event_details', 'group_event_category_details', 'group_venue_details'];
if ($cleanup) {
    foreach (array_reverse($group_keys) as $group_key) {
        $group = function_exists('acf_get_field_group') ? acf_get_field_group($group_key) : null;
        if (is_array($group)) acf_delete_field_group($group['ID'] ?? $group_key);
    }
    foreach (['venue', 'event_category'] as $taxonomy_key) {
        if (function_exists('acf_get_taxonomy') && acf_get_taxonomy($taxonomy_key)) {
            acf_delete_internal_post_type($taxonomy_key, post_type_name: 'acf-taxonomy');
        }
    }
    if (function_exists('acf_get_post_type') && acf_get_post_type('events')) {
        acf_delete_internal_post_type('events', post_type_name: 'acf-post-type');
    }
}
$post_type = function_exists('acf_get_post_type') ? acf_get_post_type('events') : null;
$taxonomies = [
    'event_category' => function_exists('acf_get_taxonomy') ? acf_get_taxonomy('event_category') : null,
    'venue' => function_exists('acf_get_taxonomy') ? acf_get_taxonomy('venue') : null,
];
$groups = [];
foreach ($group_keys as $group_key) {
    $group = function_exists('acf_get_field_group') ? acf_get_field_group($group_key) : null;
    $fields = function_exists('acf_get_fields') ? acf_get_fields($group_key) : [];
    $groups[$group_key] = [
        'title' => is_array($group) ? ($group['title'] ?? null) : null,
        'location' => is_array($group) ? ($group['location'] ?? null) : null,
        'fields' => array_values(array_map(
            static fn(array $field): array => [
                'key' => $field['key'] ?? null,
                'name' => $field['name'] ?? null,
                'type' => $field['type'] ?? null,
                'taxonomy' => $field['taxonomy'] ?? null,
            ],
            is_array($fields) ? $fields : [],
        )),
    ];
}

if ($expect === 'absent') {
    $clean = !$post_type
        && !$taxonomies['event_category']
        && !$taxonomies['venue']
        && array_reduce($groups, static fn(bool $carry, array $group): bool => $carry && $group['title'] === null, true);
    if (!$clean) throw new RuntimeException('Phase 14 ACF fixtures were not fully removed.');
    WP_CLI::log(wp_json_encode(['fixturesClean' => true]));
    return;
}

$assert = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
};
$assert(is_array($post_type) && ($post_type['post_type'] ?? null) === 'events', 'Events CPT is missing.');
$assert(($post_type['has_archive'] ?? null) === true, 'Events archive is not enabled.');
$assert(($post_type['public'] ?? null) === true, 'Events CPT is not public.');
$assert(($post_type['publicly_queryable'] ?? null) === true, 'Events CPT is not publicly queryable.');
$assert(($post_type['exclude_from_search'] ?? null) === false, 'Events CPT is unexpectedly excluded from search.');
$assert(is_array($taxonomies['event_category']) && in_array('events', $taxonomies['event_category']['object_type'] ?? [], true), 'Event Categories is not attached to Events.');
$assert(is_array($taxonomies['venue']) && in_array('events', $taxonomies['venue']['object_type'] ?? [], true), 'Venues is not attached to Events.');
$expected_fields = [
    'group_event_category_details' => ['short_description', 'colour'],
    'group_venue_details' => ['address', 'postcode', 'website', 'capacity', 'accessibility_notes'],
];
foreach ($expected_fields as $group_key => $names) {
    $actual = array_column($groups[$group_key]['fields'], 'name');
    $assert($actual === $names, "Unexpected fields for {$group_key}: " . wp_json_encode($actual));
}
$event_fields = $groups['group_event_details']['fields'];
$event_names = array_column($event_fields, 'name');
$has_named_slot = static fn(array $candidates): bool => count(array_intersect($candidates, $event_names)) > 0;
$assert(count($event_fields) === $event_field_count, "Event Details must contain {$event_field_count} fields.");
$assert($has_named_slot(['start_date', 'start_datetime', 'event_start_date', 'event_start_datetime']), 'Event Details is missing its start date/time field.');
$assert($has_named_slot(['end_date', 'end_datetime', 'event_end_date', 'event_end_datetime']), 'Event Details is missing its end date/time field.');
$assert($has_named_slot(['ticket_url', 'event_ticket_url']), 'Event Details is missing its ticket URL field.');
$assert($has_named_slot(['summary', 'short_summary', 'event_summary']), 'Event Details is missing its summary field.');
$assert($has_named_slot(['featured', 'event_featured']), 'Event Details is missing its featured field.');
if ($event_field_count === 6) {
    $venue_fields = array_values(array_filter($event_fields, static fn(array $field): bool => in_array($field['name'], ['venue', 'event_venue'], true)));
    $assert(count($venue_fields) === 1 && $venue_fields[0]['type'] === 'taxonomy' && $venue_fields[0]['taxonomy'] === 'venue', 'Event Details must use one Venue taxonomy selector.');
}
foreach ($groups as $group_key => $group) {
    foreach ($group['fields'] as $field) $assert(is_string($field['key']) && str_starts_with($field['key'], 'field_'), "{$group_key} contains an unstable field key.");
}
$assert(($groups['group_event_details']['location'][0][0]['value'] ?? null) === 'events', 'Event Details location is not Events.');
$assert(($groups['group_event_category_details']['location'][0][0]['value'] ?? null) === 'event_category', 'Category Details location is incorrect.');
$assert(($groups['group_venue_details']['location'][0][0]['value'] ?? null) === 'venue', 'Venue Details location is incorrect.');

WP_CLI::log(wp_json_encode([
    'postType' => ['slug' => $post_type['post_type'], 'archive' => $post_type['has_archive']],
    'taxonomies' => [
        ['slug' => $taxonomies['event_category']['taxonomy'] ?? null, 'objects' => $taxonomies['event_category']['object_type'] ?? []],
        ['slug' => $taxonomies['venue']['taxonomy'] ?? null, 'objects' => $taxonomies['venue']['object_type'] ?? []],
    ],
    'groups' => $groups,
]));
