<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Assets;

use PixflowDesign\WordPress\Bridge\BridgeConfig;
use PixflowDesign\WordPress\Onboarding\UserOnboardingProfile;
use PixflowDesign\WordPress\Providers\ProviderSettingsRepository;

if (!defined('ABSPATH')) {
    exit;
}

class AssetRegistrar
{
    /** Every independently loaded client uses Free's renderer and English data.
     * No application entry is a dependency here: native editor clients may load
     * before the admin/Workspace host without creating a circular dependency. */
    public static function shared_data_dependencies(): array
    {
        $runtime = PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-shared-runtime.js';
        $runtime_dependencies = defined('PIXFLOW_DESIGN_DISTRIBUTION') && PIXFLOW_DESIGN_DISTRIBUTION === 'directory'
            ? ['react', 'react-dom', 'wp-element'] : [];
        wp_register_script('pixflow-shared-runtime', PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-shared-runtime.js', $runtime_dependencies, AssetRevision::fingerprint([$runtime]), true);
        $path = PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-english.js';
        wp_register_script('pixflow-shared-english', PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-english.js', [], AssetRevision::fingerprint([$path]), true);
        return ['pixflow-shared-runtime', 'pixflow-shared-english'];
    }

    protected function extension_dependencies(bool $defer_optional = false): array
    {
        $handles = \PixflowDesign\WordPress\Modules\FeatureContributions::enqueue();
        foreach (\PixflowDesign\WordPress\Modules\BuilderIntegrations::all() as $integration) {
            if (isset($integration['enqueueClient'])) $handles[] = ($integration['enqueueClient'])();
        }
        // Native builders need the same authorized metadata as deferred admin
        // roots, before any dependent client can request optional capabilities.
        $shared = self::shared_data_dependencies();
        $runtime = FeatureRuntime::state($handles);
        wp_add_inline_script('pixflow-shared-runtime', 'window.__PIXFLOW_FEATURE_RUNTIME__ = ' . wp_json_encode($runtime) . ';', 'before');
        if ($defer_optional) {
            foreach (FeatureRuntime::DEFERRED_HANDLES as $handle) {
                wp_dequeue_script($handle);
                wp_dequeue_style($handle);
            }
            $handles = array_values(array_diff($handles, FeatureRuntime::DEFERRED_HANDLES));
        }
        // Workspace is registered for lazy loading, never an eager dependency
        // of either the admin panel or a native builder's editor.
        return array_values(array_unique(array_merge($shared, array_diff($handles, ['pixflow-workspace']))));
    }


    public const SCRIPT_HANDLE = 'pixflow-design-builder-shell';
    public const BUILDER_CONTEXT_SCRIPT_HANDLE = 'pixflow-design-builder-context';
    public const FLOATING_PANEL_SCRIPT_HANDLE = 'pixflow-design-floating-panel';
    public const BUILDER_BRIDGE_SCRIPT_HANDLE = 'pixflow-design-builder-bridge';
    public const BUILDER_TOOLBAR_SCRIPT_HANDLE = 'pixflow-design-builder-toolbar';
    public const BUILDER_WORKSPACE_MENU_SCRIPT_HANDLE = 'pixflow-design-builder-workspace-menu';
    public const BUILDER_TEMPLATE_LIBRARY_SCRIPT_HANDLE = 'pixflow-design-builder-template-library';
    public const APP_SCRIPT_HANDLE = 'pixflow-design-wordpress-app';
    public const APP_STYLE_HANDLE = 'pixflow-design-wordpress-app';
    public const STYLE_HANDLE = 'pixflow-design-builder-shell';
    public const WP_ADMIN_SCRIPT_HANDLE = 'pixflow-design-wp-admin-floating-panel';
    public const WP_ADMIN_STYLE_HANDLE = 'pixflow-design-wp-admin-floating-panel';

    public function __construct(protected readonly BridgeConfig $bridge_config)
    {
    }

    /**
     * Enqueue the existing Pixflow panel/runtime and the WP Admin host. The
     * Bricks panel stylesheet is shared deliberately so the Admin surface
     * cannot drift from the established floating-panel chrome.
     *
     * @param array<string, mixed> $context
     */
    public function enqueue_wp_admin_assets(array $context, array $host_options = []): void
    {
        $asset_version = $this->asset_version();
        $app_script_path = PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-design-app.js';
        $app_style_path = PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-design-app.css';
        $panel_path = PIXFLOW_DESIGN_ASSETS_DIR . 'pixflow-design-floating-panel.js';
        $admin_path = PIXFLOW_DESIGN_ASSETS_DIR . 'admin/wp-admin-floating-panel.js';
        $style_path = PIXFLOW_DESIGN_ASSETS_DIR . 'admin/wp-admin-floating-panel.css';

        wp_enqueue_style(
            self::STYLE_HANDLE,
            PIXFLOW_DESIGN_ASSETS_URL . 'pixflow-design-builder.css',
            [],
            $asset_version
        );
        wp_enqueue_style(
            self::APP_STYLE_HANDLE,
            PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-design-app.css',
            [self::STYLE_HANDLE],
            $asset_version . '.' . (file_exists($app_style_path) ? (int) filemtime($app_style_path) : 0)
        );
        wp_enqueue_style(
            self::WP_ADMIN_STYLE_HANDLE,
            PIXFLOW_DESIGN_ASSETS_URL . 'admin/wp-admin-floating-panel.css',
            [self::STYLE_HANDLE, self::APP_STYLE_HANDLE],
            $asset_version . '.' . (file_exists($style_path) ? (int) filemtime($style_path) : 0)
        );
        wp_enqueue_script(
            self::APP_SCRIPT_HANDLE,
            PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-design-app.js',
            $this->extension_dependencies(true),
            $asset_version . '.' . (file_exists($app_script_path) ? (int) filemtime($app_script_path) : 0),
            true
        );
        wp_enqueue_script(
            self::FLOATING_PANEL_SCRIPT_HANDLE,
            PIXFLOW_DESIGN_ASSETS_URL . 'pixflow-design-floating-panel.js',
            [],
            $asset_version . '.' . (file_exists($panel_path) ? (int) filemtime($panel_path) : 0),
            true
        );
        wp_enqueue_script(
            self::BUILDER_WORKSPACE_MENU_SCRIPT_HANDLE,
            PIXFLOW_DESIGN_ASSETS_URL . 'builder/workspace-menu.js',
            [],
            $asset_version,
            true
        );
        wp_enqueue_script(
            self::WP_ADMIN_SCRIPT_HANDLE,
            PIXFLOW_DESIGN_ASSETS_URL . 'admin/wp-admin-floating-panel.js',
            [self::APP_SCRIPT_HANDLE, self::FLOATING_PANEL_SCRIPT_HANDLE, self::BUILDER_WORKSPACE_MENU_SCRIPT_HANDLE],
            $asset_version . '.' . (file_exists($admin_path) ? (int) filemtime($admin_path) : 0),
            true
        );

        wp_localize_script(
            self::WP_ADMIN_SCRIPT_HANDLE,
            'pixflowDesignWpAdmin',
            array_replace($this->build_wp_admin_config($context), $host_options)
        );
    }

    /**
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    protected function build_wp_admin_config(array $context): array
    {
        $stored = get_option('pixflow_design_app_config', []);
        $stored = is_array($stored) ? $stored : [];
        $provider = (new ProviderSettingsRepository())->sanitize((new ProviderSettingsRepository())->merge_into_app_config($stored));
        $theme = in_array($stored['theme'] ?? null, ['light', 'dark', 'system'], true)
            ? (string) $stored['theme']
            : 'dark';
        $accent = sanitize_hex_color((string) ($stored['accentColor'] ?? '')) ?: '#146ef5';
        $onboarding_profile = (new UserOnboardingProfile())->get(get_current_user_id());
        $app_config = array_replace($provider, [
            'theme' => $theme,
            'accentColor' => $accent,
            'runtime' => 'wordpress',
            'runtimeMode' => 'wordpress',
            'etchIntegrationActive' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('etch'),
            'gutenbergGlobalStylesAvailable' => wp_is_block_theme(),
            'elementorIntegrationActive' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('elementor'),
            'bricksIntegrationActive' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks'),
            'onboardingCompleted' => ($onboarding_profile['completed'] ?? false) === true,
            'onboardingRoute' => ($onboarding_profile['runtimeMode'] ?? '') === 'none' ? 'none' : (($onboarding_profile['runtimeMode'] ?? '') === 'byok' ? 'byok' : 'local'),
        ]);
        $runtime = \PixflowDesign\WordPress\Modules\BuilderIntegrations::get('bricks', 'runtimeConfig');
        if ($runtime) $app_config = $runtime($app_config, null);
        else foreach (array_keys($app_config) as $key) if (str_starts_with($key, 'bricks') && $key !== 'bricksIntegrationActive') unset($app_config[$key]);
        foreach (['agentId', 'skillId', 'designSystemId', 'customInstructions'] as $key) {
            if (array_key_exists($key, $stored) && is_scalar($stored[$key])) {
                $app_config[$key] = sanitize_text_field((string) $stored[$key]);
            }
        }
        if (is_array($stored['agentModels'] ?? null)) {
            $app_config['agentModels'] = array_slice($stored['agentModels'], 0, 32, true);
        }

        return [
            'surface' => 'wp_admin',
            // Request-only launch identity; never include this in appConfig or
            // persisted settings. Native editors may normalize their URL early.
            'builderHandoff' => $this->builder_handoff_bootstrap($context),
            'workspaceAvailable' => \PixflowDesign\WordPress\Modules\WorkspaceAccess::available(),
            'runtime' => 'wordpress',
            'runtimeMode' => 'wordpress',
            'etchIntegrationActive' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('etch'),
            'gutenbergGlobalStylesAvailable' => wp_is_block_theme(),
            'elementorIntegrationActive' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('elementor'),
            'bricksIntegrationActive' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks'),
            'apiBaseUrl' => esc_url_raw(rest_url('pixflow-design/v1/od')),
            'restBaseUrl' => esc_url_raw(rest_url('pixflow-design/v1')),
            // Some local/front-controller hosts cannot rewrite custom REST
            // paths containing the literal `wp-admin` segment. The WP Admin
            // surface keeps the normal pretty base for all other requests and
            // opts into WordPress's supported `rest_route` query transport for
            // its capability/context endpoints.
            'restRouteBaseUrl' => esc_url_raw(home_url('/')),
            'ajaxUrl' => esc_url_raw(admin_url('admin-ajax.php')),
            'restNonce' => wp_create_nonce('wp_rest'),
            'bridgeBaseUrl' => esc_url_raw($this->bridge_config->base_url()),
            'bridgeRequiredVersion' => PIXFLOW_DESIGN_BRIDGE_VERSION,
            'bridge' => [
                'required' => false,
                'status' => 'optional',
                'requiredVersion' => PIXFLOW_DESIGN_BRIDGE_VERSION,
                'baseUrl' => esc_url_raw($this->bridge_config->base_url()),
                'reason' => 'The bridge is optional unless Local CLI or local files are selected.',
            ],
            'appConfig' => $app_config,
            'siteHash' => hash('sha256', untrailingslashit(home_url())),
            'siteUrl' => esc_url_raw(home_url()),
            'siteOrigin' => esc_url_raw($this->site_origin()),
            'siteLabel' => sanitize_text_field((string) get_bloginfo('name')),
            'userId' => get_current_user_id(),
            'userLocale' => get_user_locale(),
            'version' => PIXFLOW_DESIGN_VERSION,
            'iconUrl' => esc_url_raw(PIXFLOW_DESIGN_ASSETS_URL . 'brand/pixflow-icon-light.svg'),
            'quickMenuIconUrl' => esc_url_raw(PIXFLOW_DESIGN_ASSETS_URL . 'brand/pixflow-menu-light.svg'),
            'appAssetBaseUrl' => esc_url_raw(PIXFLOW_DESIGN_ASSETS_URL . 'app/'),
            'context' => $context,
            'contextUrl' => esc_url_raw(add_query_arg(
                'rest_route',
                '/pixflow-design/v1/wp-admin/context',
                home_url('/')
            )),
            'settingsProfile' => 'wp_admin',
            'panelStorageKey' => 'pixflowDesign.wpAdminAgentPanel.v1',
            'sessionStorageKey' => 'pixflowDesign.wpAdminAgentSession.v1',
        ];
    }

    /** Request-only identity from the native, server-verified editor context. */
    protected function builder_handoff_bootstrap(array $context): ?array
    {
        if (($context['screen']['verified'] ?? false) !== true
            || ($context['object']['verified'] ?? false) !== true
            || ($context['object']['kind'] ?? '') !== 'post'
            || ($context['object']['type'] ?? '') !== 'page') return null;
        $builder = $context['editor'] ?? '';
        if (in_array($builder, ['etch', 'elementor'], true)) {
            // These contexts are supplied by each native editor's enqueue hook,
            // not inferred from an attacker-controlled query or an admin hint.
            $base = $context['screen']['base'] ?? '';
            $native_screen = $base === $builder
                || ($builder === 'elementor' && $base === 'post' && ($_GET['action'] ?? null) === 'elementor');
            if (($context['screen']['isBuilder'] ?? false) !== true
                || !$native_screen
                || !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active($builder)) return null;
        } else {
            if (($context['screen']['base'] ?? '') !== 'post' || ($_GET['action'] ?? null) !== 'edit') return null;
            $builder = 'gutenberg';
        }
        return (new \PixflowDesign\WordPress\Pages\BuilderHandoffs())->bootstrap_identity($_GET, $builder, (int) ($context['object']['id'] ?? 0));
    }

    /**
     * @return array<string, mixed>
     */
    protected function bridge_capability_payload(): array
    {
        return [
            'required' => false,
            'status' => 'optional',
            'available' => null,
            'version' => null,
            'requiredVersion' => PIXFLOW_DESIGN_BRIDGE_VERSION,
            'baseUrl' => esc_url_raw($this->bridge_config->base_url()),
            'manifestUrl' => esc_url_raw('https://pixflow.dev/downloads/pixflow-design-bridge/latest.json'),
            'installers' => [
                'windows' => esc_url_raw('https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-win-x64-setup.exe'),
                'macos' => esc_url_raw('https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-mac-arm64.dmg'),
                'macosArm64' => esc_url_raw('https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-mac-arm64.dmg'),
                'linux' => esc_url_raw('https://pixflow.dev/downloads/pixflow-design-bridge/install.sh'),
            ],
            'requiredFor' => ['localCli', 'localFiles', 'prototypeGeneration'],
            'browserPermissions' => [
                'chromePrompt' => 'Chrome may ask this site to access apps on your device. Allow Apps on device when using Local CLI features.',
                'chromeDenied' => 'Chrome is blocking Pixflow Design Bridge access for this site. In Chrome site settings, allow Apps on device, then rescan.',
                'fallback' => 'The bridge is optional unless you use Local CLI or local files.',
            ],
            'reason' => 'The bridge is optional and only required for Local CLI or local filesystem access.',
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function runtime_capability_payload(): array
    {
        return (new \PixflowDesign\WordPress\Od\RuntimeCapabilityService())->capabilities();
    }

    protected function site_origin(): string
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

    protected function asset_version(): string
    {
        $paths = [
            PIXFLOW_DESIGN_ASSETS_DIR . 'pixflow-design-builder.css',
            PIXFLOW_DESIGN_ASSETS_DIR . 'pixflow-design-floating-panel.js',
            PIXFLOW_DESIGN_ASSETS_DIR . 'builder/workspace-menu.js',
            PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-design-app.css',
            PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-design-app.js',
            PIXFLOW_DESIGN_ASSETS_DIR . 'pixflow-design-floating-panel.js',
            PIXFLOW_DESIGN_ASSETS_DIR . 'admin/wp-admin-floating-panel.js',
            PIXFLOW_DESIGN_ASSETS_DIR . 'admin/wp-admin-floating-panel.css',
            PIXFLOW_DESIGN_ASSETS_DIR . 'pixflow-library.svg',
            PIXFLOW_DESIGN_ASSETS_DIR . 'brand/pixflow-icon-light.svg',
        ];

        return PIXFLOW_DESIGN_VERSION . '.' . AssetRevision::fingerprint($paths);
    }
}
