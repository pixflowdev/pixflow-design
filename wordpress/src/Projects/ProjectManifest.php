<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectManifest
{
    public function build(array $project, array $version = [], array $context = []): array
    {
        return [
            'schema' => 1,
            'source' => 'pixflow-design',
            'project' => [
                'uuid' => (string) ($project['uuid'] ?? ''),
                'kind' => (string) ($project['kind'] ?? 'project'),
                'title' => (string) ($project['title'] ?? ''),
                'status' => (string) ($project['status'] ?? 'draft'),
                'visibility' => (string) ($project['visibility'] ?? 'site'),
            ],
            'version' => [
                'number' => (int) ($version['versionNumber'] ?? 0),
                'hash' => (string) ($version['fileHash'] ?? ''),
                'sizeBytes' => (int) ($version['sizeBytes'] ?? 0),
                'createdAt' => (string) ($version['createdAt'] ?? ''),
            ],
            'context' => $context,
            'plugin' => [
                'version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '',
            ],
            'createdAt' => gmdate('Y-m-d H:i:s'),
        ];
    }
}
