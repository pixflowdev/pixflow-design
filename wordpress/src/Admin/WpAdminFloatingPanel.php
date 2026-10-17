<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

use PixflowDesign\WordPress\Assets\AssetRegistrar;

if (!defined('ABSPATH')) {
    exit;
}

final class WpAdminFloatingPanel
{
    public function __construct(
        private readonly AssetRegistrar $assets,
        private readonly WpAdminContext $context = new WpAdminContext(),
    ) {
    }

    public function register(): void
    {
        add_action('admin_bar_menu', [$this, 'add_admin_bar_nodes'], 89);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
    }

    public function add_admin_bar_nodes(\WP_Admin_Bar $admin_bar): void
    {
        if (!WpAdminSurfacePolicy::can_render_admin_surface() || !is_admin_bar_showing()) {
            return;
        }

        $admin_bar->add_node([
            'id' => 'pixflow-design',
            'parent' => 'top-secondary',
            'title' => '<span class="ab-icon pixflow-design-admin-bar__icon" aria-hidden="true"><img src="' . esc_url(PIXFLOW_DESIGN_ASSETS_URL . 'brand/pixflow-icon-light.svg') . '" alt="" /></span><span class="ab-label">' . esc_html__('Pixflow Design', 'pixflow-design') . '</span>',
            'href' => '#',
            'meta' => [
                'class' => 'pixflow-design-admin-bar',
                'title' => esc_attr__('Open Pixflow Design', 'pixflow-design'),
                'aria-label' => esc_attr__('Open Pixflow Design', 'pixflow-design'),
            ],
        ]);

        // Settings are available in Free. The menu reveals Workspace only
        // after current Pro access is confirmed, including activation in place.
        $admin_bar->add_node([
                'id' => 'pixflow-design-menu',
                'parent' => 'top-secondary',
                'title' => '<span class="ab-icon pixflow-design-admin-bar__icon" aria-hidden="true"><img src="' . esc_url(PIXFLOW_DESIGN_ASSETS_URL . 'brand/pixflow-menu-light.svg') . '" alt="" /></span><span class="ab-label">' . esc_html__('Open settings', 'pixflow-design') . '</span>',
                'href' => '#',
                'meta' => [
                    'class' => 'pixflow-design-admin-bar',
                    'title' => esc_attr__('Open settings', 'pixflow-design'),
                    'aria-label' => esc_attr__('Open settings', 'pixflow-design'),
                ],
        ]);
    }

    public function enqueue_assets(): void
    {
        if (!WpAdminSurfacePolicy::can_render_admin_surface()) {
            return;
        }

        $this->assets->enqueue_wp_admin_assets($this->context->snapshot());
    }
}
