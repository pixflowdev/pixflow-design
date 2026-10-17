<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

use PixflowDesign\WordPress\Database\Table;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectContextRepository
{
    public function upsert(int $project_id, array $context): array
    {
        global $wpdb;

        $existing_id = (int) $wpdb->get_var($wpdb->prepare(
            'SELECT id FROM ' . Table::name(Table::PROJECT_CONTEXTS) . ' WHERE project_id = %d LIMIT 1',
            $project_id
        ));

        $now = gmdate('Y-m-d H:i:s');
        $data = [
            'project_id' => $project_id,
            'post_id' => $context['post_id'] ?? null,
            'post_type' => $context['post_type'] !== '' ? $context['post_type'] : null,
            'bricks_template_id' => $context['bricks_template_id'] ?? null,
            'framework_route' => $context['framework_route'] !== '' ? $context['framework_route'] : null,
            'design_system_id' => $context['design_system_id'] !== '' ? $context['design_system_id'] : null,
            'mapping_route' => $context['mapping_route'] !== '' ? $context['mapping_route'] : null,
            'metadata' => wp_json_encode(is_array($context['metadata'] ?? null) ? $context['metadata'] : []),
            'updated_at' => $now,
        ];

        if ($existing_id > 0) {
            $wpdb->update(Table::name(Table::PROJECT_CONTEXTS), $data, ['id' => $existing_id]);
            return $this->find_by_project($project_id) ?? [];
        }

        $data['created_at'] = $now;
        $wpdb->insert(Table::name(Table::PROJECT_CONTEXTS), $data);

        return $this->find((int) $wpdb->insert_id) ?? [];
    }

    public function find(int $id): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_CONTEXTS) . ' WHERE id = %d LIMIT 1',
            $id
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    public function find_by_project(int $project_id): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_CONTEXTS) . ' WHERE project_id = %d LIMIT 1',
            $project_id
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    public function normalize(array $row): array
    {
        return [
            'id' => (int) ($row['id'] ?? 0),
            'projectId' => (int) ($row['project_id'] ?? 0),
            'postId' => isset($row['post_id']) ? (int) $row['post_id'] : null,
            'postType' => (string) ($row['post_type'] ?? ''),
            'bricksTemplateId' => isset($row['bricks_template_id']) ? (int) $row['bricks_template_id'] : null,
            'frameworkRoute' => (string) ($row['framework_route'] ?? ''),
            'designSystemId' => (string) ($row['design_system_id'] ?? ''),
            'mappingRoute' => (string) ($row['mapping_route'] ?? ''),
            'metadata' => $this->decode_json((string) ($row['metadata'] ?? '')),
            'createdAt' => (string) ($row['created_at'] ?? ''),
            'updatedAt' => (string) ($row['updated_at'] ?? ''),
        ];
    }

    private function decode_json(string $json): array
    {
        $decoded = json_decode($json, true);

        return is_array($decoded) ? $decoded : [];
    }
}
