<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) exit;

final class FitMedia {
    private const SOURCE = '_pixflow_fit_source';

    public static function register_source_tracking(): void {
        add_action('rest_after_insert_attachment', static function ($attachment, $request, $creating): void {
            $source = absint($request->get_param('pixflow_fit_source'));
            if (!$creating || !$source || $source === $attachment->ID || !wp_attachment_is_image($source)
                || !current_user_can('edit_post', $attachment->ID) || !current_user_can('read_post', $source)) return;
            update_post_meta($attachment->ID, self::SOURCE, $source);
        }, 10, 3);
        add_filter('wp_prepare_attachment_for_js', static function ($response, $attachment) {
            $source = (int) get_post_meta($attachment->ID, self::SOURCE, true);
            if ($source && wp_attachment_is_image($source) && current_user_can('read_post', $source)) {
                $response['pixflowFitSource'] = $source;
            }
            return $response;
        }, 10, 2);
    }

    public static function enqueue(): void {
        $asset = 'app/pixflow-fit-media.js';
        if (!current_user_can('upload_files') || !is_file(PIXFLOW_DESIGN_ASSETS_DIR . $asset)) return;
        wp_enqueue_media();
        $deps = ['media-views', 'wp-api-fetch', 'wp-i18n'];
        if (doing_action('enqueue_block_editor_assets')) $deps[] = 'wp-block-editor';
        wp_enqueue_script('pixflow-fit-media', PIXFLOW_DESIGN_ASSETS_URL . $asset,
            $deps, (string) filemtime(PIXFLOW_DESIGN_ASSETS_DIR . $asset), true);
    }
}
