<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) exit;

final class FitMedia {
    public static function enqueue(): void {
        $asset = 'app/pixflow-fit-media.js';
        if (!current_user_can('upload_files') || !is_file(PIXFLOW_DESIGN_ASSETS_DIR . $asset)) return;
        wp_enqueue_media();
        wp_enqueue_script('pixflow-fit-media', PIXFLOW_DESIGN_ASSETS_URL . $asset,
            ['media-views', 'wp-api-fetch', 'wp-i18n'], (string) filemtime(PIXFLOW_DESIGN_ASSETS_DIR . $asset), true);
    }
}
