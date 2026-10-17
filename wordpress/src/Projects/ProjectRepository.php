<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

use PixflowDesign\WordPress\Database\Table;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectRepository
{
    public function create(array $input): array
    {
        global $wpdb;

        $now = gmdate('Y-m-d H:i:s');
        $uuid = $this->uuid();
        $title = sanitize_text_field((string) ($input['title'] ?? 'Untitled project'));
        $kind = sanitize_key((string) ($input['kind'] ?? 'project'));
        $row = [
            'uuid' => $uuid,
            'kind' => $kind !== '' ? $kind : 'project',
            'title' => $title !== '' ? $title : 'Untitled project',
            'slug' => sanitize_title($title !== '' ? $title : $uuid),
            'owner_user_id' => isset($input['owner_user_id']) ? max(0, (int) $input['owner_user_id']) : get_current_user_id(),
            'site_url_hash' => $this->site_url_hash(),
            'source_bridge_id' => sanitize_text_field((string) ($input['source_bridge_id'] ?? '')),
            'parent_project_id' => isset($input['parent_project_id']) ? max(0, (int) $input['parent_project_id']) : null,
            'status' => sanitize_key((string) ($input['status'] ?? 'draft')),
            'visibility' => sanitize_key((string) ($input['visibility'] ?? 'site')),
            'metadata' => wp_json_encode(is_array($input['metadata'] ?? null) ? $input['metadata'] : []),
            'created_at' => $now,
            'updated_at' => $now,
        ];

        // The official WordPress SQLite integration currently mis-translates
        // wpdb's generated multi-value INSERT for this mixed string/nullable
        // row: quoted UUIDs, hashes, titles, JSON, and dates can be persisted
        // as truncated numeric fragments. Use its exposed native PDO handle so
        // local/on-device projects retain the exact same schema contract as
        // MySQL-backed sites. This is still a parameterized, project-owned
        // insert; MySQL continues through the normal wpdb API.
        if ($this->insert_with_sqlite_pdo(Table::name(Table::PROJECTS), $row)) {
            $id = (int) $GLOBALS['@pdo']->lastInsertId();
            $wpdb->insert_id = $id;
        } else {
            $wpdb->insert(Table::name(Table::PROJECTS), $row, [
                '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s',
            ]);
            $id = (int) $wpdb->insert_id;
        }

        return $this->find($id) ?? [];
    }

    private function insert_with_sqlite_pdo(string $table, array $row): bool
    {
        if (!defined('DB_ENGINE') || strtolower((string) DB_ENGINE) !== 'sqlite') {
            return false;
        }

        $pdo = $GLOBALS['@pdo'] ?? null;
        if (!$pdo instanceof \PDO) {
            return false;
        }

        $columns = array_keys($row);
        $column_sql = implode(', ', array_map(static fn(string $column): string => '"' . $column . '"', $columns));
        $placeholder_sql = implode(', ', array_fill(0, count($columns), '?'));
        $statement = $pdo->prepare(sprintf('INSERT INTO "%s" (%s) VALUES (%s)', $table, $column_sql, $placeholder_sql));
        if ($statement === false) {
            return false;
        }

        return $statement->execute(array_values($row));
    }

    public function find(int $id): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECTS) . ' WHERE id = %d LIMIT 1',
            $id
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    public function find_by_uuid(string $uuid): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Table::name(Table::PROJECTS) . ' WHERE uuid = %s LIMIT 1',
            $uuid
        ), ARRAY_A);

        return is_array($row) ? $this->normalize($row) : null;
    }

    /** Permission checks must not decode a project's retained transcript backup. */
    public function find_access_by_uuid(string $uuid): ?array
    {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT id, uuid, owner_user_id, visibility, status FROM ' . Table::name(Table::PROJECTS) . ' WHERE uuid = %s LIMIT 1', $uuid
        ), ARRAY_A);
        return is_array($row) ? $this->normalize($row) : null;
    }

    public function list(array $args = []): array
    {
        global $wpdb;

        $limit = min(100, max(1, (int) ($args['limit'] ?? 30)));
        $offset = max(0, (int) ($args['offset'] ?? 0));
        $where = ['site_url_hash = %s'];
        $values = [$this->site_url_hash()];

        if (!current_user_can('manage_options')) {
            $user_id = get_current_user_id();
            $where[] = '(owner_user_id = %d OR visibility = %s OR id IN (SELECT project_id FROM '
                . Table::name(Table::PROJECT_ACCESS) . ' WHERE user_id = %d))';
            array_push($values, $user_id, 'site', $user_id);
        }

        if (!empty($args['kind'])) {
            $where[] = 'kind = %s';
            $values[] = sanitize_key((string) $args['kind']);
        }

        if (!empty($args['status'])) {
            $where[] = 'status = %s';
            $values[] = sanitize_key((string) $args['status']);
        } else {
            $where[] = "status NOT IN ('deleted', 'archived')";
        }

        if (!empty($args['owner_user_id'])) {
            $where[] = 'owner_user_id = %d';
            $values[] = max(0, (int) $args['owner_user_id']);
        }

        $values[] = $limit;
        $values[] = $offset;

        $sql = 'SELECT * FROM ' . Table::name(Table::PROJECTS)
            . ' WHERE ' . implode(' AND ', $where)
            . ' ORDER BY updated_at DESC, id DESC LIMIT %d OFFSET %d';

        $rows = $wpdb->get_results($wpdb->prepare($sql, ...$values), ARRAY_A);

        return array_values(array_map([$this, 'normalize'], is_array($rows) ? $rows : []));
    }

    public function set_current_version(int $project_id, int $version_id): void
    {
        global $wpdb;

        $wpdb->update(Table::name(Table::PROJECTS), [
            'current_version_id' => $version_id,
            'updated_at' => gmdate('Y-m-d H:i:s'),
        ], ['id' => $project_id], ['%d', '%s'], ['%d']);
    }

    public function update_metadata(int $project_id, array $metadata): ?array
    {
        global $wpdb;

        $wpdb->update(Table::name(Table::PROJECTS), [
            'metadata' => wp_json_encode($metadata),
            'updated_at' => gmdate('Y-m-d H:i:s'),
        ], ['id' => $project_id], ['%s', '%s'], ['%d']);

        return $this->find($project_id);
    }

    public function update_metadata_by_uuid(string $uuid, array $metadata): ?array
    {
        $project = $this->find_by_uuid($uuid);

        if ($project === null) {
            return null;
        }

        return $this->update_metadata((int) ($project['id'] ?? 0), $metadata);
    }

    /**
     * Apply the small editable project surface used by the workspace client.
     *
     * The embedded app uses the daemon's PATCH /api/projects contract for
     * renames and for keeping pending prompts, design-system choices, and
     * media metadata durable. WordPress projects need the same contract so a
     * BYOK-only session does not appear to save locally while silently
     * dropping the change on reload.
     */
    public function update_by_uuid(string $uuid, array $patch): ?array
    {
        global $wpdb;

        $project = $this->find_by_uuid($uuid);
        if ($project === null) {
            return null;
        }

        $fields = [];
        $formats = [];
        if (array_key_exists('title', $patch)) {
            $title = sanitize_text_field((string) $patch['title']);
            $fields['title'] = $title !== '' ? $title : 'Untitled project';
            $formats[] = '%s';
            $fields['slug'] = sanitize_title($fields['title']);
            $formats[] = '%s';
        }
        if (array_key_exists('kind', $patch)) {
            $kind = sanitize_key((string) $patch['kind']);
            if ($kind !== '') {
                $fields['kind'] = $kind;
                $formats[] = '%s';
            }
        }
        if (array_key_exists('metadata', $patch) && is_array($patch['metadata'])) {
            $metadata = $patch['metadata'];
            // App project responses intentionally omit legacy chat backups. Generic
            // project edits cannot replace server-owned history with a partial copy.
            if (array_key_exists('odState', $project['metadata'])) $metadata['odState'] = $project['metadata']['odState'];
            else unset($metadata['odState']);
            $fields['metadata'] = wp_json_encode($metadata);
            $formats[] = '%s';
        }
        if ($fields === []) {
            return $project;
        }

        $fields['updated_at'] = gmdate('Y-m-d H:i:s');
        $formats[] = '%s';
        $wpdb->update(
            Table::name(Table::PROJECTS),
            $fields,
            ['id' => (int) ($project['id'] ?? 0)],
            $formats,
            ['%d'],
        );

        return $this->find((int) ($project['id'] ?? 0));
    }

    public function archive(int $project_id): void
    {
        $this->set_status($project_id, 'archived');
    }

    public function mark_deleted(int $project_id): void
    {
        $project = $this->find($project_id);
        $this->set_status($project_id, 'deleted');
        if ($project && !empty($project['uuid'])) (new \PixflowDesign\WordPress\Chat\WorkingContextRepository())->forget_project($project['uuid']);
    }

    public function normalize(array $row): array
    {
        return [
            'id' => (int) ($row['id'] ?? 0),
            'uuid' => (string) ($row['uuid'] ?? ''),
            'kind' => (string) ($row['kind'] ?? 'project'),
            'title' => (string) ($row['title'] ?? ''),
            'slug' => (string) ($row['slug'] ?? ''),
            'ownerUserId' => isset($row['owner_user_id']) ? (int) $row['owner_user_id'] : null,
            'siteUrlHash' => (string) ($row['site_url_hash'] ?? ''),
            'sourceBridgeId' => (string) ($row['source_bridge_id'] ?? ''),
            'parentProjectId' => isset($row['parent_project_id']) ? (int) $row['parent_project_id'] : null,
            'currentVersionId' => isset($row['current_version_id']) ? (int) $row['current_version_id'] : null,
            'status' => (string) ($row['status'] ?? 'draft'),
            'visibility' => (string) ($row['visibility'] ?? 'site'),
            'metadata' => $this->decode_json((string) ($row['metadata'] ?? '')),
            'createdAt' => (string) ($row['created_at'] ?? ''),
            'updatedAt' => (string) ($row['updated_at'] ?? ''),
            'lastOpenedAt' => (string) ($row['last_opened_at'] ?? ''),
        ];
    }

    private function set_status(int $project_id, string $status): void
    {
        global $wpdb;

        $wpdb->update(Table::name(Table::PROJECTS), [
            'status' => $status,
            'updated_at' => gmdate('Y-m-d H:i:s'),
        ], ['id' => $project_id], ['%s', '%s'], ['%d']);
    }

    private function site_url_hash(): string
    {
        return hash('sha256', untrailingslashit(home_url()));
    }

    private function uuid(): string
    {
        return function_exists('wp_generate_uuid4') ? wp_generate_uuid4() : sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            random_int(0, 0xffff),
            random_int(0, 0xffff),
            random_int(0, 0xffff),
            random_int(0, 0x0fff) | 0x4000,
            random_int(0, 0x3fff) | 0x8000,
            random_int(0, 0xffff),
            random_int(0, 0xffff),
            random_int(0, 0xffff)
        );
    }

    private function decode_json(string $json): array
    {
        $decoded = json_decode($json, true);

        return is_array($decoded) ? $decoded : [];
    }
}
