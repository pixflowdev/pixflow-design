<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg\Adapters;

if (!defined('ABSPATH')) {
    exit;
}

final class CoreBlockAdapter
{
    private const CERTIFIED = [
        'core/paragraph',
        'core/heading',
        'core/list',
        'core/list-item',
        'core/quote',
        'core/image',
        'core/gallery',
        'core/cover',
        'core/media-text',
        'core/buttons',
        'core/button',
        'core/group',
        'core/columns',
        'core/column',
        'core/separator',
        'core/table',
        'core/code',
    ];

    public function support(string $block_name): array
    {
        if (!str_starts_with($block_name, 'core/')) {
            return ['level' => 'not_applicable', 'adapter' => null, 'certified' => false, 'allowed' => true];
        }
        return [
            'level' => in_array($block_name, self::CERTIFIED, true) ? 'certified' : 'runtime_validation_required',
            'adapter' => 'pixflow-core-blocks',
            'certified' => in_array($block_name, self::CERTIFIED, true),
            'allowed' => true,
            'pluginVersion' => get_bloginfo('version'),
        ];
    }

    /** @return list<string> */
    public function certified_blocks(): array
    {
        return self::CERTIFIED;
    }
}
