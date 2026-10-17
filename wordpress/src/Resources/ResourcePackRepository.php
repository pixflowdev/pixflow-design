<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Resources;

if (!defined('ABSPATH')) {
    exit;
}

final class ResourcePackRepository
{
    private const OPTION_PACKS = 'pixflow_design_resource_packs';
    private const OPTION_OPERATIONS = 'pixflow_design_resource_pack_operations';
    private const OPTION_LOCKS = 'pixflow_design_resource_pack_locks';
    private const OPTION_REMOTE_MANIFEST = 'pixflow_design_resource_pack_manifest';
    private const ACTIVE_OPERATION_STATUSES = ['queued', 'downloading', 'validating', 'extracting', 'activating', 'deleting', 'repairing'];
    private const LOCK_TTL_SECONDS = 1800;

    public function installed(): array
    {
        $value = get_option(self::OPTION_PACKS, []);

        if (!is_array($value)) return [];
        $paths = new ResourcePackPathService();
        foreach ($value as &$pack) {
            if (!is_array($pack)) continue;
            $pack['path'] = $paths->resolve_record_path((string) ($pack['path'] ?? ''));
        }
        unset($pack);
        return $value;
    }

    public function get(string $slug): ?array
    {
        $packs = $this->installed();
        $record = $packs[sanitize_key($slug)] ?? null;

        return is_array($record) ? $record : null;
    }

    public function save_pack(string $slug, array $record): void
    {
        $slug = sanitize_key($slug);
        if ($slug === '') {
            return;
        }

        $packs = $this->installed();
        $packs[$slug] = $record + [
            'slug' => $slug,
            'updatedAt' => time(),
        ];

        update_option(self::OPTION_PACKS, $packs, false);
    }

    public function delete_pack(string $slug): void
    {
        $slug = sanitize_key($slug);
        $packs = $this->installed();
        unset($packs[$slug]);
        update_option(self::OPTION_PACKS, $packs, false);
    }

    public function operations(): array
    {
        $value = get_option(self::OPTION_OPERATIONS, []);

        return is_array($value) ? $value : [];
    }

    public function operation(string $operation_id): ?array
    {
        $operations = $this->operations();
        $operation = $operations[sanitize_key($operation_id)] ?? null;

        return is_array($operation) ? $operation : null;
    }

    public function save_operation(string $operation_id, array $record): void
    {
        $operation_id = sanitize_key($operation_id);
        if ($operation_id === '') {
            return;
        }

        $operations = $this->operations();
        $operations[$operation_id] = $record + [
            'id' => $operation_id,
            'updatedAt' => time(),
        ];

        update_option(self::OPTION_OPERATIONS, $operations, false);
    }

    public function active_operation_for_slug(string $slug): ?array
    {
        $slug = sanitize_key($slug);
        if ($slug === '') {
            return null;
        }

        $active = null;
        foreach ($this->operations() as $operation) {
            if (!is_array($operation) || (string) ($operation['slug'] ?? '') !== $slug) {
                continue;
            }

            if (!in_array((string) ($operation['status'] ?? ''), self::ACTIVE_OPERATION_STATUSES, true)) {
                continue;
            }

            if ($active === null || (int) ($operation['updatedAt'] ?? 0) > (int) ($active['updatedAt'] ?? 0)) {
                $active = $operation;
            }
        }

        return $active;
    }

    public function acquire_lock(string $slug, string $operation_id): bool
    {
        $slug = sanitize_key($slug);
        $operation_id = sanitize_key($operation_id);
        if ($slug === '' || $operation_id === '') {
            return false;
        }

        $locks = $this->locks();
        $existing = is_array($locks[$slug] ?? null) ? $locks[$slug] : null;
        if ($existing !== null) {
            $locked_at = (int) ($existing['lockedAt'] ?? 0);
            $existing_id = (string) ($existing['operationId'] ?? '');
            if ($existing_id !== $operation_id && time() - $locked_at < self::LOCK_TTL_SECONDS) {
                return false;
            }
        }

        $locks[$slug] = [
            'slug' => $slug,
            'operationId' => $operation_id,
            'lockedAt' => time(),
        ];
        update_option(self::OPTION_LOCKS, $locks, false);

        return true;
    }

    public function release_lock(string $slug, string $operation_id): void
    {
        $slug = sanitize_key($slug);
        $operation_id = sanitize_key($operation_id);
        if ($slug === '' || $operation_id === '') {
            return;
        }

        $locks = $this->locks();
        $existing = is_array($locks[$slug] ?? null) ? $locks[$slug] : null;
        if ($existing === null || (string) ($existing['operationId'] ?? '') !== $operation_id) {
            return;
        }

        unset($locks[$slug]);
        update_option(self::OPTION_LOCKS, $locks, false);
    }

    public function locks(): array
    {
        $value = get_option(self::OPTION_LOCKS, []);

        return is_array($value) ? $value : [];
    }

    public function remote_manifest(): ?array
    {
        $value = get_option(self::OPTION_REMOTE_MANIFEST, null);

        return is_array($value) ? $value : null;
    }

    public function save_remote_manifest(array $manifest): void
    {
        update_option(self::OPTION_REMOTE_MANIFEST, $manifest + [
            'cachedAt' => time(),
        ], false);
    }
}
