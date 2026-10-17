<?php

use PixflowDesign\WordPress\Admin\WpAdminJetEngineCapabilityService;
use PixflowDesign\WordPress\Admin\WpAdminJetEngineCctCapabilityService;

if (!defined('WP_CLI') || !WP_CLI) {
    throw new RuntimeException('Run this verification harness through wp eval-file.');
}

$assert = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
};
$unwrap = static function (array|WP_Error $value, string $label): array {
    if ($value instanceof WP_Error) {
        throw new RuntimeException($label . ': ' . $value->get_error_message());
    }
    return $value;
};
$find = static function (array $models, string $slug): ?array {
    foreach ($models as $model) {
        if (is_array($model) && ($model['slug'] ?? null) === $slug) return $model;
    }
    return null;
};

$service = new WpAdminJetEngineCapabilityService();
$modules = $unwrap($service->list_modules(), 'JetEngine modules');
$models = [];
foreach (['post_type', 'taxonomy', 'meta_box', 'options_page'] as $type) {
    $response = $unwrap($service->list_models(['modelType' => $type, 'perPage' => 100]), "JetEngine {$type} models");
    $models[$type] = is_array($response['models'] ?? null) ? $response['models'] : [];
}

$expect = getenv('PIXFLOW_JETENGINE_EXPECT') ?: 'snapshot';
if ($expect === 'workshops') {
    $post_type = $find($models['post_type'], 'workshops');
    $topics = $find($models['taxonomy'], 'workshop_topics');
    $locations = $find($models['taxonomy'], 'locations');
    $details = $find($models['meta_box'], 'workshop-details');
    if (!$details) {
        foreach ($models['meta_box'] as $candidate) {
            if (is_array($candidate) && ($candidate['name'] ?? null) === 'Workshop Details') {
                $details = $candidate;
                break;
            }
        }
    }
    $assert(is_array($post_type), 'Workshops post type is missing.');
    $assert(post_type_exists('workshops'), 'Workshops is not registered with WordPress.');
    $registered_post_type = get_post_type_object('workshops');
    $assert(is_object($registered_post_type) && $registered_post_type->has_archive === true, 'Workshops archive is not enabled.');
    $assert(is_object($registered_post_type) && $registered_post_type->public === true, 'Workshops post type is not public.');
    $assert(is_array($topics), 'Workshop Topics is missing.');
    $assert(is_array($locations), 'Locations taxonomy is missing.');
    $assert(taxonomy_exists('workshop_topics') && taxonomy_exists('locations'), 'Workshop taxonomies are not registered with WordPress.');
    $registered_topics = get_taxonomy('workshop_topics');
    $assert(is_object($registered_topics) && $registered_topics->hierarchical === true, 'Workshop Topics is not hierarchical.');
    $assert(in_array('workshops', $topics['objectTypes'] ?? [], true), 'Workshop Topics is not attached to Workshops.');
    $assert(in_array('workshops', $locations['objectTypes'] ?? [], true), 'Locations is not attached to Workshops.');
    $topic_fields = array_column(is_array($topics['fields'] ?? null) ? $topics['fields'] : [], 'name');
    $location_fields = array_column(is_array($locations['fields'] ?? null) ? $locations['fields'] : [], 'name');
    $detail_fields = array_column(is_array($details['fields'] ?? null) ? $details['fields'] : [], 'name');
    $assert($topic_fields === ['icon_colour', 'introduction'], 'Unexpected Workshop Topics fields: ' . wp_json_encode($topic_fields));
    $assert($location_fields === ['venue_name', 'address', 'postcode', 'map_link', 'accessibility_notes'], 'Unexpected Locations fields: ' . wp_json_encode($location_fields));
    foreach (['start_datetime', 'end_datetime', 'booking_link', 'capacity', 'is_online'] as $field) {
        $assert(in_array($field, $detail_fields, true), "Workshop Details is missing {$field}.");
    }
}

$cct = null;
$records = [];
if (class_exists(WpAdminJetEngineCctCapabilityService::class) && in_array('custom-content-types', $modules['activeModules'] ?? [], true)) {
    $cct_service = new WpAdminJetEngineCctCapabilityService();
    $ccts = $unwrap($cct_service->list_ccts(['perPage' => 100]), 'JetEngine CCTs');
    foreach (($ccts['ccts'] ?? []) as $candidate) {
        if (is_array($candidate) && ($candidate['slug'] ?? null) === 'office_directory') {
            $cct = $candidate;
            break;
        }
    }
    if ($cct) {
        $record_response = $unwrap($cct_service->list_records(['slug' => 'office_directory', 'perPage' => 100]), 'Office Directory records');
        $records = is_array($record_response['records'] ?? null) ? $record_response['records'] : [];
    }
}

if (getenv('PIXFLOW_JETENGINE_CLEANUP') === '1') {
    $removed = [];
    if ($cct) {
        foreach ($records as $record) {
            $result = $cct_service->delete_record([
                'slug' => 'office_directory',
                'recordId' => (int) ($record['id'] ?? 0),
                'expectedFingerprint' => (string) ($record['fingerprint'] ?? ''),
            ]);
            $unwrap($result, 'Delete Office Directory record');
            $removed[] = 'office_directory#' . (int) ($record['id'] ?? 0);
        }
        $result = $cct_service->delete_cct([
            'id' => (int) ($cct['id'] ?? 0),
            'expectedFingerprint' => (string) ($cct['fingerprint'] ?? ''),
        ]);
        $unwrap($result, 'Delete Office Directory CCT');
        $removed[] = 'office_directory';
    }

    $model_targets = [
        ['meta_box', 'workshop-details', 'Workshop Details'],
        ['taxonomy', 'locations', 'Locations'],
        ['taxonomy', 'workshop_topics', 'Workshop Topics'],
        ['post_type', 'workshops', 'Workshops'],
        ['options_page', 'studio-details', 'Studio Details'],
    ];
    foreach ($model_targets as [$type, $slug, $name]) {
        $model = $find($models[$type], $slug);
        if (!$model) {
            foreach ($models[$type] as $candidate) {
                if (is_array($candidate) && ($candidate['name'] ?? null) === $name) {
                    $model = $candidate;
                    break;
                }
            }
        }
        if (!$model) continue;
        $result = $service->rollback_created_model(['rollback' => [
            'modelType' => $type,
            'id' => (string) ($model['id'] ?? ''),
            'afterFingerprint' => (string) ($model['fingerprint'] ?? ''),
        ]]);
        $unwrap($result, "Delete JetEngine {$type} {$slug}");
        $removed[] = "{$type}:{$slug}";
    }

    $modules_after_cleanup = $unwrap($service->list_modules(), 'JetEngine modules after cleanup');
    $cct_module = null;
    foreach (($modules_after_cleanup['modules'] ?? []) as $module) {
        if (is_array($module) && ($module['slug'] ?? null) === 'custom-content-types') {
            $cct_module = $module;
            break;
        }
    }
    if (!empty($cct_module['active'])) {
        $unwrap($service->set_module_state([
            'module' => 'custom-content-types',
            'enabled' => false,
            'expectedFingerprint' => (string) ($modules_after_cleanup['fingerprint'] ?? ''),
        ]), 'Disable JetEngine CCT module');
        $removed[] = 'module:custom-content-types';
    }
    WP_CLI::log(wp_json_encode(['fixturesClean' => true, 'removed' => $removed]));
    return;
}

WP_CLI::log(wp_json_encode([
    'expectation' => $expect,
    'modules' => $modules,
    'fixtures' => [
        'workshops' => $find($models['post_type'], 'workshops'),
        'workshopTopics' => $find($models['taxonomy'], 'workshop_topics'),
        'locations' => $find($models['taxonomy'], 'locations'),
        'studioDetails' => $find($models['options_page'], 'studio-details'),
        'officeDirectory' => $cct,
        'officeRecords' => $records,
    ],
]));
