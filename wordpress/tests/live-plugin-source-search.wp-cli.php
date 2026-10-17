<?php

if (!defined('WP_CLI') || !WP_CLI) throw new RuntimeException('Run through WP-CLI.');

$service = new \PixflowDesign\WordPress\Admin\WpAdminPluginSourceService();
$result = $service->search_plugin_source([
    'plugin' => 'Yoast SEO',
    'query' => 'wpseo_metadesc meta description filter',
    'maxResults' => 16,
]);
if (is_wp_error($result)) throw new RuntimeException($result->get_error_code() . ': ' . $result->get_error_message());
$matches = array_values(array_filter((array) ($result['matches'] ?? []), static fn(array $match): bool => str_contains((string) ($match['excerpt'] ?? ''), 'wpseo_metadesc')));
if ($matches === []) throw new RuntimeException('The installed Yoast source search did not evidence wpseo_metadesc.');
WP_CLI::log(wp_json_encode([
    'ok' => true,
    'plugin' => $result['plugin'] ?? null,
    'query' => $result['query'] ?? '',
    'scannedFiles' => $result['scannedFiles'] ?? 0,
    'scannedBytes' => $result['scannedBytes'] ?? 0,
    'evidence' => array_map(static fn(array $match): array => ['file' => $match['file'], 'line' => $match['line']], array_slice($matches, 0, 5)),
]));
