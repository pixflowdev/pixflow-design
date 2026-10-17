<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Narrow WordPress site-settings adapter for the WP Admin capability plane.
 *
 * This deliberately is not a generic update_option wrapper. Every setting has
 * a known sanitiser, permission boundary, bounded value shape, and read-back
 * fingerprint so an approval cannot drift into an unrelated option write.
 */
final class WpAdminSettingsCapabilityService
{
    /** @var array<string, string> */
    private const ALLOWLIST = [
        'blogname' => 'text',
        'blogdescription' => 'textarea',
        'timezone_string' => 'timezone',
        'date_format' => 'format',
        'time_format' => 'format',
        'start_of_week' => 'week',
        'permalink_structure' => 'permalink',
    ];

    /** @return array<string, mixed>|\WP_Error */
    public function read(): array|\WP_Error
    {
        if (!current_user_can('manage_options')) {
            return $this->error('target_permission_denied', 'Site settings require manage_options.', 403);
        }

        $settings = [];
        foreach (array_keys(self::ALLOWLIST) as $key) {
            $settings[$key] = $this->safe_value($key, get_option($key, ''));
        }

        $theme = wp_get_theme();
        $show_on_front = (string) get_option('show_on_front', 'posts');
        $presentation = [
            'showOnFront' => $show_on_front === 'page' ? 'page' : 'posts',
            'pageOnFront' => max(0, (int) get_option('page_on_front', 0)),
            'pageForPosts' => max(0, (int) get_option('page_for_posts', 0)),
            'activeTheme' => [
                'name' => sanitize_text_field((string) $theme->get('Name')),
                'stylesheet' => sanitize_key((string) get_stylesheet()),
                'template' => sanitize_key((string) get_template()),
                'version' => sanitize_text_field((string) $theme->get('Version')),
            ],
        ];

        return [
            'settings' => $settings,
            'presentation' => $presentation,
            'fingerprint' => $this->fingerprint_from_settings($settings),
            'allowlist' => array_keys(self::ALLOWLIST),
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function update(array $arguments): array|\WP_Error
    {
        if (!current_user_can('manage_options')) {
            return $this->error('target_permission_denied', 'Site settings require manage_options.', 403);
        }
        $current = $this->read();
        if ($current instanceof \WP_Error) {
            return $current;
        }
        $expected = sanitize_text_field((string) ($arguments['expectedFingerprint'] ?? ''));
        if ($expected === '' || !hash_equals((string) $current['fingerprint'], $expected)) {
            return $this->error('stale_settings', 'The site settings changed; refresh before applying this update.', 409);
        }

        $raw = $arguments['settings'] ?? null;
        if (!is_array($raw) || $raw === [] || array_is_list($raw)) {
            return $this->error('settings_invalid', 'Settings must be a non-empty object keyed by allowlisted setting.', 400);
        }
        if (count($raw) > count(self::ALLOWLIST)) {
            return $this->error('settings_too_many', 'Too many settings were supplied.', 400);
        }

        $before = $current['settings'];
        $normalised = [];
        foreach ($raw as $key => $value) {
            $key = sanitize_key((string) $key);
            if (!array_key_exists($key, self::ALLOWLIST)) {
                return $this->error('setting_not_allowlisted', "Setting {$key} is not available through Pixflow.", 422);
            }
            $normalised[$key] = $this->normalise_value($key, $value);
            if ($normalised[$key] instanceof \WP_Error) {
                return $normalised[$key];
            }
        }

        foreach ($normalised as $key => $value) {
            update_option($key, $value, false);
        }
        if (array_key_exists('permalink_structure', $normalised)) {
            flush_rewrite_rules(false);
        }

        $after = $this->read();
        if ($after instanceof \WP_Error) {
            return $after;
        }
        return [
            'updated' => array_keys($normalised),
            'before' => $before,
            'after' => $after['settings'],
            'beforeFingerprint' => $current['fingerprint'],
            'afterFingerprint' => $after['fingerprint'],
            'rollback' => ['supported' => true, 'policy' => 'recorded_before_state'],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function rollback(array $result): array|\WP_Error
    {
        if (!current_user_can('manage_options')) {
            return $this->error('target_permission_denied', 'Site settings require manage_options.', 403);
        }
        $before = is_array($result['before'] ?? null) ? $result['before'] : [];
        if ($before === []) {
            return $this->error('rollback_state_missing', 'No settings before-state was recorded.', 409);
        }
        foreach ($before as $key => $value) {
            if (!array_key_exists((string) $key, self::ALLOWLIST)) {
                continue;
            }
            update_option((string) $key, $this->safe_value((string) $key, $value), false);
        }
        if (array_key_exists('permalink_structure', $before)) {
            flush_rewrite_rules(false);
        }
        $read = $this->read();
        if ($read instanceof \WP_Error) {
            return $read;
        }
        return ['result' => 'restored', 'settings' => $read['settings'], 'fingerprint' => $read['fingerprint']];
    }

    public function fingerprint(): string
    {
        $read = $this->read();
        return is_array($read) ? (string) ($read['fingerprint'] ?? '') : '';
    }

    /** @return mixed|\WP_Error */
    private function normalise_value(string $key, mixed $value): mixed
    {
        return match (self::ALLOWLIST[$key]) {
            'text' => is_scalar($value) && strlen((string) $value) <= 200
                ? sanitize_text_field((string) $value)
                : $this->error('setting_invalid_value', "{$key} must be a short text value.", 400),
            'textarea' => is_scalar($value) && strlen((string) $value) <= 500
                ? sanitize_textarea_field((string) $value)
                : $this->error('setting_invalid_value', "{$key} must be a bounded text value.", 400),
            'timezone' => is_scalar($value) && in_array((string) $value, timezone_identifiers_list(), true)
                ? (string) $value
                : $this->error('setting_invalid_value', 'timezone_string must be a valid timezone identifier.', 400),
            'format' => is_scalar($value) && strlen((string) $value) <= 64 && !preg_match('/[\x00-\x1F\x7F]/', (string) $value)
                ? sanitize_text_field((string) $value)
                : $this->error('setting_invalid_value', "{$key} must be a bounded date/time format.", 400),
            'week' => is_int($value) || (is_string($value) && ctype_digit($value))
                ? max(0, min(6, (int) $value))
                : $this->error('setting_invalid_value', 'start_of_week must be an integer from 0 to 6.', 400),
            'permalink' => is_scalar($value) && strlen((string) $value) <= 190 && !preg_match('/[\x00-\x1F\x7F]/', (string) $value)
                ? sanitize_text_field((string) $value)
                : $this->error('setting_invalid_value', 'permalink_structure must be a bounded path pattern.', 400),
            default => $this->error('setting_not_allowlisted', "Setting {$key} is not available through Pixflow.", 422),
        };
    }

    private function safe_value(string $key, mixed $value): mixed
    {
        if (self::ALLOWLIST[$key] === 'week') {
            return max(0, min(6, (int) $value));
        }
        return self::ALLOWLIST[$key] === 'textarea'
            ? sanitize_textarea_field((string) $value)
            : sanitize_text_field((string) $value);
    }

    /** @param array<string, mixed> $settings */
    private function fingerprint_from_settings(array $settings): string
    {
        ksort($settings);
        return hash('sha256', (string) wp_json_encode($settings));
    }

    private function error(string $code, string $message, int $status): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status]);
    }
}
