<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Providers;

if (!defined('ABSPATH')) {
    exit;
}

final class ProviderSettingsRepository
{
    private const USER_META_KEY = 'pixflow_design_provider_settings';
    private const API_PROTOCOL_CONFIG_FIELDS = [
        'baseUrl',
        'model',
        'apiVersion',
        'apiProviderBaseUrl',
        'byokImageModel',
        'byokVideoModel',
        'byokSpeechModel',
        'byokSpeechVoice',
        'maxTokens',
    ];

    public function get(?int $user_id = null): array
    {
        $user_id = $user_id ?: get_current_user_id();
        if ($user_id <= 0) {
            return [];
        }

        $settings = get_user_meta($user_id, self::USER_META_KEY, true);

        return is_array($settings) ? $this->sanitize($settings) : [];
    }

    public function save(array $settings, ?int $user_id = null): array
    {
        $user_id = $user_id ?: get_current_user_id();
        if ($user_id <= 0) {
            return [];
        }

        // Provider settings may be saved as a partial update by the browser.
        // Merge with the existing redacted markers so a settings refresh never
        // makes a previously configured key appear to be missing.
        $existing = $this->get($user_id);
        $sanitized = $this->sanitize(array_replace_recursive($existing, $settings));
        update_user_meta($user_id, self::USER_META_KEY, $sanitized);

        return $sanitized;
    }

    public function extract_from_app_config(array $config): array
    {
        $settings = [];
        foreach ([
            'mode',
            'apiProtocol',
            'apiTransport', 'composioProvider', 'composioModel',
            'apiVersion',
            'baseUrl',
            'model',
            'apiProviderBaseUrl',
            'byokImageModel',
            'byokVideoModel',
            'byokSpeechModel',
            'byokSpeechVoice',
            'maxTokens',
        ] as $key) {
            if (array_key_exists($key, $config)) {
                $settings[$key] = $config[$key];
            }
        }

        foreach (['apiProtocolConfigs'] as $key) {
            if (is_array($config[$key] ?? null)) {
                $settings[$key] = $config[$key];
            }
        }

        return $this->sanitize($settings);
    }

    public function merge_into_app_config(array $config, ?int $user_id = null): array
    {
        $settings = $this->get($user_id);
        if ($settings === []) {
            return $config;
        }

        unset($settings['agentId'], $settings['agentModels'], $settings['agentCliEnv']);

        return array_replace_recursive($config, $settings);
    }

    public function sanitize(array $settings): array
    {
        $sanitized = [];
        $mode = sanitize_key((string) ($settings['mode'] ?? ''));
        if (in_array($mode, ['daemon', 'api'], true)) {
            $sanitized['mode'] = $mode;
        }

        foreach (['apiProtocol', 'apiTransport', 'composioProvider', 'composioModel', 'apiVersion', 'baseUrl', 'model', 'apiProviderBaseUrl', 'byokImageModel', 'byokVideoModel', 'byokSpeechModel', 'byokSpeechVoice'] as $key) {
            if (array_key_exists($key, $settings)) {
                $value = $settings[$key];
                $sanitized[$key] = $value === null ? null : sanitize_text_field((string) $value);
            }
        }

        if (isset($settings['maxTokens']) && is_numeric($settings['maxTokens'])) {
            $sanitized['maxTokens'] = max(1, (int) $settings['maxTokens']);
        }

        if (is_array($settings['apiProtocolConfigs'] ?? null)) {
            $sanitized['apiProtocolConfigs'] = $this->sanitize_api_protocol_configs($settings['apiProtocolConfigs']);
        }

        if (is_array($settings['mediaProviders'] ?? null)) {
            $sanitized['mediaProviders'] = $this->sanitize_media_providers($settings['mediaProviders']);
        }

        return $sanitized;
    }

    private function sanitize_api_protocol_configs(array $configs): array
    {
        $safe = [];
        foreach ($configs as $protocol => $config) {
            if (!is_array($config)) {
                continue;
            }

            $id = sanitize_key((string) $protocol);
            if ($id === '') {
                continue;
            }

            $entry = [];
            foreach (self::API_PROTOCOL_CONFIG_FIELDS as $field) {
                if (!array_key_exists($field, $config)) {
                    continue;
                }
                $value = $config[$field];
                if (is_scalar($value) || $value === null) {
                    $entry[$field] = $field === 'maxTokens' && is_numeric($value)
                        ? max(1, (int) $value)
                        : ($value === null ? null : sanitize_text_field((string) $value));
                }
            }

            if ($entry !== []) {
                $safe[$id] = $entry;
            }
        }

        return $safe;
    }

    /**
     * Keep only non-secret provider metadata in WordPress. The live API key is
     * sent per request by the BYOK browser path; storing it here would turn a
     * settings marker into a second credential cache and recreate the stale
     * daemon problem this adapter is intended to remove.
     */
    private function sanitize_media_providers(array $providers): array
    {
        $safe = [];
        foreach ($providers as $provider_id => $provider) {
            if (!is_array($provider)) continue;
            $id = sanitize_key((string) $provider_id);
            if ($id === '') continue;
            $entry = [];
            foreach (['baseUrl', 'model', 'source'] as $field) {
                if (array_key_exists($field, $provider) && is_scalar($provider[$field])) {
                    $entry[$field] = $field === 'source'
                        ? sanitize_key((string) $provider[$field])
                        : sanitize_text_field((string) $provider[$field]);
                }
            }
            if (array_key_exists('enabled', $provider)) {
                $entry['enabled'] = (bool) $provider['enabled'];
            }
            $api_key = is_scalar($provider['apiKey'] ?? null) ? trim((string) $provider['apiKey']) : '';
            $tail = is_scalar($provider['apiKeyTail'] ?? null) ? sanitize_text_field((string) $provider['apiKeyTail']) : '';
            if ($api_key !== '') {
                $entry['apiKeyConfigured'] = true;
                $entry['apiKeyTail'] = substr($api_key, -4);
            } elseif ($provider['apiKeyConfigured'] ?? false) {
                $entry['apiKeyConfigured'] = true;
                if ($tail !== '') $entry['apiKeyTail'] = $tail;
            } elseif ($tail !== '') {
                $entry['apiKeyTail'] = $tail;
            }
            if ($entry !== []) $safe[$id] = $entry;
        }

        return $safe;
    }

}
