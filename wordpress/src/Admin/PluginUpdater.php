<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

use PixflowDesign\WordPress\License\LicenseCache;
use PixflowDesign\WordPress\License\SiteIdentity;

if (!defined('ABSPATH')) {
    exit;
}

final class PluginUpdater
{
    /** One updater per installed plugin, regardless of activation/load order. */
    private static array $registered = [];
    private const CHECK_CACHE_KEY = 'pixflow_design_update_check';
    private const INFO_CACHE_KEY = 'pixflow_design_update_info';
    private const CACHE_TTL = 14400;
    private const CHECK_FAIL_TTL = 300;
    private const INFO_FAIL_TTL = 900;
    private const FAILURE_RETRY_AGE = 60;
    private const LAST_ERROR_TRANSIENT = 'pixflow_design_plugin_update_last_error';
    private const LAST_ERROR_TTL = 86400;
    private const SITE_LICENSE_CACHE_OPTION = 'pixflow_design_site_license_cache';
    private const LEGACY_SITE_LICENSE_CACHE_OPTION = 'pixflow_ai_site_license_cache';
    private const AUTO_UPDATE_SEEDED_OPTION = 'pixflow_design_auto_update_seeded';
    private const INSTALL_FINGERPRINT_OPTION = 'pixflow_design_install_fingerprint';

    private string $artifact_slug;
    private string $plugin_file;
    private string $plugin_basename;
    private string $plugin_slug;
    private string $current_version;
    private string $check_url;
    private string $info_url;

    public function __construct(string $plugin_file, string $current_version, string $artifact_slug = 'pixflow-design')
    {
        if (!in_array($artifact_slug, ['pixflow-design', 'pixflow-design-pro'], true)) throw new \InvalidArgumentException('Unknown Pixflow plugin');
        $this->artifact_slug = $artifact_slug;
        $this->plugin_file = $plugin_file;
        $this->plugin_basename = plugin_basename($plugin_file);
        // Pixflow-owned: keep the update/product slug compatible with the old
        // Pixflow AI SureCart updater so existing customers receive updates.
        $this->plugin_slug = $artifact_slug === 'pixflow-design-pro' ? 'pixflow-design-pro' : 'pixflow-ai';
        $this->current_version = $current_version;
        $this->check_url = self::plugin_update_url();
        $this->info_url = self::plugin_update_info_url();
    }

    public function register(): void
    {
        if (isset(self::$registered[$this->plugin_basename])) return;
        self::$registered[$this->plugin_basename] = true;
        add_filter('upgrader_pre_download', [$this, 'central_pre_download'], 10, 4);
        add_filter('pre_set_site_transient_update_plugins', [$this, 'check_update']);
        add_filter('plugins_api', [$this, 'plugin_info'], 10, 3);
        add_filter('auto_update_plugin', [$this, 'allow_auto_update_when_enabled'], 10, 2);
        add_filter('upgrader_source_selection', [$this, 'fix_source_dir'], 10, 4);
        add_filter('upgrader_post_install', [$this, 'after_install'], 10, 3);
        add_action('admin_init', [$this, 'seed_default_auto_update_setting']);
        add_action('add_option_' . self::SITE_LICENSE_CACHE_OPTION, [$this, 'flush_cached_update_state']);
        add_action('update_option_' . self::SITE_LICENSE_CACHE_OPTION, [$this, 'flush_cached_update_state'], 10, 3);
        add_action('delete_option_' . self::SITE_LICENSE_CACHE_OPTION, [$this, 'flush_cached_update_state']);
        add_action('add_option_' . self::LEGACY_SITE_LICENSE_CACHE_OPTION, [$this, 'flush_cached_update_state']);
        add_action('update_option_' . self::LEGACY_SITE_LICENSE_CACHE_OPTION, [$this, 'flush_cached_update_state'], 10, 3);
        add_action('delete_option_' . self::LEGACY_SITE_LICENSE_CACHE_OPTION, [$this, 'flush_cached_update_state']);
        // Free discovers an inactive add-on without executing any Pro code.
        // Native update checks read its installed header when needed.
        $pro_file = WP_PLUGIN_DIR . '/pixflow-design-pro/pixflow-design-pro.php';
        if ($this->artifact_slug === 'pixflow-design' && is_readable($pro_file)) {
            self::for_pro($pro_file, '0.0.0')->register();
        }
    }

    /** Shared transport, separate product identity and cache ownership. */
    public static function for_pro(string $plugin_file, string $current_version): self
    {
        return new self($plugin_file, $current_version, 'pixflow-design-pro');
    }

    public function check_update($transient)
    {
        try {
            if (!is_object($transient)) {
                $transient = new \stdClass();
            }

            $current = $this->get_installed_version();
            $default = $this->build_no_update_object($current);

            if (!isset($transient->no_update) || !is_array($transient->no_update)) {
                $transient->no_update = [];
            }

            if (!isset($transient->response) || !is_array($transient->response)) {
                $transient->response = [];
            }

            // Each check replaces only our entry; revoked/stale packages must not survive a refresh.
            unset($transient->response[$this->plugin_basename], $transient->no_update[$this->plugin_basename]);

            if (empty($transient->checked)) {
                $transient->no_update[$this->plugin_basename] = $default;
                return $transient;
            }

            $payload = $this->build_remote_payload($current);
            $remote = $this->fetch_remote_payload($this->cache_key(self::CHECK_CACHE_KEY), $this->check_url, $payload);

            if (is_array($remote) && !empty($remote['update_available']) && is_array($remote['update'] ?? null)) {
                $transient->response[$this->plugin_basename] = $this->normalize_plugin_object($remote['update'], $current);
                return $transient;
            }

            if (is_array($remote) && is_array($remote['no_update'] ?? null)) {
                $transient->no_update[$this->plugin_basename] = $this->normalize_plugin_object($remote['no_update'], $current, true);
                return $transient;
            }

            $transient->no_update[$this->plugin_basename] = $default;
        } catch (\Throwable $e) {
            $this->record_update_error('check_update_exception', $e);
        }

        return $transient;
    }

    public function plugin_info($result, $action, $args)
    {
        try {
            if ($action !== 'plugin_information') {
                return $result;
            }

            if (!isset($args->slug) || (string) $args->slug !== $this->plugin_slug) {
                return $result;
            }

            $payload = $this->build_remote_payload($this->get_installed_version());
            $remote = $this->fetch_remote_payload($this->cache_key(self::INFO_CACHE_KEY), $this->info_url, $payload);
            if (!is_array($remote)) {
                return $result;
            }

            return (object) [
                'name' => (string) ($remote['name'] ?? 'Pixflow Design'),
                'slug' => $this->plugin_slug,
                'version' => (string) ($remote['version'] ?? $this->get_installed_version()),
                'author' => (string) ($remote['author'] ?? '<a href="https://pixflow.dev">Pixflow</a>'),
                'homepage' => (string) ($remote['homepage'] ?? 'https://pixflow.dev'),
                'requires' => (string) ($remote['requires'] ?? ''),
                'tested' => (string) ($remote['tested'] ?? ''),
                'requires_php' => (string) ($remote['requires_php'] ?? ''),
                'download_link' => (string) ($remote['download_link'] ?? ''),
                'sections' => is_array($remote['sections'] ?? null) ? $remote['sections'] : [],
                'banners' => is_array($remote['banners'] ?? null) ? $remote['banners'] : [],
                'icons' => $this->plugin_icons($remote['icons'] ?? null),
            ];
        } catch (\Throwable $e) {
            $this->record_update_error('plugin_info_exception', $e);
            return $result;
        }
    }

    public function seed_default_auto_update_setting(): void
    {
        // Existing core preference stays compatible; new Pro installs use WordPress's opt-in.
        if ($this->artifact_slug === 'pixflow-design-pro') return;
        try {
            if (get_site_option(self::AUTO_UPDATE_SEEDED_OPTION)) {
                return;
            }

            $enabled_plugins = get_site_option('auto_update_plugins', []);
            if (!is_array($enabled_plugins)) {
                $enabled_plugins = [];
            }

            if (!in_array($this->plugin_basename, $enabled_plugins, true)) {
                $enabled_plugins[] = $this->plugin_basename;
                update_site_option('auto_update_plugins', array_values(array_unique($enabled_plugins)));
            }

            update_site_option(self::AUTO_UPDATE_SEEDED_OPTION, time());
        } catch (\Throwable $e) {
            $this->record_update_error('seed_auto_update_exception', $e);
        }
    }

    public function allow_auto_update_when_enabled($update, $item)
    {
        try {
            $plugin = is_object($item) && isset($item->plugin) ? (string) $item->plugin : '';
            if ($plugin !== $this->plugin_basename) {
                return $update;
            }

            $enabled_plugins = get_site_option('auto_update_plugins', []);
            if (!is_array($enabled_plugins)) {
                return $update;
            }

            return in_array($this->plugin_basename, $enabled_plugins, true) ? true : $update;
        } catch (\Throwable $e) {
            $this->record_update_error('allow_auto_update_exception', $e);
            return $update;
        }
    }

    public function fix_source_dir($source, $remote_source, $upgrader, $hook_extra)
    {
        unset($upgrader);
        if (is_wp_error($source)) {
            return $source;
        }

        try {
            if (!isset($hook_extra['plugin']) || $hook_extra['plugin'] !== $this->plugin_basename) {
                return $source;
            }

            global $wp_filesystem;
            if (!$wp_filesystem) {
                return $source;
            }

            $expected_dir = trailingslashit($remote_source) . $this->get_expected_directory_name() . '/';
            if (trailingslashit((string) $source) !== $expected_dir) {
                if (!$wp_filesystem->move(trailingslashit((string) $source), $expected_dir)) {
                    return new \WP_Error('pixflow_update_source_move_failed', 'Could not prepare the Pixflow Design update directory.');
                }
                return $expected_dir;
            }
        } catch (\Throwable $e) {
            $this->record_update_error('fix_source_dir_exception', $e);
        }

        return $source;
    }

    public function after_install($response, $hook_extra, $result)
    {
        try {
            if (is_wp_error($response) || !isset($hook_extra['plugin']) || $hook_extra['plugin'] !== $this->plugin_basename) {
                return $response;
            }
            // WordPress owns activation state and rollback. Source naming is handled before install.
            remove_filter('pre_set_site_transient_update_plugins', [$this, 'check_update']);
            delete_transient($this->cache_key(self::CHECK_CACHE_KEY));
            delete_transient($this->cache_key(self::INFO_CACHE_KEY));
            delete_site_transient('update_plugins');
        } catch (\Throwable $e) {
            $this->record_update_error('after_install_exception', $e);
        }

        return $response;
    }

    public static function get_last_update_check_error(): array
    {
        $error = get_site_transient(self::LAST_ERROR_TRANSIENT);
        return is_array($error) ? $error : [];
    }

    public function flush_cached_update_state(...$args): void
    {
        unset($args);

        delete_transient($this->cache_key(self::CHECK_CACHE_KEY));
        delete_transient($this->cache_key(self::INFO_CACHE_KEY));
        delete_site_transient('update_plugins');
    }

    public static function plugin_update_url(): string
    {
        if (defined('PFAI_PLUGIN_UPDATE_URL') && is_string(PFAI_PLUGIN_UPDATE_URL)) {
            return self::normalize_allowed_remote_url(PFAI_PLUGIN_UPDATE_URL);
        }

        return \PixflowDesign\WordPress\License\CentralEntitlements::delivery_origin() . '/api/licensing/v2/artifacts';
    }

    public static function plugin_update_info_url(): string
    {
        if (defined('PFAI_PLUGIN_UPDATE_INFO_URL') && is_string(PFAI_PLUGIN_UPDATE_INFO_URL)) {
            return self::normalize_allowed_remote_url(PFAI_PLUGIN_UPDATE_INFO_URL);
        }

        return \PixflowDesign\WordPress\License\CentralEntitlements::delivery_origin() . '/api/licensing/v2/artifacts';
    }

    private function fetch_remote_payload(string $cache_key, string $url, array $payload): ?array
    {
        if ($this->central_enabled()) return $this->central_update_payload($payload);
        if ($url === '') {
            return null;
        }

        $payload_hash = md5((string) wp_json_encode($payload));
        $force = isset($_GET['force-check']) && sanitize_text_field(wp_unslash((string) $_GET['force-check'])) === '1';
        if (!$force) {
            $cached = get_transient($cache_key);
            if (is_array($cached) && (($cached['payload_hash'] ?? '') === $payload_hash)) {
                if (!empty($cached['empty'])) {
                    if (!$this->should_retry_failed_cache($cache_key, $cached)) {
                        return null;
                    }
                } elseif (is_array($cached['body'] ?? null)) {
                    return $cached['body'];
                }
            }
        }

        $normalized_url = self::normalize_allowed_remote_url($url);
        if ($normalized_url === '') {
            $this->cache_failed_payload($cache_key, $payload_hash);
            $this->record_update_error('invalid_update_endpoint', 'The configured Pixflow update endpoint is empty or not trusted.');
            return null;
        }

        $response = wp_safe_remote_post($normalized_url, [
            'timeout' => 5,
            'headers' => [
                'Accept' => 'application/json',
                'Content-Type' => 'application/json; charset=utf-8',
                'User-Agent' => 'PixflowDesign/' . $this->current_version,
            ],
            'body' => wp_json_encode($payload),
        ]);

        if (is_wp_error($response)) {
            $this->cache_failed_payload($cache_key, $payload_hash);
            $this->record_update_error('update_endpoint_request_failed', $response->get_error_message());
            return null;
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        if ($code !== 200) {
            $this->cache_failed_payload($cache_key, $payload_hash);
            $this->record_update_error('update_endpoint_http_error', 'Update endpoint returned HTTP ' . $code . '.');
            return null;
        }

        $decoded = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($decoded)) {
            $this->cache_failed_payload($cache_key, $payload_hash);
            $this->record_update_error('update_endpoint_invalid_json', 'Update endpoint returned malformed JSON.');
            return null;
        }

        delete_site_transient($this->cache_key(self::LAST_ERROR_TRANSIENT));
        set_transient($cache_key, [
            'payload_hash' => $payload_hash,
            'body' => $decoded,
            'cached_at' => time(),
        ], self::CACHE_TTL);
        return $decoded;
    }

    private function central_enabled(): bool
    {
        return \PixflowDesign\WordPress\License\CentralEntitlements::enabled();
    }

    private function current_artifact(): array|\WP_Error
    {
        if ($this->artifact_slug === 'pixflow-design') {
            $free = (new \PixflowDesign\WordPress\License\FreeArtifacts())->current();
            if (!is_wp_error($free)) return $free;
        }
        return (new \PixflowDesign\WordPress\License\CentralArtifacts())->current('plugin', $this->artifact_slug);
    }

    private function central_package_url(): string
    {
        $artifact = $this->current_artifact();
        return is_wp_error($artifact) ? '' : $this->artifact_package_url($artifact);
    }

    /** An edition identifies product contents; only public discovery supplies a public URL. */
    private function artifact_package_url(array $artifact): string
    {
        $origin = \PixflowDesign\WordPress\License\CentralEntitlements::delivery_origin();
        $id = (string) ($artifact['artifact_id'] ?? '');
        if ($id === '') return '';
        $public = $origin . '/api/plugins/v1/free/download/' . rawurlencode($id);
        if ($this->artifact_slug === 'pixflow-design' && ($artifact['edition'] ?? '') === 'free'
            && ($artifact['download_url'] ?? '') === $public) return $public;
        return $origin . '/api/licensing/v2/download?artifact=' . rawurlencode($id);
    }

    private function central_update_payload(array $payload): ?array
    {
        $artifact = $this->current_artifact();
        if (!is_wp_error($artifact)) {
            $version = (string) ($artifact['version'] ?? '');
            $package = $this->artifact_package_url($artifact);
            $update = ['name' => (string) ($artifact['name'] ?? 'Pixflow Design'), 'slug' => $this->plugin_slug,
                'version' => $version, 'new_version' => $version, 'package' => $package,
                'download_link' => $package];
            foreach (['requires', 'tested', 'requires_php', 'homepage', 'author'] as $key) {
                if (is_string($artifact[$key] ?? null)) $update[$key] = $artifact[$key];
            }
            foreach (['sections', 'icons', 'banners'] as $key) {
                if (is_array($artifact[$key] ?? null)) $update[$key] = $artifact[$key];
            }
            return array_merge($update, ['update_available' => version_compare($version, (string) ($payload['installed_version'] ?? ''), '>'),
                'update' => $update, 'no_update' => $update]);
        }
        return null;
    }

    public function central_pre_download($reply, string $package, $upgrader, array $hook_extra)
    {
        if ($reply !== false) return $reply;
        if (!$this->central_enabled()) return $reply;
        if (!empty($hook_extra['plugin']) && $hook_extra['plugin'] !== $this->plugin_basename) return $reply;
        $expected = $this->central_package_url();
        $ours = ($hook_extra['plugin'] ?? '') === $this->plugin_basename
            || in_array($this->plugin_basename, (array) ($hook_extra['plugins'] ?? []), true);
        if ($package !== $expected || $expected === '') {
            // Bulk upgrades invoke every updater filter for each plugin. Leave the
            // sibling's exact current package to its own verifier.
            if ($ours && empty($hook_extra['plugin'])) {
                if ($this->artifact_slug === 'pixflow-design-pro') {
                    $free = (new \PixflowDesign\WordPress\License\FreeArtifacts())->current();
                    if (!is_wp_error($free) && $package === $free['download_url']) return $reply;
                }
                $sibling_slug = $this->artifact_slug === 'pixflow-design' ? 'pixflow-design-pro' : 'pixflow-design';
                $sibling = (new \PixflowDesign\WordPress\License\CentralArtifacts())->current('plugin', $sibling_slug);
                if (!is_wp_error($sibling)) {
                    $sibling_url = \PixflowDesign\WordPress\License\CentralEntitlements::delivery_origin() . '/api/licensing/v2/download?artifact=' . rawurlencode($sibling['artifact_id']);
                    if ($package === $sibling_url) return $reply;
                }
            }
            return $ours ? new \WP_Error('central_package_required', 'Refresh Pixflow update metadata before downloading this protected package.') : $reply;
        }
        if ($this->artifact_slug === 'pixflow-design' && str_starts_with($expected, \PixflowDesign\WordPress\License\CentralEntitlements::delivery_origin() . '/api/plugins/v1/free/download/')) {
            return (new \PixflowDesign\WordPress\License\FreeArtifacts())->download($package);
        }
        parse_str((string) wp_parse_url($expected, PHP_URL_QUERY), $query);
        return (new \PixflowDesign\WordPress\License\CentralArtifacts())->download((string) ($query['artifact'] ?? ''), 'plugin');
    }

    private function build_remote_payload(string $installed_version): array
    {
        $site_identity = new SiteIdentity();
        $identity = $site_identity->current_payload();
        $private_license = (new LicenseCache())->private_payload();

        return [
            'product' => SiteIdentity::PRODUCT_SLUG,
            'plugin_slug' => $this->plugin_slug,
            'plugin_basename' => $this->plugin_basename,
            'installed_version' => $installed_version,
            'license_key' => (string) ($private_license['license_key'] ?? ''),
            'license_id' => (string) ($private_license['license_id'] ?? ''),
            'purchase_id' => (string) ($private_license['purchase_id'] ?? ''),
            'site_url' => (string) ($identity['site_url'] ?? ''),
            'home_url' => (string) ($identity['home_url'] ?? ''),
            'site_host' => (string) ($identity['site_host'] ?? ''),
            'install_fingerprint' => $this->install_fingerprint(),
            'wordpress_version' => (string) get_bloginfo('version'),
            'php_version' => PHP_VERSION,
        ];
    }

    private function normalize_plugin_object(array $remote, string $current_version, bool $is_no_update = false): object
    {
        return (object) [
            'id' => (string) ($remote['id'] ?? 'https://pixflow.dev#' . $this->plugin_slug),
            'slug' => $this->plugin_slug,
            'plugin' => $this->plugin_basename,
            'new_version' => (string) ($remote['new_version'] ?? $current_version),
            'url' => (string) ($remote['url'] ?? 'https://pixflow.dev'),
            'package' => $is_no_update ? '' : (string) ($remote['package'] ?? ''),
            'requires' => (string) ($remote['requires'] ?? ''),
            'tested' => (string) ($remote['tested'] ?? ''),
            'requires_php' => (string) ($remote['requires_php'] ?? ''),
            'icons' => $this->plugin_icons($remote['icons'] ?? null),
            'banners' => is_array($remote['banners'] ?? null) ? $remote['banners'] : [],
        ];
    }

    private function build_no_update_object(string $current_version): object
    {
        return (object) [
            'id' => 'https://pixflow.dev#' . $this->plugin_slug,
            'slug' => $this->plugin_slug,
            'plugin' => $this->plugin_basename,
            'new_version' => $current_version,
            'url' => 'https://pixflow.dev',
            'package' => '',
            'requires' => '',
            'tested' => '',
            'requires_php' => '',
            'icons' => $this->plugin_icons(),
            'banners' => [],
        ];
    }

    /** Native WordPress branding remains available even when discovery is offline. */
    private function plugin_icons(mixed $remote = null): array
    {
        $icons = [];
        foreach (['svg', '1x', '2x', 'default'] as $size) {
            $url = is_array($remote) ? ($remote[$size] ?? null) : null;
            if (is_string($url) && filter_var($url, FILTER_VALIDATE_URL)
                && in_array(strtolower((string) parse_url($url, PHP_URL_SCHEME)), ['http', 'https'], true)) {
                $icons[$size] = $url;
            }
        }
        return $icons ?: ['svg' => plugins_url('assets/brand/pixflow-plugin-icon.svg', $this->plugin_file)];
    }

    private function get_installed_version(): string
    {
        $file = WP_PLUGIN_DIR . '/' . $this->plugin_basename;
        if (!file_exists($file)) {
            return $this->current_version;
        }

        if (!function_exists('get_plugin_data')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        if (!function_exists('get_plugin_data')) {
            return $this->current_version;
        }

        $data = get_plugin_data($file, false, false);
        return !empty($data['Version']) ? (string) $data['Version'] : $this->current_version;
    }

    private function get_expected_directory_name(): string
    {
        $directory = dirname($this->plugin_basename);
        return $directory !== '.' ? $directory : $this->plugin_slug;
    }

    private function install_fingerprint(): string
    {
        $fingerprint = (string) get_option(self::INSTALL_FINGERPRINT_OPTION, '');
        if ($fingerprint !== '') {
            return $fingerprint;
        }

        $fingerprint = wp_generate_uuid4();
        update_option(self::INSTALL_FINGERPRINT_OPTION, $fingerprint, false);
        return $fingerprint;
    }

    private function cache_failed_payload(string $cache_key, string $payload_hash): void
    {
        set_transient($cache_key, [
            'payload_hash' => $payload_hash,
            'empty' => true,
            'cached_at' => time(),
        ], $this->get_failure_ttl($cache_key));
    }

    private function cache_key(string $key): string
    {
        return $this->artifact_slug === 'pixflow-design-pro' ? $key . '_pro' : $key;
    }

    private function record_update_error(string $context, $error): void
    {
        $message = $error instanceof \Throwable ? $error->getMessage() : (string) $error;
        $message = trim(wp_strip_all_tags($message));
        if ($message === '') {
            $message = 'Unknown plugin update failure.';
        }

        $payload = [
            'context' => sanitize_key($context),
            'message' => sanitize_text_field($message),
            'recorded_at' => time(),
        ];

        set_site_transient($this->cache_key(self::LAST_ERROR_TRANSIENT), $payload, self::LAST_ERROR_TTL);

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('[pixflow-design][plugin-updater] ' . $payload['context'] . ': ' . $payload['message']);
        }
    }

    private function get_failure_ttl(string $cache_key): int
    {
        return $cache_key === $this->cache_key(self::CHECK_CACHE_KEY)
            ? self::CHECK_FAIL_TTL
            : self::INFO_FAIL_TTL;
    }

    private function should_retry_failed_cache(string $cache_key, array $cached): bool
    {
        if ($cache_key !== $this->cache_key(self::CHECK_CACHE_KEY)) {
            return false;
        }

        $cached_at = isset($cached['cached_at']) ? (int) $cached['cached_at'] : 0;
        if ($cached_at <= 0 || (time() - $cached_at) < self::FAILURE_RETRY_AGE) {
            return false;
        }

        if (wp_doing_cron()) {
            return true;
        }

        return $this->is_native_update_request();
    }

    private function is_native_update_request(): bool
    {
        if (!is_admin()) {
            return false;
        }

        $page = isset($_SERVER['PHP_SELF'])
            ? wp_basename(sanitize_text_field(wp_unslash((string) $_SERVER['PHP_SELF'])))
            : '';

        if (in_array($page, ['plugins.php', 'update-core.php', 'update.php', 'plugins-network.php'], true)) {
            return true;
        }

        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if (!$screen || !isset($screen->base)) {
            return false;
        }

        return in_array((string) $screen->base, ['plugins', 'plugins-network', 'update-core'], true);
    }

    private static function normalize_allowed_remote_url(string $url, bool $allow_origin_only = false): string
    {
        $normalized = untrailingslashit(esc_url_raw(trim($url)));
        if ($normalized === '') {
            return '';
        }

        $parts = wp_parse_url($normalized);
        if (!is_array($parts)) {
            return '';
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower(trim((string) ($parts['host'] ?? '')));
        $path = (string) ($parts['path'] ?? '');

        if (!empty($parts['user']) || !empty($parts['pass']) || isset($parts['fragment'])) {
            return '';
        }

        if ($scheme !== 'https' || ($host !== 'pixflow.dev' && !str_ends_with($host, '.pixflow.dev'))) {
            return '';
        }

        if (!$allow_origin_only && trim($path) === '') {
            return '';
        }

        return $normalized;
    }
}
