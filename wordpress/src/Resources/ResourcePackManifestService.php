<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Resources;

if (!defined('ABSPATH')) {
    exit;
}

final class ResourcePackManifestService
{
    public const DEFAULT_MANIFEST_URL = 'https://pixflow.dev/api/catalogs/v1/resources';
    private const CACHE_TTL = 300;

    public function __construct(
        private readonly ResourcePackRepository $repository = new ResourcePackRepository(),
    ) {
    }

    public function manifest(bool $refresh = false): array
    {
        if (!$refresh) {
            $cached = $this->repository->remote_manifest();
            if (is_array($cached) && (int) ($cached['cachedAt'] ?? 0) > time() - self::CACHE_TTL
                && ($cached['catalogAuthority'] ?? '') === \PixflowDesign\WordPress\License\CentralEntitlements::authority()) {
                return $this->normalize_manifest($cached);
            }
        }

        $remote = $this->fetch_remote_manifest();
        if (is_array($remote)) {
            $manifest = $this->normalize_manifest($remote);
            $manifest['catalogAuthority'] = \PixflowDesign\WordPress\License\CentralEntitlements::authority();
            $this->repository->save_remote_manifest($manifest);

            return $manifest;
        }

        return $this->fallback_manifest();
    }

    public function pack(string $slug, bool $refresh = false): ?array
    {
        $slug = sanitize_key($slug);
        foreach ($this->manifest($refresh)['packs'] as $pack) {
            if ((string) ($pack['slug'] ?? '') === $slug) {
                return $pack;
            }
        }

        return null;
    }

    private function fetch_remote_manifest(): ?array
    {
        $response = wp_remote_get(\PixflowDesign\WordPress\License\CentralEntitlements::authority() . '/api/catalogs/v1/resources', [
            'timeout' => 12,
            'redirection' => 3,
            'headers' => [
                'Accept' => 'application/json',
                'X-Pixflow-Plugin-Version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '',
            ],
        ]);

        if (is_wp_error($response)) {
            return null;
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        if ($code < 200 || $code >= 300) {
            return null;
        }

        $body = wp_remote_retrieve_body($response);
        $json = json_decode($body, true);

        return is_array($json) ? $json : null;
    }

    private function normalize_manifest(array $manifest): array
    {
        $packs = [];
        foreach (is_array($manifest['packs'] ?? null) ? $manifest['packs'] : [] as $pack) {
            if (!is_array($pack)) {
                continue;
            }

            $slug = sanitize_key((string) ($pack['slug'] ?? $pack['id'] ?? ''));
            if ($slug === '') {
                continue;
            }

            // Product labels also apply to already-installed and cached legacy packs.
            // Artifact identity, version, entitlement and checksums remain server-owned.
            if ($slug === 'plugins') {
                $pack['name'] = 'Creative Resources';
                $pack['description'] = 'Optional image, video and web design recipes with preview assets.';
            } elseif ($slug === 'design-systems') {
                $pack['name'] = 'Style References';
                $pack['description'] = 'Optional visual inspiration. Create and apply native site systems in Design Systems.';
            }

            $packs[] = [
                'slug' => $slug,
                'artifact_id' => sanitize_text_field((string) ($pack['artifact_id'] ?? '')),
                'type' => sanitize_key((string) ($pack['type'] ?? 'resource-pack')),
                'name' => sanitize_text_field((string) ($pack['name'] ?? $pack['title'] ?? $slug)),
                'description' => sanitize_textarea_field((string) ($pack['description'] ?? '')),
                'channel' => sanitize_key((string) ($pack['channel'] ?? 'stable')),
                'version' => sanitize_text_field((string) ($pack['version'] ?? '0.0.0')),
                'revision' => sanitize_text_field((string) ($pack['revision'] ?? $pack['contentRevision'] ?? '')),
                'size' => max(0, (int) ($pack['size'] ?? 0)),
                'checksum' => sanitize_text_field((string) ($pack['checksum'] ?? $pack['sha256'] ?? '')),
                'checksumAlgorithm' => sanitize_key((string) ($pack['checksumAlgorithm'] ?? 'sha256')),
                'archiveUrl' => esc_url_raw((string) ($pack['archiveUrl'] ?? $pack['url'] ?? '')),
                'licenseRequired' => (bool) ($pack['licenseRequired'] ?? $pack['requiresLicense'] ?? false),
                'optional' => (bool) ($pack['optional'] ?? true),
                'recommended' => (bool) ($pack['recommended'] ?? false),
                'installPriority' => (int) ($pack['installPriority'] ?? 100),
                'compatibility' => is_array($pack['compatibility'] ?? null) ? $pack['compatibility'] : [
                    'minPluginVersion' => (string) ($pack['minimumPluginVersion'] ?? ''),
                    'maxPluginVersion' => (string) ($pack['maximumPluginVersion'] ?? ''),
                ],
                'dependencies' => array_values(array_filter(array_map('sanitize_key', is_array($pack['dependencies'] ?? null) ? $pack['dependencies'] : []))),
                'contentRoots' => is_array($pack['contentRoots'] ?? null) ? $pack['contentRoots'] : [],
            ];
        }

        usort($packs, static fn(array $a, array $b): int => ((int) $a['installPriority'] <=> (int) $b['installPriority']) ?: strcmp((string) $a['name'], (string) $b['name']));

        return [
            'schemaVersion' => sanitize_text_field((string) ($manifest['schemaVersion'] ?? $manifest['manifestVersion'] ?? '1.0')),
            'product' => sanitize_text_field((string) ($manifest['product'] ?? 'pixflow-design-resources')),
            'generatedAt' => sanitize_text_field((string) ($manifest['generatedAt'] ?? gmdate(DATE_ATOM))),
            'minimumPluginVersion' => sanitize_text_field((string) ($manifest['minimumPluginVersion'] ?? '')),
            'sourceUrl' => esc_url_raw((string) ($manifest['sourceUrl'] ?? self::DEFAULT_MANIFEST_URL)),
            'packs' => $packs,
        ];
    }

    private function fallback_manifest(): array
    {
        return $this->normalize_manifest([
            'schemaVersion' => '1.0',
            'product' => 'pixflow-design-resources',
            'generatedAt' => gmdate(DATE_ATOM),
            'sourceUrl' => self::DEFAULT_MANIFEST_URL,
            'packs' => [
                [
                    'slug' => 'core-skills',
                    'type' => 'core-skills',
                    'name' => 'Core Skills',
                    'description' => 'Agent skills and relationship metadata used by Pixflow Design.',
                    'version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '0.0.0',
                    'optional' => false,
                    'recommended' => true,
                    'installPriority' => 10,
                    'contentRoots' => ['skills' => 'skills'],
                ],
                [
                    'slug' => 'bricks-knowledge',
                    'type' => 'bricks-knowledge',
                    'name' => 'Bricks Knowledge',
                    'description' => 'Bricks schema, controls, examples, and JSON generation rules.',
                    'version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '0.0.0',
                    'optional' => false,
                    'recommended' => true,
                    'installPriority' => 20,
                ],
                [
                    'slug' => 'plugins',
                    'type' => 'plugins',
                    'name' => 'Creative Resources',
                    'description' => 'Optional image, video and web design recipes with preview assets.',
                    'version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '0.0.0',
                    'optional' => true,
                    'recommended' => true,
                    'installPriority' => 25,
                    'contentRoots' => ['plugins' => 'plugins'],
                ],
                [
                    'slug' => 'pixflow-library',
                    'type' => 'pixflow-library',
                    'name' => 'Pixflow Library',
                    'description' => 'Pixflow Library template metadata and downloadable template assets.',
                    'version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '0.0.0',
                    'licenseRequired' => true,
                    'optional' => true,
                    'recommended' => true,
                    'installPriority' => 30,
                ],
                [
                    'slug' => 'design-templates',
                    'type' => 'design-templates',
                    'name' => 'Design Templates',
                    'description' => 'Pixflow Design template metadata and bundled preview assets.',
                    'version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '0.0.0',
                    'optional' => true,
                    'recommended' => true,
                    'installPriority' => 35,
                    'contentRoots' => ['design-templates' => 'design-templates'],
                ],
                [
                    'slug' => 'design-systems',
                    'type' => 'design-systems',
                    'name' => 'Design Systems',
                    'description' => 'Optional visual style references. Native saved site systems are managed separately.',
                    'version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '0.0.0',
                    'optional' => true,
                    'recommended' => true,
                    'installPriority' => 40,
                    'contentRoots' => ['design-systems' => 'design-systems'],
                ],
                [
                    'slug' => 'prompt-templates',
                    'type' => 'prompt-templates',
                    'name' => 'Prompt Templates',
                    'description' => 'Prompt templates for image, video, and other generation surfaces.',
                    'version' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '0.0.0',
                    'optional' => true,
                    'recommended' => false,
                    'installPriority' => 50,
                    'contentRoots' => ['prompt-templates' => 'prompt-templates'],
                ],
            ],
        ]);
    }
}
