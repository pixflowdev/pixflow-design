<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

use PixflowDesign\WordPress\Database\Table;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectAccessRepository
{
    public function grant(int $project_id, int $user_id, string $role = 'editor'): array
    {
        global $wpdb;

        $role = sanitize_key($role);
        $role = in_array($role, ['owner', 'editor', 'viewer'], true) ? $role : 'editor';
        $now = gmdate('Y-m-d H:i:s');
        $existing = $this->find_for_user($project_id, $user_id);

        if ($existing !== null) {
            $wpdb->update(Table::name(Table::PROJECT_ACCESS), [
                'role' => $role,
                'updated_at' => $now,
            ], [
                'project_id' => $project_id,
                'user_id' => $user_id,
            ], ['%s', '%s'], ['%d', '%d']);

            return $this->find_for_user($project_id, $user_id) ?? [];
        }

        $wpdb->insert(Table::name(Table::PROJECT_ACCESS), [
            'project_id' => $project_id,
            'user_id' => $user_id,
            'role' => $role,
            'created_at' => $now,
            'updated_at' => $now,
        ], ['%d', '%d', '%s', '%s', '%s']);

        return $this->find((int) $wpdb->insert_id) ?? [];
    }

    public function revoke(int $project_id, int $user_id): void
    {
        global $wpdb;

        $wpdb->delete(Table::name(Table::PROJECT_ACCESS), [
            'project_id' => $project_id,
            'user_id' => $user_id,
        ], ['%d', '%d']);
    }

    public function find(int $id): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_ACCESS) . ' WHERE id = %d LIMIT 1',
            $id
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    public function find_for_user(int $project_id, int $user_id): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_ACCESS) . ' WHERE project_id = %d AND user_id = %d LIMIT 1',
            $project_id,
            $user_id
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    public function list_for_project(int $project_id): array
    {
        global $wpdb;

        $rows = $wpdb->get_results($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_ACCESS) . ' WHERE project_id = %d ORDER BY role ASC, user_id ASC',
            $project_id
        ), ARRAY_A);

        return array_values(array_map([$this, 'normalize'], is_array($rows) ? $rows : []));
    }

    public function normalize(array $row): array
    {
        return [
            'id' => (int) ($row['id'] ?? 0),
            'projectId' => (int) ($row['project_id'] ?? 0),
            'userId' => (int) ($row['user_id'] ?? 0),
            'role' => (string) ($row['role'] ?? 'viewer'),
            'createdAt' => (string) ($row['created_at'] ?? ''),
            'updatedAt' => (string) ($row['updated_at'] ?? ''),
        ];
    }
}
