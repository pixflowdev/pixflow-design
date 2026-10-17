<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Onboarding;

if (!defined('ABSPATH')) {
    exit;
}

final class UserOnboardingProfile
{
    private const OPTION_KEY = 'pixflow_design_onboarding_profile_v1';
    private const LEGACY_APP_CONFIG_OPTION_KEY = 'pixflow_design_app_config';

    public function get(int $user_id): array
    {
        $stored = get_user_option(self::OPTION_KEY, $user_id);
        if (!is_array($stored)) {
            return $this->migrate_legacy_completed_profile($user_id);
        }

        return $this->normalize($stored);
    }

    public function save(int $user_id, array $payload): array
    {
        $existing = $this->get($user_id);
        $next = array_merge($existing, $this->sanitize_payload($payload));

        return $this->persist($user_id, $next);
    }

    public function reset(int $user_id): array
    {
        // Persist an explicit incomplete profile instead of deleting it. A
        // deletion could re-run the legacy site-level completion migration
        // and immediately mark this user as onboarded again.
        return $this->persist($user_id, [
            'completed' => false,
            'source' => 'settings-reset',
        ]);
    }

    private function migrate_legacy_completed_profile(int $user_id): array
    {
        $legacy = get_option(self::LEGACY_APP_CONFIG_OPTION_KEY, []);
        if (!is_array($legacy)
            || filter_var($legacy['onboardingCompleted'] ?? false, FILTER_VALIDATE_BOOLEAN) !== true) {
            return $this->normalize([]);
        }

        // v1.1.1 moved onboarding completion from the site app-config option
        // to a per-user profile. Existing installations have no profile yet,
        // so preserve their completed state once for the first user launch.
        // A stored per-user profile (including an explicit incomplete one)
        // remains authoritative and never reaches this migration path.
        $migrated = [
            'completed' => true,
            'source' => 'legacy-app-config-migration',
        ];
        foreach ([
            'runtimeMode',
            'agentId',
            'skillId',
            'designSystemId',
            'theme',
            'accentColor',
            'agentModels',
            'disabledSkills',
            'disabledDesignSystems',
        ] as $key) {
            if (array_key_exists($key, $legacy)) {
                $migrated[$key] = $legacy[$key];
            }
        }

        return $this->persist($user_id, $this->sanitize_payload($migrated));
    }

    private function persist(int $user_id, array $profile): array
    {
        $next = $this->normalize($profile);
        $now = gmdate('c');

        $next['updatedAt'] = $now;
        if (($next['completed'] ?? false) === true && empty($next['completedAt'])) {
            $next['completedAt'] = $now;
        }

        update_user_option($user_id, self::OPTION_KEY, $next, false);

        return $next;
    }

    private function normalize(array $profile): array
    {
        return [
            'completed' => filter_var($profile['completed'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'completedAt' => is_string($profile['completedAt'] ?? null) ? (string) $profile['completedAt'] : null,
            'updatedAt' => is_string($profile['updatedAt'] ?? null) ? (string) $profile['updatedAt'] : null,
            'source' => is_string($profile['source'] ?? null) ? (string) $profile['source'] : null,
            'runtimeMode' => $this->optional_string($profile['runtimeMode'] ?? null),
            'step' => max(0, min(3, (int) ($profile['step'] ?? 0))),
            'agentId' => $this->optional_string($profile['agentId'] ?? null),
            'skillId' => $this->optional_string($profile['skillId'] ?? null),
            'designSystemId' => $this->optional_string($profile['designSystemId'] ?? null),
            'theme' => $this->optional_string($profile['theme'] ?? null),
            'accentColor' => $this->optional_string($profile['accentColor'] ?? null),
            'agentModels' => is_array($profile['agentModels'] ?? null) ? $profile['agentModels'] : [],
            'disabledSkills' => $this->string_list($profile['disabledSkills'] ?? []),
            'disabledDesignSystems' => $this->string_list($profile['disabledDesignSystems'] ?? []),
        ];
    }

    private function sanitize_payload(array $payload): array
    {
        $safe = [];
        if (array_key_exists('step', $payload)) {
            $safe['step'] = max(0, min(3, (int) $payload['step']));
        }
        foreach ([
            'completed',
            'source',
            'runtimeMode',
            'agentId',
            'skillId',
            'designSystemId',
            'theme',
            'accentColor',
            'agentModels',
            'disabledSkills',
            'disabledDesignSystems',
        ] as $key) {
            if (array_key_exists($key, $payload)) {
                $safe[$key] = $payload[$key];
            }
        }

        if (array_key_exists('completed', $safe)) {
            $safe['completed'] = filter_var($safe['completed'], FILTER_VALIDATE_BOOLEAN);
        }

        foreach (['source', 'runtimeMode', 'agentId', 'skillId', 'designSystemId', 'theme', 'accentColor'] as $key) {
            if (array_key_exists($key, $safe)) {
                $safe[$key] = $this->optional_string($safe[$key]);
            }
        }

        if (array_key_exists('agentModels', $safe)) {
            $safe['agentModels'] = $this->sanitize_agent_models($safe['agentModels']);
        }
        if (array_key_exists('disabledSkills', $safe)) {
            $safe['disabledSkills'] = $this->string_list($safe['disabledSkills']);
        }
        if (array_key_exists('disabledDesignSystems', $safe)) {
            $safe['disabledDesignSystems'] = $this->string_list($safe['disabledDesignSystems']);
        }

        return $safe;
    }

    private function sanitize_agent_models(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $models = [];
        foreach ($value as $agent_id => $choice) {
            if (!is_string($agent_id) || !is_array($choice)) {
                continue;
            }
            $agent_id = sanitize_key($agent_id);
            if ($agent_id === '') {
                continue;
            }
            $entry = [];
            foreach (['model', 'reasoning'] as $key) {
                if (isset($choice[$key]) && is_string($choice[$key])) {
                    $entry[$key] = sanitize_text_field($choice[$key]);
                }
            }
            if (array_key_exists('fastMode', $choice) && is_bool($choice['fastMode'])) {
                $entry['fastMode'] = $choice['fastMode'];
            }
            if ($entry !== []) {
                $models[$agent_id] = $entry;
            }
        }

        return $models;
    }

    private function optional_string(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim(sanitize_text_field($value));

        return $value !== '' ? $value : null;
    }

    private function string_list(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $items = [];
        foreach ($value as $item) {
            if (!is_string($item)) {
                continue;
            }
            $item = trim(sanitize_text_field($item));
            if ($item !== '') {
                $items[] = $item;
            }
        }

        return array_values(array_unique($items));
    }
}
