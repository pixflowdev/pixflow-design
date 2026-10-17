<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectArchive
{
    public function __construct(
        private readonly ProjectStorage $storage = new ProjectStorage(),
    ) {
    }

    public function archive_path(string $uuid, int $version_number): string
    {
        return $this->storage->version_dir($uuid, $version_number) . '/project.zip';
    }

    public function manifest_path(string $uuid, int $version_number): string
    {
        return $this->storage->version_dir($uuid, $version_number) . '/manifest.json';
    }

    public function preview_path(string $uuid): string
    {
        return $this->storage->project_dir($uuid) . '/preview.webp';
    }

    public function hash_file(string $path): string
    {
        if (!is_readable($path)) {
            return '';
        }

        return (string) hash_file('sha256', $path);
    }

    public function file_size(string $path): int
    {
        if (!is_readable($path)) {
            return 0;
        }

        return max(0, (int) filesize($path));
    }

    public function is_supported_archive_name(string $name): bool
    {
        return preg_match('/^[a-z0-9][a-z0-9._-]*\.zip$/i', $name) === 1;
    }
}
