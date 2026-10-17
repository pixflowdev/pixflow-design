<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

use PixflowDesign\WordPress\Database\Table;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectLockRepository
{
    public function find_for_project(int $project_id): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECT_LOCKS) . ' WHERE project_id = %d LIMIT 1',
            $project_id
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    public function acquire(int $project_id, string $session_id, int $ttl_seconds, array $metadata = []): array
    {
        global $wpdb;

        $now = time();
        $data = [
            'project_id' => $project_id,
            'user_id' => get_current_user_id(),
            'session_id' => sanitize_text_field($session_id),
            'status' => 'active',
            'metadata' => wp_json_encode($metadata),
            'locked_at' => gmdate('Y-m-d H:i:s', $now),
            'updated_at' => gmdate('Y-m-d H:i:s', $now),
            'expires_at' => gmdate('Y-m-d H:i:s', $now + max(30, $ttl_seconds)),
        ];

        $wpdb->replace(Table::name(Table::PROJECT_LOCKS), $data, [
            '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s',
        ]);

        return $this->find_for_project($project_id) ?? [];
    }

    public function release(int $project_id, string $session_id = ''): void
    {
        global $wpdb;

        $where = ['project_id' => $project_id];
        $format = ['%d'];

        if ($session_id !== '') {
            $where['session_id'] = sanitize_text_field($session_id);
            $format[] = '%s';
        }

        $wpdb->delete(Table::name(Table::PROJECT_LOCKS), $where, $format);
    }

    public function purge_expired(): void
    {
        global $wpdb;

        $wpdb->query($wpdb->prepare(
            'DELETE FROM ' . Table::name(Table::PROJECT_LOCKS) . ' WHERE expires_at < %s',
            gmdate('Y-m-d H:i:s')
        ));
    }

    public function is_expired(array $lock): bool
    {
        $expires = strtotime((string) ($lock['expiresAt'] ?? ''));

        return $expires > 0 && $expires < time();
    }

    public function normalize(array $row): array
    {
        $user_id = (int) ($row['user_id'] ?? 0);
        $user = $user_id > 0 ? get_user_by('id', $user_id) : false;

        return [
            'id' => (int) ($row['id'] ?? 0),
            'projectId' => (int) ($row['project_id'] ?? 0),
            'userId' => $user_id,
            'userName' => $user ? (string) $user->display_name : '',
            'sessionId' => (string) ($row['session_id'] ?? ''),
            'status' => (string) ($row['status'] ?? 'active'),
            'metadata' => $this->decode_json((string) ($row['metadata'] ?? '')),
            'lockedAt' => (string) ($row['locked_at'] ?? ''),
            'updatedAt' => (string) ($row['updated_at'] ?? ''),
            'expiresAt' => (string) ($row['expires_at'] ?? ''),
        ];
    }

    private function decode_json(string $json): array
    {
        $decoded = json_decode($json, true);

        return is_array($decoded) ? $decoded : [];
    }
}
