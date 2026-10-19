<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress;

use PixflowDesign\WordPress\Assets\AssetRegistrar;
use PixflowDesign\WordPress\Admin\WpAdminFloatingPanel;
use PixflowDesign\WordPress\Bridge\AdminBridgeStatus;
use PixflowDesign\WordPress\Bridge\BridgeConfig;
use PixflowDesign\WordPress\Database\Migrations;
use PixflowDesign\WordPress\Http\Routes\MediaRoutes;
use PixflowDesign\WordPress\Http\Routes\ProviderSettingsRoutes;
use PixflowDesign\WordPress\Http\Routes\ResourcePackRoutes;
use PixflowDesign\WordPress\Http\RestController;
use PixflowDesign\WordPress\Http\WpAdminCapabilityRestController;
use PixflowDesign\WordPress\Admin\WpAdminCapabilityRegistry;
use PixflowDesign\WordPress\Admin\WpAdminCapabilitySafetyPlane;
use PixflowDesign\WordPress\Admin\WpAdminPairingService;
use PixflowDesign\WordPress\Admin\Gutenberg\WpAdminGutenbergEditorBridge;

if (!defined('ABSPATH')) {
    exit;
}

final class Plugin
{
    private function __construct(
        private readonly AdminBridgeStatus $admin_bridge_status,
        private readonly WpAdminFloatingPanel $wp_admin_floating_panel,
        private readonly RestController $rest_controller,
        private readonly WpAdminCapabilityRestController $wp_admin_capability_rest,
        private readonly WpAdminGutenbergEditorBridge $wp_admin_gutenberg_editor_bridge,
        private readonly MediaRoutes $media_routes,
        private readonly ProviderSettingsRoutes $provider_settings_routes,
        private readonly ResourcePackRoutes $resource_pack_routes,
    ) {
    }

    public static function boot(): void
    {
        self::create()->register();
    }

    public static function activate(): void
    {
        Migrations::activate();
    }

    public static function create(): self
    {
        $bridge_config = new BridgeConfig();
        $asset_registrar = new AssetRegistrar($bridge_config);

        $capability_registry = new WpAdminCapabilityRegistry();
        $capability_registry->register();
        $pairing = new WpAdminPairingService();

        return new self(
            new AdminBridgeStatus($bridge_config),
            new WpAdminFloatingPanel($asset_registrar),
            new RestController(),
            new WpAdminCapabilityRestController(
                new WpAdminCapabilitySafetyPlane($capability_registry, new \PixflowDesign\WordPress\Admin\WpAdminContext(), $pairing),
                $pairing,
            ),
            new WpAdminGutenbergEditorBridge(),
            new MediaRoutes(),
            new ProviderSettingsRoutes(),
            new ResourcePackRoutes(),
        );
    }

    public function register(): void
    {
        // Separately packaged add-ons register after all plugin files load.
        // Bundled integrations stay in place until their extraction is verified.
        (new \PixflowDesign\WordPress\Modules\ModuleHost())->register();
        \PixflowDesign\WordPress\Modules\SavedExtensionState::register();
        \PixflowDesign\WordPress\Languages\LanguagePackService::register();
        // Native editor saves remain owned by WordPress and each builder.
        (new \PixflowDesign\WordPress\Media\UnsplashMediaLibrary())->register();
        (new \PixflowDesign\WordPress\License\CentralEntitlements())->register();
        (new \PixflowDesign\WordPress\License\ProInstallation())->register();
        // Pixflow-owned: shared project library tables are versioned separately
        // from OD so future upstream updates do not control WP persistence.
        Migrations::register();
        \PixflowDesign\WordPress\Chat\HistoryStorage::register();
        \PixflowDesign\WordPress\Projects\ProjectStorage::register();
        \PixflowDesign\WordPress\Resources\ResourcePackPathService::register();
        \PixflowDesign\WordPress\Resources\RetiredResourceCleanup::register();
        $this->admin_bridge_status->register();
        $this->wp_admin_floating_panel->register();
        $this->rest_controller->register();
        $this->wp_admin_capability_rest->register();
        $this->wp_admin_gutenberg_editor_bridge->register();
        \PixflowDesign\WordPress\Admin\Gutenberg\SavedGutenbergDesignSystem::register();
        \PixflowDesign\WordPress\Fonts\WordPressFontManager::register();
        \PixflowDesign\WordPress\Assets\InstalledAssets::register();
        \PixflowDesign\WordPress\Fonts\SavedFontAssets::register();
        \PixflowDesign\WordPress\Assets\SavedBuilderStyles::register();
        \PixflowDesign\WordPress\Icons\WordPressIconLibrary::register();
        $this->media_routes->register();
        $this->provider_settings_routes->register();
        $this->resource_pack_routes->register();
    }
}
