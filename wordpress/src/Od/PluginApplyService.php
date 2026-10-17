<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Od;

if (!defined('ABSPATH')) {
    exit;
}

final class PluginApplyService
{
    public function __construct(
        private readonly RegistryService $registry = new RegistryService(),
    ) {
    }

    public function apply(string $plugin_id, array $inputs = [], string $locale = 'en'): array|\WP_Error
    {
        $plugin = $this->registry->plugin($plugin_id);
        if (!is_array($plugin)) {
            return new \WP_Error('plugin_not_found', 'Plugin not found.', ['status' => 404]);
        }

        $manifest = is_array($plugin['manifest'] ?? null) ? $plugin['manifest'] : [];
        $validated = $this->validate_inputs($manifest, $inputs);
        if ($validated['missing'] !== []) {
            return new \WP_Error(
                'missing_plugin_inputs',
                'Missing required plugin inputs: ' . implode(', ', $validated['missing']),
                ['status' => 422, 'fields' => $validated['missing']]
            );
        }

        $coerced_inputs = $validated['inputs'];
        $context = $this->resolve_context($manifest);
        $assets = $this->build_asset_refs($manifest);
        $query = $this->localized_text($manifest['od']['useCase']['query'] ?? '', $locale);
        $capabilities = array_values(array_filter(array_map(
            static fn($value): string => sanitize_text_field((string) $value),
            is_array($manifest['od']['capabilities'] ?? null) ? $manifest['od']['capabilities'] : []
        )));
        $task_kind = sanitize_key((string) ($manifest['od']['taskKind'] ?? 'new-generation'));
        if (!in_array($task_kind, ['new-generation', 'code-migration', 'figma-migration', 'tune-collab'], true)) {
            $task_kind = 'new-generation';
        }

        $plugin_title = $this->localized_text($manifest['title_i18n'] ?? '', $locale)
            ?: sanitize_text_field((string) ($manifest['title'] ?? $manifest['name'] ?? $plugin_id));
        $plugin_description = $this->localized_text($manifest['description_i18n'] ?? '', $locale)
            ?: (string) ($manifest['description'] ?? '');
        $digest = hash('sha256', wp_json_encode([
            'manifest' => $manifest,
            'inputs' => $coerced_inputs,
            'context' => $context,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '');
        $pipeline = is_array($manifest['od']['pipeline'] ?? null) ? $manifest['od']['pipeline'] : null;
        $genui_surfaces = is_array($manifest['od']['genui']['surfaces'] ?? null) ? $manifest['od']['genui']['surfaces'] : [];
        $mcp_servers = is_array($manifest['od']['context']['mcp'] ?? null) ? $manifest['od']['context']['mcp'] : [];

        $snapshot = [
            'snapshotId' => '',
            'pluginId' => (string) ($plugin['id'] ?? $plugin_id),
            'pluginSpecVersion' => (string) ($manifest['specVersion'] ?? '1.0.0'),
            'pluginVersion' => (string) ($plugin['version'] ?? $manifest['version'] ?? '0.0.0'),
            'manifestSourceDigest' => $digest,
            'sourceMarketplaceId' => (string) ($plugin['sourceMarketplaceId'] ?? 'pixflow-installed-resources'),
            'sourceMarketplaceEntryName' => (string) ($plugin['sourceMarketplaceEntryName'] ?? $plugin_id),
            'sourceMarketplaceEntryVersion' => (string) ($plugin['sourceMarketplaceEntryVersion'] ?? $manifest['version'] ?? '0.0.0'),
            'marketplaceTrust' => 'official',
            'resolvedSource' => (string) ($plugin['resolvedSource'] ?? $plugin['source'] ?? ''),
            'inputs' => $coerced_inputs,
            'resolvedContext' => $context,
            'craftRequires' => [],
            'capabilitiesGranted' => $this->capabilities_granted($capabilities),
            'capabilitiesRequired' => $capabilities,
            'assetsStaged' => $assets,
            'taskKind' => $task_kind,
            'appliedAt' => $this->now_ms(),
            'connectorsRequired' => [],
            'connectorsResolved' => [],
            'mcpServers' => $mcp_servers,
            'genuiSurfaces' => $genui_surfaces,
            'pluginTitle' => $plugin_title,
            'pluginDescription' => $plugin_description,
            'status' => 'fresh',
        ];
        if ($pipeline !== null) {
            $snapshot['pipeline'] = $pipeline;
        }
        if ($query !== '') {
            $snapshot['query'] = $query;
        }

        return [
            'ok' => true,
            'query' => $query,
            'contextItems' => $context['items'],
            'inputs' => is_array($manifest['od']['inputs'] ?? null) ? $manifest['od']['inputs'] : [],
            'assets' => $assets,
            'mcpServers' => $mcp_servers,
            'genuiSurfaces' => $genui_surfaces,
            'projectMetadata' => [
                'name' => $plugin_title,
                'taskKind' => $task_kind,
            ],
            'trust' => 'trusted',
            'capabilitiesGranted' => $snapshot['capabilitiesGranted'],
            'capabilitiesRequired' => $capabilities,
            'appliedPlugin' => $snapshot,
            'manifestSourceDigest' => $digest,
            'warnings' => [],
        ] + ($pipeline !== null ? ['pipeline' => $pipeline] : []);
    }

    private function validate_inputs(array $manifest, array $raw): array
    {
        $fields = is_array($manifest['od']['inputs'] ?? null) ? $manifest['od']['inputs'] : [];
        $coerced = [];
        $missing = [];
        foreach ($fields as $field) {
            if (!is_array($field)) {
                continue;
            }
            $name = (string) ($field['name'] ?? '');
            if ($name === '') {
                continue;
            }
            $value = $raw[$name] ?? null;
            if ($value === null || $value === '') {
                $fallback = $field['default'] ?? null;
                if ($fallback !== null && $fallback !== '') {
                    $coerced[$name] = $this->coerce_scalar($fallback);
                } elseif (($field['required'] ?? false) === true) {
                    $missing[] = $name;
                }
                continue;
            }
            $coerced[$name] = $this->coerce_scalar($value);
        }
        foreach ($raw as $key => $value) {
            if (!is_string($key) || array_key_exists($key, $coerced) || $value === null) {
                continue;
            }
            $coerced[$key] = $this->coerce_scalar($value);
        }

        return ['inputs' => $coerced, 'missing' => $missing];
    }

    private function coerce_scalar(mixed $value): string|int|float|bool
    {
        if (is_bool($value) || is_int($value) || is_float($value)) {
            return $value;
        }

        return (string) $value;
    }

    private function resolve_context(array $manifest): array
    {
        $items = [];
        foreach ((array) ($manifest['od']['context']['assets'] ?? []) as $path) {
            if (!is_string($path) || trim($path) === '') {
                continue;
            }
            $items[] = [
                'kind' => 'asset',
                'path' => $path,
                'label' => basename(str_replace('\\', '/', $path)),
            ];
        }
        foreach ((array) ($manifest['compat']['agentSkills'] ?? []) as $skill) {
            if (!is_array($skill) || !is_string($skill['path'] ?? null)) {
                continue;
            }
            $items[] = [
                'kind' => 'skill',
                'path' => (string) $skill['path'],
                'label' => basename((string) $skill['path']),
            ];
        }

        return ['items' => $items];
    }

    private function build_asset_refs(array $manifest): array
    {
        $paths = [];
        foreach ((array) ($manifest['od']['context']['assets'] ?? []) as $path) {
            if (is_string($path) && trim($path) !== '') {
                $paths[] = $path;
            }
        }

        return array_values(array_map(static fn(string $path): array => [
            'path' => $path,
            'src' => $path,
            'stageAt' => 'run-start',
        ], array_unique($paths)));
    }

    private function localized_text(mixed $value, string $locale): string
    {
        if (is_string($value)) {
            return $value;
        }
        if (!is_array($value)) {
            return '';
        }
        foreach ([$locale, substr($locale, 0, 2), 'en'] as $key) {
            if (is_string($value[$key] ?? null)) {
                return (string) $value[$key];
            }
        }

        foreach ($value as $candidate) {
            if (is_string($candidate)) {
                return $candidate;
            }
        }

        return '';
    }

    private function capabilities_granted(array $capabilities): array
    {
        $granted = ['prompt:inject'];
        foreach ($capabilities as $capability) {
            if ($capability !== '') {
                $granted[] = $capability;
            }
        }

        return array_values(array_unique($granted));
    }

    private function now_ms(): int
    {
        return (int) floor(microtime(true) * 1000);
    }
}

