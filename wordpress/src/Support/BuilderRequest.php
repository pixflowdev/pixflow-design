<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Support;

if (!defined('ABSPATH')) {
    exit;
}

final class BuilderRequest
{
    public static function is_builder_main_request(): bool
    {
        if (!\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks')) return false;
        if (function_exists('bricks_is_builder_main')) {
            return (bool) bricks_is_builder_main();
        }

        $bricks = isset($_GET['bricks']) ? sanitize_text_field(wp_unslash($_GET['bricks'])) : '';

        if ($bricks !== '') {
            return true;
        }

        return isset($_GET['bricks-is-builder']);
    }
}
