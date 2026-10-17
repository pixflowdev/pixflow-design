<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Bridge;

use PixflowDesign\WordPress\Admin\WpAdminSurfacePolicy;

if (!defined('ABSPATH')) {
    exit;
}

final class AdminBridgeStatus
{
    private const SCRIPT_HANDLE = 'pixflow-design-admin-bridge-status';

    public function __construct(private readonly BridgeConfig $bridge_config)
    {
    }

    public function register(): void
    {
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
    }

    public function enqueue_assets(): void
    {
        if (!WpAdminSurfacePolicy::can_render_admin_surface()) {
            return;
        }

        $this->enqueue_shared_assets();
    }

    /** Called by an authorized editor module after validating its page target. */
    public function enqueue_editor_assets(): void
    {
        if (!WpAdminSurfacePolicy::can_use()) {
            return;
        }
        $this->enqueue_shared_assets();
    }

    private function enqueue_shared_assets(): void
    {

        $asset_path = PIXFLOW_DESIGN_ASSETS_DIR . 'admin/bridge-status.js';
        $style_path = PIXFLOW_DESIGN_ASSETS_DIR . 'admin/wp-admin-floating-panel.css';
        wp_enqueue_style(
            'pixflow-design-admin-bar',
            PIXFLOW_DESIGN_ASSETS_URL . 'admin/wp-admin-floating-panel.css',
            [],
            PIXFLOW_DESIGN_VERSION . '.' . (file_exists($style_path) ? (int) filemtime($style_path) : 0)
        );
        $app_config = get_option('pixflow_design_app_config', []);
        $app_config = is_array($app_config) ? $app_config : [];
        $bridge_enabled = (string) ($app_config['mode'] ?? 'daemon') !== 'api';
        if ($bridge_enabled) {
            wp_enqueue_script(
                self::SCRIPT_HANDLE,
                PIXFLOW_DESIGN_ASSETS_URL . 'admin/bridge-status.js',
                [],
                PIXFLOW_DESIGN_VERSION . '.' . (file_exists($asset_path) ? (int) filemtime($asset_path) : 0),
                true
            );
        }

        if (!$bridge_enabled) {
            return;
        }

        wp_localize_script(self::SCRIPT_HANDLE, 'pixflowDesignAdminBridge', [
            'bridgeBaseUrl' => esc_url_raw($this->bridge_config->base_url()),
            'bridgeRequiredVersion' => defined('PIXFLOW_DESIGN_BRIDGE_VERSION') ? PIXFLOW_DESIGN_BRIDGE_VERSION : '0.0.0',
            'bridgeInstallWindowsUrl' => esc_url_raw('https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-win-x64-setup.exe'),
            'bridgeInstallMacArm64Url' => esc_url_raw('https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-mac-arm64.dmg'),
            'bridgeInstallUnixUrl' => esc_url_raw('https://pixflow.dev/downloads/pixflow-design-bridge/install.sh'),
            'siteHash' => hash('sha256', untrailingslashit(home_url())),
            'siteUrl' => esc_url_raw(home_url()),
            'siteOrigin' => esc_url_raw($this->site_origin()),
            'siteLabel' => sanitize_text_field((string) get_bloginfo('name')),
            'restBaseUrl' => esc_url_raw(rest_url('pixflow-design/v1')),
            'restNonce' => wp_create_nonce('wp_rest'),
        ]);
    }

    private function site_origin(): string
    {
        $home = home_url();
        $scheme = wp_parse_url($home, PHP_URL_SCHEME);
        $host = wp_parse_url($home, PHP_URL_HOST);
        $port = wp_parse_url($home, PHP_URL_PORT);

        if (!is_string($scheme) || $scheme === '' || !is_string($host) || $host === '') {
            return $home;
        }

        return $scheme . '://' . $host . (is_int($port) ? ':' . $port : '');
    }
}
