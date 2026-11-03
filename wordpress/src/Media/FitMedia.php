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
        $css = 'builder/dynamic-fit.css';
        wp_enqueue_style('pixflow-dynamic-fit', PIXFLOW_DESIGN_ASSETS_URL . $css, [], (string) filemtime(PIXFLOW_DESIGN_ASSETS_DIR . $css));
        $deps = ['media-views', 'wp-api-fetch', 'wp-i18n'];
        if (doing_action('enqueue_block_editor_assets')) $deps[] = 'wp-block-editor';
        wp_enqueue_script('pixflow-fit-media', PIXFLOW_DESIGN_ASSETS_URL . $asset,
            $deps, (string) filemtime(PIXFLOW_DESIGN_ASSETS_DIR . $asset), true);
        // The builder controls use wp.i18n before the Workspace has mounted.
        $messages = [
            'Calculate' => __('Calculate', 'pixflow-design'),
            'Calculate the image sizes for this placement. Each row keeps its own image.' => __('Calculate the image sizes for this placement. Each row keeps its own image.', 'pixflow-design'),
            'Calculated from the editor preview.' => __('Calculated from the editor preview.', 'pixflow-design'),
            'Calculating image sizes…' => __('Calculating image sizes…', 'pixflow-design'),
            'Cancel' => __('Cancel', 'pixflow-design'),
            'Choose a JPEG, PNG or WebP image.' => __('Choose a JPEG, PNG or WebP image.', 'pixflow-design'),
            'Could not optimise this image.' => __('Could not optimise this image.', 'pixflow-design'),
            'Could not read this image.' => __('Could not read this image.', 'pixflow-design'),
            'Desktop' => __('Desktop', 'pixflow-design'),
            'Disable' => __('Disable', 'pixflow-design'),
            'Enter a size for each visible placement.' => __('Enter a size for each visible placement.', 'pixflow-design'),
            'Enter width × height in pixels, for example 480 × 320.' => __('Enter width × height in pixels, for example 480 × 320.', 'pixflow-design'),
            'Finished. Responsive image sizes are set.' => __('Finished. Responsive image sizes are set.', 'pixflow-design'),
            'Fit & optimise' => __('Fit & optimise', 'pixflow-design'),
            'Fit this image to its placement across screen sizes.' => __('Fit this image to its placement across screen sizes.', 'pixflow-design'),
            'Image optimisation' => __('Image optimisation', 'pixflow-design'),
            'Image size has changed and needs reoptimising.' => __('Image size has changed and needs reoptimising.', 'pixflow-design'),
            'Image sizes updated. Saving…' => __('Image sizes updated. Saving…', 'pixflow-design'),
            'Import & optimise' => __('Import & optimise', 'pixflow-design'),
            'Measuring placement…' => __('Measuring placement…', 'pixflow-design'),
            'Mobile' => __('Mobile', 'pixflow-design'),
            'Optimise dynamic images' => __('Optimise dynamic images', 'pixflow-design'),
            'Optimise image' => __('Optimise image', 'pixflow-design'),
            'Placement sizes' => __('Placement sizes', 'pixflow-design'),
            'Recalculating image sizes…' => __('Recalculating image sizes…', 'pixflow-design'),
            'Reoptimise dynamic images' => __('Reoptimise dynamic images', 'pixflow-design'),
            'Reoptimise image' => __('Reoptimise image', 'pixflow-design'),
            'Revert to original' => __('Revert to original', 'pixflow-design'),
            'Save' => __('Save', 'pixflow-design'),
            'Save to disable optimisation for this placement.' => __('Save to disable optimisation for this placement.', 'pixflow-design'),
            'Saving with existing sizes for images that could not be checked.' => __('Saving with existing sizes for images that could not be checked.', 'pixflow-design'),
            'Select the image again to import it.' => __('Select the image again to import it.', 'pixflow-design'),
            'Select the image and try again.' => __('Select the image and try again.', 'pixflow-design'),
            'Tablet' => __('Tablet', 'pixflow-design'),
            'The selected placement has no measurable size.' => __('The selected placement has no measurable size.', 'pixflow-design'),
            'Upscaled image saved. %s' => __('Upscaled image saved. %s', 'pixflow-design'),
            'Upscaling image… %s' => __('Upscaling image… %s', 'pixflow-design'),
            'Upscaling interrupted. Remaining sizes will be retried.' => __('Upscaling interrupted. Remaining sizes will be retried.', 'pixflow-design'),
            'Widths are in pixels. You can adjust each size before saving.' => __('Widths are in pixels. You can adjust each size before saving.', 'pixflow-design'),
        ];
        $locale_data = [];
        foreach ($messages as $source => $translation) {
            if ($source !== $translation) $locale_data[$source] = [$translation];
        }
        if ($locale_data) {
            wp_add_inline_script('pixflow-fit-media', 'wp.i18n.setLocaleData(' .
                wp_json_encode($locale_data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) .
                ', "pixflow-design");', 'before');
        }
    }
}
