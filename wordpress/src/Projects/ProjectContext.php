<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectContext
{
    public static function from_input(array $input): array
    {
        return [
            'post_id' => isset($input['post_id']) ? max(0, (int) $input['post_id']) : null,
            'post_type' => sanitize_key((string) ($input['post_type'] ?? '')),
            'bricks_template_id' => isset($input['bricks_template_id']) ? max(0, (int) $input['bricks_template_id']) : null,
            'framework_route' => sanitize_key((string) ($input['framework_route'] ?? '')),
            'design_system_id' => sanitize_text_field((string) ($input['design_system_id'] ?? '')),
            'mapping_route' => sanitize_key((string) ($input['mapping_route'] ?? '')),
            'metadata' => is_array($input['metadata'] ?? null) ? $input['metadata'] : [],
        ];
    }
}
