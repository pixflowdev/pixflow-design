<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Od;

use PixflowDesign\WordPress\Mcp\PromptSkillCatalog;
use PixflowDesign\WordPress\Resources\ResourcePackRepository;

if (!defined('ABSPATH')) {
    exit;
}

final class RegistryService
{
    private const REGISTRY_CACHE_PREFIX = 'pixflow_design_od_registry_v4_';
    private const REGISTRY_CACHE_TTL = 3600;
    private const PLUGIN_ASSET_INDEX_CACHE_PREFIX = 'pixflow_design_od_plugin_asset_index_v3_';
    private const PLUGIN_PREVIEW_BAKE_BASE_URL = 'https://repo-assets.open-design.ai/plugin-previews';

    /** @var array<string, array{video?: string, poster?: string, holdMs?: int|float}>|null */
    private ?array $plugin_preview_bakes = null;

    public function __construct(
        private readonly PromptSkillCatalog $prompt_skills = new PromptSkillCatalog(),
        private readonly ResourcePackRepository $resource_packs = new ResourcePackRepository(),
    ) {
    }

    public function skills(): array
    {
        $built_in = $this->cached_registry_summary('skills', fn(): array => array_values($this->skill_summaries()));
        $built_in = array_filter($built_in, static fn(array $skill): bool => \PixflowDesign\WordPress\Modules\SkillAccess::listed((string) ($skill['id'] ?? '')));
        $personal = \PixflowDesign\WordPress\Modules\PersonalSkills::all();
        $merged = array_filter(array_replace(array_column($built_in, null, 'id'), $personal), static fn(array $skill): bool => \PixflowDesign\WordPress\Modules\SkillAccess::skill_allowed($skill) && \PixflowDesign\WordPress\Modules\ImageGenerationAccess::skill_allowed($skill));
        return array_merge(array_values(array_map(static function(array $skill): array { unset($skill['body']); return $skill; }, $merged)), \PixflowDesign\WordPress\Modules\OfficialSkills::call('list'));
    }

    public function skill(string $id): ?array
    {
        if (\PixflowDesign\WordPress\Modules\OfficialSkills::owns($id)) return \PixflowDesign\WordPress\Modules\OfficialSkills::call('read', ['id'=>$id]);
        $id = sanitize_key(rawurldecode($id));
        $personal = \PixflowDesign\WordPress\Modules\PersonalSkills::all();
        if (isset($personal[$id])) return \PixflowDesign\WordPress\Modules\ImageGenerationAccess::skill_allowed($personal[$id]) ? $personal[$id] : null;
        if (!\PixflowDesign\WordPress\Modules\SkillAccess::skill_allowed(['id' => $id])) return null;
        $id = \PixflowDesign\WordPress\Modules\SkillAccess::canonical($id)['id'] ?? $id;
        $skill = $this->skill_detail($this->registry_roots('skills', PIXFLOW_DESIGN_PLUGIN_DIR . 'skills'), $id, 'prototype');
        return $skill !== null && \PixflowDesign\WordPress\Modules\ImageGenerationAccess::skill_allowed($skill) ? $skill : null;
    }

    public function design_templates(): array
    {
        return $this->cached_registry_summary(
            'design_templates',
            fn(): array => array_values(array_replace(array_column($this->skill_summaries(
                $this->registry_roots('design-templates', PIXFLOW_DESIGN_PLUGIN_DIR . 'design-templates'),
                'template'
            ), null, 'id'), array_column($this->skill_summaries(
                $this->registry_roots('skills', PIXFLOW_DESIGN_PLUGIN_DIR . 'skills'),
                'template', true
            ), null, 'id')))
        );
    }

    public function design_template(string $id): ?array
    {
        return $this->skill_detail($this->registry_roots('design-templates', PIXFLOW_DESIGN_PLUGIN_DIR . 'design-templates'), $id, 'template')
            ?? $this->skill_detail($this->registry_roots('skills', PIXFLOW_DESIGN_PLUGIN_DIR . 'skills'), $id, 'template', true)
            ?? $this->skill_detail(\PixflowDesign\WordPress\Resources\BundledResources::historical_roots('skills'), $id, 'template', true);
    }

    public function design_systems(): array
    {
        $packaged = $this->cached_registry_summary('design_systems', function (): array {
            $roots = $this->registry_roots('design-systems', PIXFLOW_DESIGN_PLUGIN_DIR . 'design-systems');
            if ($roots === []) {
                return [];
            }

            $systems = [];
            foreach ($roots as $root) {
                foreach (new \DirectoryIterator($root) as $entry) {
                    if ($entry->isDot() || !$entry->isDir()) {
                        continue;
                    }

                    $id = sanitize_key($entry->getBasename());
                    if ($id === '' || str_starts_with($id, '_')) {
                        continue;
                    }

                    $usage_path = $entry->getPathname() . DIRECTORY_SEPARATOR . 'USAGE.md';
                    $tokens_path = $entry->getPathname() . DIRECTORY_SEPARATOR . 'tokens.css';
                    $usage = is_readable($usage_path) ? (string) file_get_contents($usage_path) : '';
                    $manifest_path = $entry->getPathname() . DIRECTORY_SEPARATOR . 'manifest.json';
                    $manifest = is_readable($manifest_path) ? json_decode((string) file_get_contents($manifest_path), true) : [];
                    $systems[$id] = [
                        'id' => $id,
                        'title' => sanitize_text_field((string) ($manifest['name'] ?? '')) ?: ucwords(str_replace(['-', '_'], ' ', $id)),
                        'category' => 'Style Reference',
                        'summary' => 'Visual inspiration; not an applied Bricks site system. ' . ($this->first_markdown_paragraph($usage) ?: ''),
                        'swatches' => $this->css_color_swatches(is_readable($tokens_path) ? (string) file_get_contents($tokens_path) : ''),
                        'surface' => 'web',
                        'source' => str_starts_with(wp_normalize_path($root), wp_normalize_path(PIXFLOW_DESIGN_PLUGIN_DIR)) ? 'built-in' : 'resource-pack',
                        'status' => 'published',
                        'isEditable' => false,
                    ];
                }
            }

            $systems = array_values($systems);
            usort($systems, static fn(array $a, array $b): int => strcmp((string) $a['title'], (string) $b['title']));

            return $systems;
        });
        // WordPress drafts are live data and must not share the resource-pack cache.
        foreach ((new \PixflowDesign\WordPress\Framework\DesignSystem\SavedDesignSystems())->all() as $item) {
            $packaged[] = $this->bricks_system_summary($item);
        }
        return $packaged;
    }

    private function bricks_system_summary(array $item): array
    {
        return ['id' => $item['id'], 'title' => $item['title'], 'summary' => $item['summary'], 'category' => 'Design system', 'surface' => 'web', 'source' => 'user', 'status' => 'draft', 'isEditable' => true, 'swatches' => array_values(array_map(static fn($group) => $group['accent'], array_slice($item['profile']['colors'], 0, 3)))];
    }

    public function design_system(string $id): ?array
    {
        $saved = (new \PixflowDesign\WordPress\Framework\DesignSystem\SavedDesignSystems())->get($id);
        if ($saved) {
            return $this->bricks_system_summary($saved) + ['body' => '# ' . $saved['title'] . "\n\n" . $saved['summary'] . "\n\nPixflow design profile:\n```json\n" . wp_json_encode($saved['profile'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n```", 'profile' => $saved['profile']];
        }
        $wanted_id = sanitize_key(rawurldecode($id));
        if ($wanted_id === '') {
            return null;
        }

        foreach ($this->registry_roots('design-systems', PIXFLOW_DESIGN_PLUGIN_DIR . 'design-systems') as $root) {
            $dir = $root . DIRECTORY_SEPARATOR . $wanted_id;
            if (!is_dir($dir)) {
                continue;
            }

            $usage_path = $dir . DIRECTORY_SEPARATOR . 'USAGE.md';
            $design_path = $dir . DIRECTORY_SEPARATOR . 'DESIGN.md';
            $tokens_path = $dir . DIRECTORY_SEPARATOR . 'tokens.css';
            $manifest_path = $dir . DIRECTORY_SEPARATOR . 'manifest.json';

            $usage = is_readable($usage_path) ? (string) file_get_contents($usage_path) : '';
            $design = is_readable($design_path) ? (string) file_get_contents($design_path) : '';
            $tokens = is_readable($tokens_path) ? (string) file_get_contents($tokens_path) : '';
            $manifest = is_readable($manifest_path) ? json_decode((string) file_get_contents($manifest_path), true) : null;
            $body_parts = array_values(array_filter([
                $usage,
                $design,
                $tokens !== '' ? "```css\n" . $tokens . "\n```" : '',
            ], static fn(string $part): bool => trim($part) !== ''));

            return [
                'id' => $wanted_id,
                'title' => $this->title_from_markdown($usage) ?: ucwords(str_replace(['-', '_'], ' ', $wanted_id)),
                'category' => is_array($manifest) && is_string($manifest['category'] ?? null) ? (string) $manifest['category'] : 'Design System',
                'summary' => $this->first_markdown_paragraph($usage) ?: 'Pixflow Design system.',
                'swatches' => $this->css_color_swatches($tokens),
                'surface' => 'web',
                'source' => str_starts_with(wp_normalize_path($root), wp_normalize_path(PIXFLOW_DESIGN_PLUGIN_DIR)) ? 'built-in' : 'resource-pack',
                'status' => 'published',
                'isEditable' => false,
                'body' => implode("\n\n", $body_parts),
                'packageInfo' => [
                    'manifest' => is_array($manifest) ? $manifest : null,
                ],
            ];
        }

        return null;
    }

    public function design_system_preview(string $id): ?array
    {
        $wanted_id = rawurldecode($id);
        if ($wanted_id === '' || $wanted_id !== sanitize_key($wanted_id)) return null;
        foreach ($this->registry_roots('design-systems', PIXFLOW_DESIGN_PLUGIN_DIR . 'design-systems') as $root) {
            $dir = $root . DIRECTORY_SEPARATOR . $wanted_id;
            $path = $this->safe_plugin_asset_path($dir, 'components.html');
            $tokens = $this->safe_plugin_asset_path($dir, 'tokens.css');
            if ($path === null || !is_readable($path)) continue;
            $body = (string) file_get_contents($path);
            if ($tokens !== null && is_readable($tokens)) {
                $css = str_ireplace('</style', '<\\/style', (string) file_get_contents($tokens));
                $body = preg_replace_callback('#<link\\b[^>]*href=[\"\'](?:\\./)?tokens\\.css[\"\'][^>]*>#i', static fn() => '<style>' . $css . '</style>', $body) ?? $body;
            }
            return ['body' => $body, 'mime' => 'text/html; charset=utf-8'];
        }
        return null;
    }

    public function prompt_templates(): array
    {
        return $this->cached_registry_summary('prompt_templates', function (): array {
            $roots = $this->registry_roots('prompt-templates', PIXFLOW_DESIGN_PLUGIN_DIR . 'prompt-templates');
            if ($roots === []) {
                return [];
            }

            $templates = [];
            foreach ($roots as $root) {
                $iterator = new \RecursiveIteratorIterator(
                    new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
                );
                foreach ($iterator as $file) {
                    if (!$file instanceof \SplFileInfo || !$file->isFile() || strtolower($file->getExtension()) !== 'json') {
                        continue;
                    }

                    $json = json_decode((string) file_get_contents($file->getPathname()), true);
                    if (!is_array($json)) {
                        continue;
                    }

                    $surface = (string) ($json['surface'] ?? basename($file->getPath()));
                    if (!in_array($surface, ['image', 'video'], true)) {
                        continue;
                    }

                    $templates[sanitize_key((string) ($json['id'] ?? $file->getBasename('.json')))] = [
                        'id' => sanitize_key((string) ($json['id'] ?? $file->getBasename('.json'))),
                        'surface' => $surface,
                        'title' => sanitize_text_field((string) ($json['title'] ?? $file->getBasename('.json'))),
                        'summary' => sanitize_textarea_field((string) ($json['summary'] ?? '')),
                        'category' => sanitize_text_field((string) ($json['category'] ?? ucfirst($surface))),
                        'tags' => array_values(array_filter(array_map('sanitize_text_field', is_array($json['tags'] ?? null) ? $json['tags'] : []))),
                        'model' => sanitize_text_field((string) ($json['model'] ?? '')),
                        'aspect' => sanitize_text_field((string) ($json['aspect'] ?? '')),
                        'previewImageUrl' => esc_url_raw((string) ($json['previewImageUrl'] ?? '')),
                        'previewVideoUrl' => esc_url_raw((string) ($json['previewVideoUrl'] ?? '')),
                        'source' => is_array($json['source'] ?? null) ? $json['source'] : ['repo' => 'pixflow-design', 'license' => 'bundled'],
                    ];
                }
            }

            $templates = array_values($templates);
            usort($templates, static fn(array $a, array $b): int => strcmp((string) $a['title'], (string) $b['title']));

            return $templates;
        });
    }

    public function prompt_template(string $surface, string $id): ?array
    {
        $surface = sanitize_key(rawurldecode($surface));
        $id = sanitize_key(rawurldecode($id));
        if (!in_array($surface, ['image', 'video'], true) || $id === '') {
            return null;
        }

        foreach ($this->registry_roots('prompt-templates', PIXFLOW_DESIGN_PLUGIN_DIR . 'prompt-templates') as $root) {
            $path = $root . DIRECTORY_SEPARATOR . $surface . DIRECTORY_SEPARATOR . $id . '.json';
            if (!is_readable($path)) {
                continue;
            }

            $json = json_decode((string) file_get_contents($path), true);
            if (!is_array($json)) {
                continue;
            }

            return [
                'id' => sanitize_key((string) ($json['id'] ?? $id)),
                'surface' => $surface,
                'title' => sanitize_text_field((string) ($json['title'] ?? $id)),
                'summary' => sanitize_textarea_field((string) ($json['summary'] ?? '')),
                'category' => sanitize_text_field((string) ($json['category'] ?? ucfirst($surface))),
                'tags' => array_values(array_filter(array_map('sanitize_text_field', is_array($json['tags'] ?? null) ? $json['tags'] : []))),
                'model' => sanitize_text_field((string) ($json['model'] ?? '')),
                'aspect' => sanitize_text_field((string) ($json['aspect'] ?? '')),
                'previewImageUrl' => esc_url_raw((string) ($json['previewImageUrl'] ?? '')),
                'previewVideoUrl' => esc_url_raw((string) ($json['previewVideoUrl'] ?? '')),
                'source' => is_array($json['source'] ?? null) ? $json['source'] : ['repo' => 'pixflow-design', 'license' => 'bundled'],
                'prompt' => (string) ($json['prompt'] ?? ''),
            ];
        }

        return null;
    }

    public function plugins(): array
    {
        $plugins = $this->cached_registry_summary('plugins', function (): array {
            $roots = $this->registry_roots('plugins', PIXFLOW_DESIGN_PLUGIN_DIR . 'plugins');
            if ($roots === []) {
                return [];
            }

            $plugins = [];
            foreach ($roots as $root) {
                foreach ($this->plugin_manifest_paths($root) as $manifest_path) {
                    $record = $this->plugin_record_from_manifest($manifest_path, $root);
                    if ($record !== null) {
                        $plugins[(string) $record['id']] = $record;
                    }
                }
            }

            $plugins = array_values($plugins);
            usort($plugins, static fn(array $a, array $b): int => strcmp((string) $a['title'], (string) $b['title']));

            return $plugins;
        });
        $this->cache_plugin_asset_index($plugins);

        return $plugins;
    }

    public function plugin_summaries(): array
    {
        $summaries = $this->cached_registry_summary('plugins_summary_v3', function (): array {
            return array_map(fn(array $plugin): array => $this->plugin_summary($plugin), $this->discoverable_plugins());
        });
        // Builder availability is live state, never a cached catalogue property.
        return array_map(fn(array $plugin): array => $this->curated_plugin($plugin), $summaries);
    }

    /** Keep full records for saved selections, dependencies and asset URLs. */
    public function discoverable_plugins(): array
    {
        return array_map(fn(array $plugin): array => $this->curated_plugin($plugin), array_values(array_filter($this->plugins(), static fn(array $plugin): bool =>
            CatalogueCuration::discoverable('plugins', (string) ($plugin['id'] ?? ''))
        )));
    }

    public function plugin(string $id): ?array
    {
        $wanted_id = $this->plugin_id(rawurldecode($id));
        if ($wanted_id === '') {
            return null;
        }

        foreach ($this->plugins() as $plugin) {
            if ((string) ($plugin['id'] ?? '') === $wanted_id) {
                return $this->curated_plugin($plugin);
            }
        }

        return null;
    }

    /** Discovery and detail share the same product destination and reference copy. */
    private function curated_plugin(array $plugin): array
    {
        $id = (string) ($plugin['id'] ?? '');
        $destination = CatalogueCuration::pluginDestination($id);
        if ($destination === 'bricks' && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks') && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('etch') && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('elementor')) {
            unset($plugin['pixflowDestination']);
            return $plugin;
        }
        if ($id === 'example-web-prototype') {
            $plugin['manifest']['description'] = 'A flexible landing page reference with a clear hero, content sections and calls to action. Adapt its visual direction to the current builder page.';
        }
        return $destination === null ? $plugin : array_merge($plugin, ['pixflowDestination' => $destination]);
    }

    private function plugin_summary(array $plugin): array
    {
        $manifest = is_array($plugin['manifest'] ?? null) ? $plugin['manifest'] : [];
        $od = is_array($manifest['od'] ?? null) ? $manifest['od'] : [];
        $use_case = is_array($od['useCase'] ?? null) ? $od['useCase'] : [];
        $preview = is_array($od['preview'] ?? null) ? $od['preview'] : [];
        $baked_preview = is_array($od['bakedPreview'] ?? null) ? $od['bakedPreview'] : null;
        $summary_manifest = [
            'name' => $manifest['name'] ?? $plugin['id'] ?? '',
            'title' => $manifest['title'] ?? $plugin['title'] ?? '',
            'description' => $manifest['description'] ?? '',
            'version' => $manifest['version'] ?? $plugin['version'] ?? '',
            'category' => $manifest['category'] ?? '',
            'tags' => is_array($manifest['tags'] ?? null) ? array_values($manifest['tags']) : [],
            'od' => [
                'hidden' => $od['hidden'] ?? false,
                'mode' => $od['mode'] ?? null,
                'surface' => $od['surface'] ?? null,
                'kind' => $od['kind'] ?? null,
                'featured' => $od['featured'] ?? null,
                'preview' => [
                    'type' => $preview['type'] ?? null,
                    'entry' => $preview['entry'] ?? null,
                    'image' => $preview['image'] ?? null,
                    'poster' => $preview['poster'] ?? null,
                    'video' => $preview['video'] ?? null,
                    'gif' => $preview['gif'] ?? null,
                    'audio' => $preview['audio'] ?? null,
                    'holdMs' => $preview['holdMs'] ?? null,
                ],
                'bakedPreview' => $baked_preview,
                'useCase' => [
                    'query' => $this->plugin_summary_has_query($use_case['query'] ?? null) ? true : '',
                    'label' => $use_case['label'] ?? '',
                ],
            ],
        ];

        return [
            'id' => (string) ($plugin['id'] ?? ''),
            'title' => (string) ($plugin['title'] ?? ''),
            'version' => (string) ($plugin['version'] ?? ''),
            'sourceKind' => (string) ($plugin['sourceKind'] ?? 'bundled'),
            'source' => '',
            'sourceMarketplaceId' => $plugin['sourceMarketplaceId'] ?? null,
            'sourceMarketplaceEntryName' => $plugin['sourceMarketplaceEntryName'] ?? null,
            'sourceMarketplaceEntryVersion' => $plugin['sourceMarketplaceEntryVersion'] ?? null,
            'marketplaceTrust' => $plugin['marketplaceTrust'] ?? null,
            'resolvedSource' => null,
            'trust' => (string) ($plugin['trust'] ?? 'bundled'),
            'capabilitiesGranted' => [],
            'manifest' => $summary_manifest,
            'fsPath' => '',
            'pixflowAssetBaseUrl' => (string) ($plugin['pixflowAssetBaseUrl'] ?? ''),
            'installedAt' => (int) ($plugin['installedAt'] ?? 0),
            'updatedAt' => (int) ($plugin['updatedAt'] ?? 0),
            'pixflowSourceRoot' => '',
            'pixflowSummary' => true,
            'pixflowDestination' => $plugin['pixflowDestination'] ?? null,
        ];
    }

    private function plugin_summary_has_query(mixed $value): bool
    {
        if (is_string($value)) {
            return trim($value) !== '';
        }

        if (is_array($value)) {
            foreach ($value as $entry) {
                if ($this->plugin_summary_has_query($entry)) {
                    return true;
                }
            }
        }

        return false;
    }

    public function plugin_asset(string $id, string $relative_path): ?array
    {
        $index = $this->plugin_asset_index();
        $plugin = $index[$this->plugin_id(rawurldecode($id))] ?? null;
        if (!is_array($plugin)) {
            return null;
        }

        $path = $this->safe_plugin_asset_path((string) ($plugin['fsPath'] ?? ''), $relative_path);
        if ($path === null || !is_readable($path) || !is_file($path)) {
            return null;
        }

        $body = (string) file_get_contents($path);
        $mime = $this->asset_mime($path);
        if (str_starts_with($mime, 'text/html')) {
            $body = $this->rewrite_plugin_preview_html($body);
        }

        return [
            'path' => $path,
            'body' => $body,
            'mime' => $mime,
        ];
    }

    public function plugin_preview(string $id): ?array
    {
        $index = $this->plugin_asset_index();
        $plugin = $index[$this->plugin_id(rawurldecode($id))] ?? null;
        $entry = is_array($plugin) ? (string) ($plugin['previewEntry'] ?? '') : '';

        return $entry !== '' ? $this->plugin_asset($id, $entry) : null;
    }

    public function plugin_example(string $id, string $stem): ?array
    {
        $index = $this->plugin_asset_index();
        $plugin = $index[$this->plugin_id(rawurldecode($id))] ?? null;
        if (!is_array($plugin)) {
            return null;
        }

        $wanted_stem = sanitize_key(rawurldecode($stem));
        $outputs = $plugin['exampleOutputs'] ?? [];
        if (!is_array($outputs)) {
            return null;
        }

        foreach ($outputs as $output) {
            if (!is_array($output) || !is_string($output['path'] ?? null)) {
                continue;
            }
            $path = (string) $output['path'];
            $basename = basename(str_replace('\\', '/', $path));
            $candidate = sanitize_key((string) preg_replace('/\.[^.]+$/', '', $basename));
            if ($candidate === $wanted_stem) {
                return $this->plugin_asset($id, $path);
            }
        }

        return null;
    }

    public function marketplaces(): array
    {
        $plugins = $this->plugins();
        if ($plugins === []) {
            return [];
        }

        return [
            [
                'id' => 'pixflow-installed-resources',
                'url' => rest_url('pixflow-design/v1/od/plugins'),
                'trust' => 'official',
                'manifest' => [
                    'name' => 'Pixflow Design installed resources',
                    'plugins' => array_map(static function (array $plugin): array {
                        return [
                            'name' => (string) ($plugin['id'] ?? ''),
                            'source' => (string) ($plugin['source'] ?? ''),
                            'description' => (string) ($plugin['manifest']['description'] ?? ''),
                        ];
                    }, $plugins),
                ],
            ],
        ];
    }

    private function skill_summaries(string|array|null $root = null, string $fallback_mode = 'prototype', bool $template_skills = false): array
    {
        $roots = is_array($root)
            ? $root
            : $this->registry_roots('skills', $root ?: PIXFLOW_DESIGN_PLUGIN_DIR . 'skills');
        if ($roots === []) {
            return $fallback_mode === 'prototype' ? $this->prompt_skill_summaries() : [];
        }

        $skills = [];
        foreach ($roots as $scan_root) {
            foreach (new \DirectoryIterator($scan_root) as $entry) {
                if ($entry->isDot() || !$entry->isDir()) {
                    continue;
                }

                $skill_path = $entry->getPathname() . DIRECTORY_SEPARATOR . 'SKILL.md';
                if (!is_readable($skill_path)) {
                    continue;
                }

                if ($template_skills ? !CatalogueCuration::templateSkill($entry->getBasename())
                    : !CatalogueCuration::discoverable($fallback_mode === 'template' ? 'templates' : 'skills', $entry->getBasename())) {
                    continue;
                }

                $summary = $this->skill_summary_from_file($entry->getBasename(), $skill_path, $fallback_mode);
                if ($summary !== null) {
                    $skills[(string) $summary['id']] = $summary;
                }
            }
        }

        $skills = array_values($skills);
        usort($skills, static fn(array $a, array $b): int => strcmp((string) $a['name'], (string) $b['name']));

        return $skills ?: ($fallback_mode === 'prototype' ? $this->prompt_skill_summaries() : []);
    }

    private function skill_detail(string|array $root, string $id, string $fallback_mode, bool $template_skills = false): ?array
    {
        $roots = is_array($root) ? $root : [$root];
        $roots = array_values(array_filter($roots, 'is_dir'));
        if ($roots === []) {
            return null;
        }

        $wanted_id = sanitize_key(rawurldecode($id));
        if ($wanted_id === '') {
            return null;
        }

        // Current packages outrank preserved legacy bodies for executable skills.
        // Template history remains available for saved output references.
        if ($fallback_mode !== 'template') $roots = array_reverse($roots);
        foreach ($roots as $scan_root) {
            foreach (new \DirectoryIterator($scan_root) as $entry) {
                if ($entry->isDot() || !$entry->isDir()) {
                    continue;
                }

                if ($template_skills && !CatalogueCuration::templateSkill($entry->getBasename())) continue;

                $skill_path = $entry->getPathname() . DIRECTORY_SEPARATOR . 'SKILL.md';
                if (!is_readable($skill_path)) {
                    continue;
                }

                $summary = $this->skill_summary_from_file($entry->getBasename(), $skill_path, $fallback_mode);
                if ($summary === null || (string) ($summary['id'] ?? '') !== $wanted_id) {
                    continue;
                }
                if ($fallback_mode !== 'template' && !\PixflowDesign\WordPress\Modules\SkillAccess::skill_allowed($summary)) return null;

                return $summary + [
                    'body' => (string) file_get_contents($skill_path),
                ];
            }
        }

        return null;
    }

    private function registry_roots(string $registry, string $bundled_root): array
    {
        $bundled_root = \PixflowDesign\WordPress\Resources\BundledResources::root($registry);
        try { $legacy_root = \PixflowDesign\WordPress\Resources\BundledResources::legacy_root($registry); }
        catch (\RuntimeException $error) {
            if (!in_array($registry, ['skills', 'plugins'], true)) throw $error;
            $legacy_root = '';
        }
        $roots = array_values(array_filter([$legacy_root, $bundled_root], 'is_dir'));
        foreach (\PixflowDesign\WordPress\Modules\FeatureContributions::all() as $service) {
            try { $extra = isset($service['registryRoots']) ? ($service['registryRoots'])() : []; }
            catch (\RuntimeException $error) {
                if (!in_array($registry, ['skills', 'plugins'], true)) throw $error;
                continue;
            }
            if (isset($extra[$registry]) && is_dir($extra[$registry])) $roots[] = $extra[$registry];
        }

        try { $packs = $this->resource_packs->installed(); }
        catch (\RuntimeException $error) {
            if (!in_array($registry, ['skills', 'plugins'], true)) throw $error;
            $packs = [];
        }
        foreach ($packs as $pack) {
            if (!is_array($pack) || (string) ($pack['status'] ?? '') !== 'installed') {
                continue;
            }

            $base = (string) ($pack['path'] ?? '');
            $content_roots = is_array($pack['contentRoots'] ?? null) ? $pack['contentRoots'] : [];
            $relative = $content_roots[$registry] ?? null;
            if (!is_string($relative) || $relative === '') {
                continue;
            }

            if ($base === '' || preg_match('~[\\\\:]|(?:^|/)\.{1,2}(?:/|$)|^/~', $relative)) continue;
            $path = wp_normalize_path($base . DIRECTORY_SEPARATOR . $relative);
            if (is_dir($path)) {
                $roots[] = $path;
            }
        }

        // Keep old content addressable, but never resurrect old executable skills.
        if (in_array($registry, ['prompt-templates', 'design-templates', 'design-systems', 'plugins'], true)) {
            try { $history = \PixflowDesign\WordPress\Resources\BundledResources::historical_roots($registry); }
            catch (\RuntimeException $error) {
                if ($registry !== 'plugins') throw $error;
                $history = [];
            }
            // Plugin scans replace by ID; current routers must win over old bundles.
            $roots = $registry === 'plugins' ? array_merge($history, $roots) : array_merge($roots, $history);
        }

        return array_values(array_unique($roots));
    }

    private function cached_registry_summary(string $bucket, callable $producer): array
    {
        $cache_key = $this->registry_cache_key($bucket);
        $cached = get_transient($cache_key);
        if (is_array($cached)) {
            return $cached;
        }

        $value = $producer();
        if (!is_array($value)) {
            $value = [];
        }

        set_transient($cache_key, $value, self::REGISTRY_CACHE_TTL);

        return $value;
    }

    private function registry_cache_key(string $bucket): string
    {
        $bucket = sanitize_key($bucket);
        $version = defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : 'dev';

        return self::REGISTRY_CACHE_PREFIX . $bucket . '_' . md5($version . '|' . (\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks') ? 'bricks' : 'wordpress') . '|' . CatalogueCuration::revision() . '|' . \PixflowDesign\WordPress\Modules\SkillAccess::policy()['revision'] . '|' . (\PixflowDesign\WordPress\Modules\SkillAccess::available() ? 'pro' : 'free') . '|' . $this->resource_pack_fingerprint());
    }

    private function resource_pack_fingerprint(): string
    {
        try { $packs = $this->resource_packs->installed(); }
        catch (\RuntimeException) { return 'private-storage-unavailable'; }
        $pack_fingerprint = [];
        foreach ($packs as $slug => $pack) {
            if (!is_array($pack)) {
                continue;
            }
            $pack_fingerprint[(string) $slug] = [
                'status' => (string) ($pack['status'] ?? ''),
                'version' => (string) ($pack['version'] ?? ''),
                'path' => (string) ($pack['path'] ?? ''),
                'updatedAt' => (string) ($pack['updatedAt'] ?? ''),
            ];
        }

        return (string) wp_json_encode($pack_fingerprint);
    }

    private function plugin_manifest_paths(string $root): array
    {
        if (!is_dir($root)) {
            return [];
        }

        $paths = [];
        $queue = [[wp_normalize_path($root), 0]];
        $max_depth = 4;

        while ($queue !== []) {
            [$dir, $depth] = array_shift($queue);
            if (!is_dir($dir) || !is_readable($dir)) {
                continue;
            }

            $manifest_path = wp_normalize_path($dir . DIRECTORY_SEPARATOR . 'open-design.json');
            if (is_file($manifest_path) && is_readable($manifest_path)) {
                $paths[] = $manifest_path;
                continue;
            }

            if ($depth >= $max_depth) {
                continue;
            }

            foreach (new \DirectoryIterator($dir) as $entry) {
                if ($entry->isDot() || !$entry->isDir()) {
                    continue;
                }

                $name = $entry->getBasename();
                if ($name === 'node_modules' || $name === 'vendor' || $name === '.git') {
                    continue;
                }

                $queue[] = [wp_normalize_path($entry->getPathname()), $depth + 1];
            }
        }

        sort($paths);

        return $paths;
    }

    private function plugin_asset_index(): array
    {
        $cache_key = $this->plugin_asset_index_cache_key();
        $cached = get_transient($cache_key);
        if (is_array($cached)) {
            return $cached;
        }

        $plugins = $this->plugins();
        return $this->cache_plugin_asset_index($plugins);
    }

    private function cache_plugin_asset_index(array $plugins): array
    {
        $index = [];
        foreach ($plugins as $plugin) {
            if (!is_array($plugin)) {
                continue;
            }
            $id = (string) ($plugin['id'] ?? '');
            if ($id === '') {
                continue;
            }
            $manifest = is_array($plugin['manifest'] ?? null) ? $plugin['manifest'] : [];
            $index[$id] = [
                'fsPath' => (string) ($plugin['fsPath'] ?? ''),
                'previewEntry' => (string) ($manifest['od']['preview']['entry'] ?? ''),
                'exampleOutputs' => is_array($manifest['od']['useCase']['exampleOutputs'] ?? null)
                    ? $manifest['od']['useCase']['exampleOutputs']
                    : [],
            ];
        }

        set_transient($this->plugin_asset_index_cache_key(), $index, HOUR_IN_SECONDS);

        return $index;
    }

    private function plugin_asset_index_cache_key(): string
    {
        return self::PLUGIN_ASSET_INDEX_CACHE_PREFIX . md5((defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : 'dev') . '|' . $this->resource_pack_fingerprint());
    }

    private function plugin_record_from_manifest(string $manifest_path, string $scan_root): ?array
    {
        $json = json_decode((string) file_get_contents($manifest_path), true);
        if (!is_array($json)) {
            return null;
        }

        $id = $this->plugin_id((string) ($json['name'] ?? basename(dirname($manifest_path))));
        if ($id === '') {
            return null;
        }

        $folder = wp_normalize_path(dirname($manifest_path));
        $now = filemtime($manifest_path) ?: time();
        $source_kind = 'bundled';
        $trust = 'bundled';

        return $this->attach_baked_plugin_preview([
            'id' => $id,
            'title' => sanitize_text_field((string) ($json['title'] ?? $json['name'] ?? $id)),
            'version' => sanitize_text_field((string) ($json['version'] ?? '0.0.0')),
            'sourceKind' => $source_kind,
            'source' => $folder,
            'sourceMarketplaceId' => 'pixflow-installed-resources',
            'sourceMarketplaceEntryName' => $id,
            'sourceMarketplaceEntryVersion' => sanitize_text_field((string) ($json['version'] ?? '0.0.0')),
            'marketplaceTrust' => [
                'tier' => 'official',
                'notes' => 'Installed Pixflow Design resource.',
            ],
            'resolvedSource' => $folder,
            'trust' => $trust,
            'capabilitiesGranted' => array_values(array_filter(array_map(
                static fn($value): string => sanitize_text_field((string) $value),
                is_array($json['od']['capabilities'] ?? null) ? $json['od']['capabilities'] : []
            ))),
            'manifest' => $json,
            'fsPath' => $folder,
            'pixflowAssetBaseUrl' => '',
            'installedAt' => $now,
            'updatedAt' => $now,
            'pixflowSourceRoot' => wp_normalize_path($scan_root),
        ]);
    }

    private function attach_baked_plugin_preview(array $record): array
    {
        $id = (string) ($record['id'] ?? '');
        if ($id === '') {
            return $record;
        }

        $entry = $this->plugin_preview_bakes()[$id] ?? null;
        if (!is_array($entry)) {
            return $record;
        }

        $video = is_string($entry['video'] ?? null) ? trim((string) $entry['video']) : '';
        $poster = is_string($entry['poster'] ?? null) ? trim((string) $entry['poster']) : '';
        if ($video === '' || $poster === '') {
            return $record;
        }

        $base = $this->plugin_preview_bake_base_url();
        $baked = [
            'video' => $base . '/' . ltrim($video, '/'),
            'poster' => $base . '/' . ltrim($poster, '/'),
        ];

        if (is_numeric($entry['holdMs'] ?? null)) {
            $baked['holdMs'] = (int) $entry['holdMs'];
        }

        $manifest = is_array($record['manifest'] ?? null) ? $record['manifest'] : [];
        $od = is_array($manifest['od'] ?? null) ? $manifest['od'] : [];
        $od['bakedPreview'] = $baked;
        $manifest['od'] = $od;
        $record['manifest'] = $manifest;

        return $record;
    }

    /**
     * @return array<string, array{video?: string, poster?: string, holdMs?: int|float}>
     */
    private function plugin_preview_bakes(): array
    {
        if (is_array($this->plugin_preview_bakes)) {
            return $this->plugin_preview_bakes;
        }

        $path = PIXFLOW_DESIGN_PLUGIN_DIR . 'resources/plugin-previews/manifest.json';
        if (!is_readable($path)) {
            $this->plugin_preview_bakes = [];
            return $this->plugin_preview_bakes;
        }

        $json = json_decode((string) file_get_contents($path), true);
        $previews = is_array($json['previews'] ?? null) ? $json['previews'] : [];
        $this->plugin_preview_bakes = [];
        foreach ($previews as $id => $entry) {
            if (!is_string($id) || !is_array($entry)) {
                continue;
            }
            $safe_id = $this->plugin_id($id);
            if ($safe_id !== '') {
                $this->plugin_preview_bakes[$safe_id] = $entry;
            }
        }

        return $this->plugin_preview_bakes;
    }

    private function plugin_preview_bake_base_url(): string
    {
        $base = apply_filters('pixflow_design_plugin_preview_bake_base_url', self::PLUGIN_PREVIEW_BAKE_BASE_URL);
        $base = is_string($base) ? trim($base) : self::PLUGIN_PREVIEW_BAKE_BASE_URL;

        return rtrim($base !== '' ? $base : self::PLUGIN_PREVIEW_BAKE_BASE_URL, '/');
    }

    private function plugin_id(string $value): string
    {
        $value = strtolower(trim($value));
        $value = preg_replace('/[^a-z0-9._-]+/', '-', $value);
        $value = is_string($value) ? trim($value, '.-_') : '';

        return $value !== '' ? $value : '';
    }

    private function safe_plugin_asset_path(string $plugin_root, string $relative_path): ?string
    {
        $plugin_root = wp_normalize_path($plugin_root);
        if ($plugin_root === '' || !is_dir($plugin_root)) {
            return null;
        }

        $relative_path = rawurldecode($relative_path);
        // Resource manifests conventionally use ./examples/index.html.
        $relative_path = preg_replace('~^(?:\./)+~', '', $relative_path) ?? '';
        if (preg_match('~[\\x00-\\x1f:]|^[/\\\\]|(?:^|[/\\\\])\\.{1,2}(?:[/\\\\]|$)~', $relative_path)) return null;
        $segments = preg_split('#[\\\\/]+#', $relative_path) ?: [];
        $path = $plugin_root;
        foreach ($segments as $segment) {
            if ($segment === '' || rtrim($segment, '. ') !== $segment) return null;
            $path .= '/' . $segment;
            if (is_link($path)) return null;
        }
        $resolved = realpath($path);
        $base = realpath($plugin_root);
        if ($resolved === false || $base === false || is_link($plugin_root)) return null;
        $resolved = wp_normalize_path($resolved);
        return str_starts_with($resolved, trailingslashit(wp_normalize_path($base))) ? $resolved : null;
    }

    private function rewrite_plugin_preview_html(string $body): string
    {
        // Older OD examples sometimes store optimizer params as
        // `asset.webp&amp;w=1280&amp;q=85`, which browsers request as a
        // literal filename and the remote asset host returns 404. Convert the
        // first ampersand after a media extension into a real query delimiter.
        $body = preg_replace(
            '#(https://plugin-assets\.open-design\.ai/plugins/[^"\'\s)<]+?\.(?:webp|png|jpe?g|gif|svg|mp4|webm))(?:&amp;|&)([A-Za-z0-9_-]+=)#i',
            '$1?$2',
            $body
        ) ?? $body;

        // The same files can also contain bridge-era root-relative asset URLs.
        // Keep them working when served from WordPress REST iframe previews.
        return preg_replace_callback(
            '#(?<=["\'(])(/plugins/[^"\'\s)<]+?\.(?:webp|png|jpe?g|gif|svg|mp4|webm))(?:(?:&amp;|&)([A-Za-z0-9_-]+=))?#i',
            static function (array $match): string {
                $url = 'https://plugin-assets.open-design.ai' . (string) $match[1];
                if (isset($match[2]) && is_string($match[2]) && $match[2] !== '') {
                    $url .= '?' . $match[2];
                }

                return $url;
            },
            $body
        ) ?? $body;
    }

    private function asset_mime(string $path): string
    {
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        return match ($extension) {
            'html', 'htm' => 'text/html; charset=utf-8',
            'css' => 'text/css; charset=utf-8',
            'js', 'mjs' => 'text/javascript; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'svg' => 'image/svg+xml',
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            default => 'text/plain; charset=utf-8',
        };
    }

    private function skill_summary_from_file(string $fallback_id, string $path, string $fallback_mode): ?array
    {
        $body = file_get_contents($path);
        if (!is_string($body) || $body === '') {
            return null;
        }

        $frontmatter = $this->frontmatter($body);
        $id = sanitize_key((string) ($frontmatter['name'] ?? $fallback_id));
        if ($id === '') {
            $id = sanitize_key($fallback_id);
        }

        $mode = (string) ($frontmatter['od.mode'] ?? $frontmatter['mode'] ?? $fallback_mode);
        if (!in_array($mode, ['prototype', 'deck', 'template', 'design-system', 'image', 'video', 'audio'], true)) {
            $mode = $fallback_mode;
        }

        $surface = (string) ($frontmatter['od.surface'] ?? $frontmatter['surface'] ?? ($mode === 'template' ? 'web' : 'web'));
        if (!in_array($surface, ['web', 'image', 'video', 'audio'], true)) {
            $surface = 'web';
        }

        return [
            'id' => $id,
            'name' => $id,
            'description' => (string) ($frontmatter['description'] ?? $this->first_markdown_paragraph($body)),
            'triggers' => $this->frontmatter_list($frontmatter['triggers'] ?? []),
            'mode' => $mode,
            'surface' => $surface,
            'platform' => null,
            'scenario' => null,
            'category' => (string) ($frontmatter['od.category'] ?? $frontmatter['category'] ?? ''),
            'source' => 'built-in',
            'previewType' => (string) ($frontmatter['od.preview.type'] ?? 'none'),
            'designSystemRequired' => $this->truthy($frontmatter['od.design_system.requires'] ?? false),
            'defaultFor' => [],
            'upstream' => (string) ($frontmatter['od.upstream'] ?? $frontmatter['upstream'] ?? ''),
            'featured' => null,
            'fidelity' => null,
            'speakerNotes' => null,
            'animations' => null,
            'craftRequires' => $this->frontmatter_list($frontmatter['od.craft.requires'] ?? []),
            'hasBody' => true,
            'examplePrompt' => (string) ($frontmatter['od.example_prompt'] ?? ''),
            'aggregatesExamples' => false,
        ];
    }

    private function prompt_skill_summaries(): array
    {
        return array_map(static function (array $skill): array {
            return [
                'id' => (string) ($skill['id'] ?? ''),
                'name' => (string) ($skill['id'] ?? ''),
                'description' => (string) ($skill['instruction'] ?? ''),
                'triggers' => [(string) ($skill['command'] ?? '')],
                'mode' => 'prototype',
                'surface' => 'web',
                'platform' => null,
                'scenario' => null,
                'category' => 'bricks-agent',
                'source' => 'built-in',
                'previewType' => 'none',
                'designSystemRequired' => false,
                'defaultFor' => [],
                'upstream' => null,
                'featured' => null,
                'fidelity' => null,
                'speakerNotes' => null,
                'animations' => null,
                'craftRequires' => [],
                'hasBody' => true,
                'examplePrompt' => '',
                'aggregatesExamples' => false,
            ];
        }, $this->prompt_skills->all());
    }

    private function frontmatter(string $body): array
    {
        if (!preg_match('/^---\s*(.*?)\s*---/s', $body, $matches)) {
            return [];
        }

        $lines = preg_split('/\R/', (string) $matches[1]) ?: [];
        $data = [];
        $current_key = '';
        $current_block = [];

        foreach ($lines as $line) {
            if (preg_match('/^([A-Za-z0-9_.-]+):\s*(.*)$/', $line, $match)) {
                if ($current_key !== '') {
                    $data[$current_key] = trim(implode("\n", $current_block));
                    $current_key = '';
                    $current_block = [];
                }
                $key = (string) $match[1];
                $value = trim((string) $match[2]);
                if ($value === '|') {
                    $current_key = $key;
                    continue;
                }
                $data[$key] = $this->parse_frontmatter_value($value);
                continue;
            }

            if ($current_key !== '') {
                $current_block[] = preg_replace('/^\s{2}/', '', $line);
                continue;
            }

            if (preg_match('/^\s+([A-Za-z0-9_.-]+):\s*(.*)$/', $line, $nested_match)) {
                $data[(string) $nested_match[1]] = $this->parse_frontmatter_value(trim((string) $nested_match[2]));
            }
        }

        if ($current_key !== '') {
            $data[$current_key] = trim(implode("\n", $current_block));
        }

        foreach ($data as $key => $value) {
            if (is_string($key) && str_starts_with($key, 'od.')) {
                continue;
            }
            if ($key === 'mode') {
                $data['od.mode'] = $value;
            }
        }

        if (preg_match('/od:\s*(.*?)(?:\n\S|\z)/s', (string) $matches[1], $od_match)) {
            $od = (string) $od_match[1];
            foreach (['mode', 'category', 'example_prompt', 'upstream'] as $key) {
                if (preg_match('/^\s+' . preg_quote($key, '/') . ':\s*(.+)$/m', $od, $match)) {
                    $data['od.' . $key] = $this->parse_frontmatter_value(trim((string) $match[1]));
                }
            }
            if (preg_match('/craft:\s*\R\s+requires:\s*(\[[^\]]*\])/s', $od, $match)) {
                $data['od.craft.requires'] = $this->parse_frontmatter_value((string) $match[1]);
            }
            if (preg_match('/design_system:\s*\R\s+requires:\s*(true|false|1|0)/s', $od, $match)) {
                $data['od.design_system.requires'] = $this->parse_frontmatter_value((string) $match[1]);
            }
            if (preg_match('/preview:\s*\R\s+type:\s*(.+)$/m', $od, $match)) {
                $data['od.preview.type'] = $this->parse_frontmatter_value(trim((string) $match[1]));
            }
        }

        return $data;
    }

    private function parse_frontmatter_value(string $value): mixed
    {
        $value = trim($value, " \t\n\r\0\x0B\"'");
        if ($value === 'true') {
            return true;
        }
        if ($value === 'false') {
            return false;
        }
        if (str_starts_with($value, '[') && str_ends_with($value, ']')) {
            $items = array_map(static fn(string $item): string => trim($item, " \t\n\r\0\x0B\"'"), explode(',', trim($value, '[]')));
            return array_values(array_filter($items, static fn(string $item): bool => $item !== ''));
        }

        return $value;
    }

    private function frontmatter_list(mixed $value): array
    {
        if (is_array($value)) {
            return array_values(array_filter(array_map(static fn($item): string => sanitize_text_field((string) $item), $value)));
        }

        $value = trim((string) $value);
        return $value === '' ? [] : [sanitize_text_field($value)];
    }

    private function truthy(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on'], true);
    }

    private function first_markdown_paragraph(string $body): string
    {
        $body = preg_replace('/^---\s*.*?\s*---/s', '', $body) ?? $body;
        $paragraphs = preg_split('/\R{2,}/', trim($body)) ?: [];
        foreach ($paragraphs as $paragraph) {
            $paragraph = trim(preg_replace('/^#+\s+.*/m', '', $paragraph) ?? '');
            $paragraph = trim(preg_replace('/^>\s?/m', '', $paragraph) ?? '');
            if ($paragraph !== '' && !str_starts_with($paragraph, '```')) {
                return sanitize_textarea_field($paragraph);
            }
        }

        return '';
    }

    private function title_from_markdown(string $body): string
    {
        if (preg_match('/^#\s+(.+)$/m', $body, $match)) {
            return sanitize_text_field((string) $match[1]);
        }

        return '';
    }

    private function css_color_swatches(string $css): array
    {
        if ($css === '') {
            return [];
        }

        preg_match_all('/#[0-9a-fA-F]{6}\b/', $css, $matches);
        return array_values(array_slice(array_unique(array_map('strtolower', $matches[0] ?? [])), 0, 8));
    }
}
