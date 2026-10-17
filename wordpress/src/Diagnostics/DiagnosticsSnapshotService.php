<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Diagnostics;

use PixflowDesign\WordPress\Onboarding\UserOnboardingProfile;
use PixflowDesign\WordPress\Providers\ProviderSettingsRepository;
use PixflowDesign\WordPress\Resources\ResourcePackRepository;

if (!defined('ABSPATH')) {
    exit;
}

/** Produces a bounded, secret-free WordPress support snapshot. */
final class DiagnosticsSnapshotService
{
    private const MAX_ROWS = 50;
    private const MAX_ERROR_LINES = 200;
    private const ERROR_LOG_TAIL_BYTES = 524288;

    public function __construct(
        private readonly ProviderSettingsRepository $providers = new ProviderSettingsRepository(),
        private readonly UserOnboardingProfile $onboarding = new UserOnboardingProfile(),
        private readonly ResourcePackRepository $resource_packs = new ResourcePackRepository(),
    ) {
    }

    /** @return array<string, mixed> */
    public function snapshot(): array
    {
        $user_id = get_current_user_id();
        $theme = wp_get_theme();
        $parent = $theme->parent();
        return [
            'schema' => 'pixflow.wordpress-diagnostics.v1',
            'generatedAt' => gmdate('c'),
            'wordpress' => [
                'version' => get_bloginfo('version'),
                'multisite' => is_multisite(),
                'locale' => get_locale(),
                'timezone' => wp_timezone_string(),
                'permalinkStructure' => (string) get_option('permalink_structure', ''),
                'restUrl' => esc_url_raw(rest_url('pixflow-design/v1/')),
                'homeScheme' => (string) wp_parse_url(home_url('/'), PHP_URL_SCHEME),
                'debug' => [
                    'wpDebug' => defined('WP_DEBUG') && WP_DEBUG,
                    'wpDebugLog' => defined('WP_DEBUG_LOG') && (bool) WP_DEBUG_LOG,
                    'wpDebugDisplay' => defined('WP_DEBUG_DISPLAY') && WP_DEBUG_DISPLAY,
                    'scriptDebug' => defined('SCRIPT_DEBUG') && SCRIPT_DEBUG,
                ],
            ],
            'runtime' => [
                'phpVersion' => PHP_VERSION,
                'phpSapi' => PHP_SAPI,
                'memoryLimit' => (string) ini_get('memory_limit'),
                'maxExecutionTime' => (int) ini_get('max_execution_time'),
                'serverSoftware' => sanitize_text_field((string) ($_SERVER['SERVER_SOFTWARE'] ?? 'unknown')),
            ],
            'pixflow' => [
                'pluginVersion' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : 'unknown',
                'requiredBridgeVersion' => defined('PIXFLOW_DESIGN_BRIDGE_VERSION') ? PIXFLOW_DESIGN_BRIDGE_VERSION : 'unknown',
                'provider' => $this->provider_summary($this->providers->get($user_id)),
                'onboarding' => $this->onboarding_summary($this->onboarding->get($user_id)),
                'resourcePacks' => $this->resource_pack_summary($this->resource_packs->installed()),
            ],
            'theme' => [
                'stylesheet' => $theme->get_stylesheet(),
                'name' => $theme->get('Name'),
                'version' => $theme->get('Version'),
                'parentStylesheet' => $parent ? $parent->get_stylesheet() : null,
                'parentVersion' => $parent ? $parent->get('Version') : null,
            ],
            'plugins' => $this->plugin_inventory(),
            'filesystem' => $this->filesystem_summary(),
            'permissions' => [
                'editPosts' => current_user_can('edit_posts'),
                'uploadFiles' => current_user_can('upload_files'),
                'manageOptions' => current_user_can('manage_options'),
                'installPlugins' => current_user_can('install_plugins'),
                'editThemeOptions' => current_user_can('edit_theme_options'),
            ],
            'operations' => $this->operation_summary(),
            'errors' => $this->pixflow_error_tail(),
            'privacy' => [
                'postContentIncluded' => false,
                'promptsIncluded' => false,
                'credentialsIncluded' => false,
                'mediaIncluded' => false,
            ],
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function plugin_inventory(): array
    {
        if (!function_exists('get_plugins')) require_once ABSPATH . 'wp-admin/includes/plugin.php';
        $active = array_flip((array) get_option('active_plugins', []));
        $network = is_multisite() ? (array) get_site_option('active_sitewide_plugins', []) : [];
        $plugins = [];
        foreach (get_plugins() as $file => $data) {
            $plugins[] = [
                'file' => sanitize_text_field((string) $file),
                'name' => sanitize_text_field((string) ($data['Name'] ?? '')),
                'version' => sanitize_text_field((string) ($data['Version'] ?? '')),
                'status' => isset($network[$file]) ? 'network-active' : (isset($active[$file]) ? 'active' : 'inactive'),
            ];
        }
        usort($plugins, static fn(array $a, array $b): int => strcmp((string) $a['file'], (string) $b['file']));
        return $plugins;
    }

    /** @return array<string, mixed> */
    private function provider_summary(array $settings): array
    {
        $agent_id = sanitize_key((string) ($settings['agentId'] ?? ''));
        $choice = is_array($settings['agentModels'][$agent_id] ?? null) ? $settings['agentModels'][$agent_id] : [];
        return [
            'mode' => sanitize_key((string) ($settings['mode'] ?? '')),
            'agentId' => $agent_id,
            'model' => sanitize_text_field((string) ($choice['model'] ?? $settings['model'] ?? '')),
            'reasoning' => sanitize_key((string) ($choice['reasoning'] ?? '')),
            'fastMode' => (bool) ($choice['fastMode'] ?? false),
            'apiProtocol' => sanitize_key((string) ($settings['apiProtocol'] ?? '')),
        ];
    }

    /** @return array<string, mixed> */
    private function onboarding_summary(array $profile): array
    {
        return [
            'completed' => (bool) ($profile['completed'] ?? false),
            'runtimeMode' => sanitize_key((string) ($profile['runtimeMode'] ?? '')),
            'updatedAt' => sanitize_text_field((string) ($profile['updatedAt'] ?? '')),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function resource_pack_summary(array $records): array
    {
        $result = [];
        foreach ($records as $slug => $record) {
            if (!is_array($record)) continue;
            $result[] = [
                'slug' => sanitize_key((string) $slug),
                'version' => sanitize_text_field((string) ($record['version'] ?? '')),
                'revision' => sanitize_text_field((string) ($record['revision'] ?? '')),
                'status' => sanitize_key((string) ($record['status'] ?? 'unknown')),
            ];
        }
        return $result;
    }

    /** @return array<string, mixed> */
    private function filesystem_summary(): array
    {
        $uploads = wp_upload_dir(null, false);
        $paths = [
            'content' => defined('WP_CONTENT_DIR') ? WP_CONTENT_DIR : '',
            'plugins' => defined('WP_PLUGIN_DIR') ? WP_PLUGIN_DIR : '',
            'uploads' => (string) ($uploads['basedir'] ?? ''),
        ];
        $result = [];
        foreach ($paths as $name => $path) {
            $result[$name] = ['exists' => $path !== '' && is_dir($path), 'writable' => $path !== '' && is_writable($path)];
        }
        $free = @disk_free_space(defined('WP_CONTENT_DIR') ? WP_CONTENT_DIR : ABSPATH);
        $result['freeBytes'] = is_float($free) ? (int) $free : null;
        return $result;
    }

    /** @return array<string, mixed> */
    private function operation_summary(): array
    {
        $operations = get_option('pixflow_design_wp_admin_operations_v1', []);
        $audit = get_option('pixflow_design_wp_admin_audit_v1', []);
        $safe_operations = [];
        foreach (array_slice(is_array($operations) ? array_values($operations) : [], -self::MAX_ROWS) as $operation) {
            if (is_array($operation)) $safe_operations[] = $this->pick($operation, ['operationId', 'capabilityId', 'handler', 'status', 'error', 'createdAt', 'updatedAt']);
        }
        $safe_audit = [];
        foreach (array_slice(is_array($audit) ? array_values($audit) : [], -self::MAX_ROWS) as $event) {
            if (is_array($event)) $safe_audit[] = $this->pick($event, ['event', 'capabilityId', 'risk', 'operationId', 'reason', 'createdAt', 'timestamp']);
        }
        return ['recent' => $safe_operations, 'audit' => $safe_audit];
    }

    /** @return array<int, string> */
    private function pixflow_error_tail(): array
    {
        $path = $this->error_log_path();
        if ($path === '' || !is_readable($path)) return [];
        $size = filesize($path);
        if (!is_int($size) || $size <= 0) return [];
        $handle = @fopen($path, 'rb');
        if (!is_resource($handle)) return [];
        try {
            fseek($handle, max(0, $size - self::ERROR_LOG_TAIL_BYTES));
            $tail = stream_get_contents($handle);
        } finally {
            fclose($handle);
        }
        if (!is_string($tail)) return [];
        $lines = preg_split('/\R/', $tail) ?: [];
        $matching = array_values(array_filter($lines, static fn(string $line): bool => stripos($line, 'pixflow') !== false));
        return array_map([$this, 'redact_error_line'], array_slice($matching, -self::MAX_ERROR_LINES));
    }

    private function error_log_path(): string
    {
        if (defined('WP_DEBUG_LOG') && is_string(WP_DEBUG_LOG) && WP_DEBUG_LOG !== '') return WP_DEBUG_LOG;
        $configured = (string) ini_get('error_log');
        if ($configured !== '' && $configured !== 'syslog') return $configured;
        $default = (defined('WP_CONTENT_DIR') ? WP_CONTENT_DIR : '') . '/debug.log';
        return is_file($default) ? $default : '';
    }

    private function redact_error_line(string $line): string
    {
        // PHP failures can echo user content or signed URLs. A credentials
        // regex cannot reliably distinguish that text from a useful error.
        $categories = [];
        foreach (['fatal', 'error', 'warning', 'notice', 'timeout', 'memory', 'permission', 'database', 'connection', 'failed'] as $category) {
            if (preg_match('/\b' . $category . '\b/i', $line)) $categories[] = $category;
        }
        return 'Pixflow: ' . ($categories !== [] ? implode(', ', $categories) : 'diagnostic event');
    }

    /** @return array<string, mixed> */
    private function pick(array $source, array $keys): array
    {
        $result = [];
        foreach ($keys as $key) {
            if (!array_key_exists($key, $source) || !is_scalar($source[$key])) continue;
            $result[$key] = is_bool($source[$key]) ? $source[$key] : sanitize_text_field((string) $source[$key]);
        }
        return $result;
    }
}
