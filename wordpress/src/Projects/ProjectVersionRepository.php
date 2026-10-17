<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

use PixflowDesign\WordPress\Database\Table;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectVersionRepository
{
    public function create(int $project_id, array $input): array
    {
        global $wpdb;

        $version_number = isset($input['version_number'])
            ? max(1, (int) $input['version_number'])
            : $this->next_version_number($project_id);

        $wpdb->insert(Table::name(Table::PROJECT_VERSIONS), [
            'project_id' => $project_id,
            'version_number' => $version_number,
            'created_by' => isset($input['created_by']) ? max(0, (int) $input['created_by']) : get_current_user_id(),
            'archive_path' => sanitize_text_field((string) ($input['archive_path'] ?? '')),
            'manifest_path' => sanitize_text_field((string) ($input['manifest_path'] ?? '')),
            'preview_path' => sanitize_text_field((string) ($input['preview_path'] ?? '')),
            'file_hash' => sanitize_text_field((string) ($input['file_hash'] ?? '')),
            'size_bytes' => max(0, (int) ($input['size_bytes'] ?? 0)),
            'summary' => sanitize_textarea_field((string) ($input['summary'] ?? '')),
            'metadata' => wp_json_encode(is_array($input['metadata'] ?? null) ? $input['metadata'] : []),
            'created_at' => gmdate('Y-m-d H:i:s'),
        ], [
            '%d', '%d', '%d', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s',
        ]);

        return $this->find((int) $wpdb->insert_id) ?? [];
    }

    public function find(int $id): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_VERSIONS) . ' WHERE id = %d LIMIT 1',
            $id
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    public function latest_for_project(int $project_id): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_VERSIONS) . ' WHERE project_id = %d ORDER BY version_number DESC LIMIT 1',
            $project_id
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    public function find_by_project_version(int $project_id, int $version_number): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_VERSIONS) . ' WHERE project_id = %d AND version_number = %d LIMIT 1',
            $project_id,
            $version_number
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    public function list_for_project(int $project_id, int $limit = 20): array
    {
        global $wpdb;

        $rows = $wpdb->get_results($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_VERSIONS) . ' WHERE project_id = %d ORDER BY version_number DESC LIMIT %d',
            $project_id,
            min(100, max(1, $limit))
        ), ARRAY_A);

        return array_values(array_map([$this, 'normalize'], is_array($rows) ? $rows : []));
    }

    public function next_version_number(int $project_id): int
    {
        global $wpdb;

        return 1 + (int) $wpdb->get_var($wpdb->prepare(
            'SELECT COALESCE(MAX(version_number), 0) FROM ' . Table::name(Table::PROJECT_VERSIONS) . ' WHERE project_id = %d',
            $project_id
        ));
    }

    public function normalize(array $row): array
    {
        return [
            'id' => (int) ($row['id'] ?? 0),
            'projectId' => (int) ($row['project_id'] ?? 0),
            'versionNumber' => (int) ($row['version_number'] ?? 0),
            'createdBy' => isset($row['created_by']) ? (int) $row['created_by'] : null,
            'archivePath' => (string) ($row['archive_path'] ?? ''),
            'manifestPath' => (string) ($row['manifest_path'] ?? ''),
            'previewPath' => (string) ($row['preview_path'] ?? ''),
            'fileHash' => (string) ($row['file_hash'] ?? ''),
            'sizeBytes' => (int) ($row['size_bytes'] ?? 0),
            'summary' => (string) ($row['summary'] ?? ''),
            'metadata' => $this->decode_json((string) ($row['metadata'] ?? '')),
            'createdAt' => (string) ($row['created_at'] ?? ''),
        ];
    }

    private function decode_json(string $json): array
    {
        $decoded = json_decode($json, true);

        return is_array($decoded) ? $decoded : [];
    }
}
