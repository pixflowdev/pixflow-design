<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin;
use PixflowDesign\WordPress\Modules\SkillAccess;
if (!defined('ABSPATH')) exit;

/** Source references for explicit mentions; the full catalog remains available. */
final class DirectSkillCatalog
{
    public function call(string $tool, array $args): array
    {
        $personal = \PixflowDesign\WordPress\Modules\PersonalSkills::all();
        $plugin = rtrim(PIXFLOW_DESIGN_PLUGIN_DIR, '/\\');
        $bundled = is_dir($plugin . '/skills') ? $plugin . '/skills' : dirname($plugin) . '/skills';
        if (is_dir($plugin . '/resources/bundled-skills') || is_file($plugin . '/resources/bundled-library.zip')) $bundled = \PixflowDesign\WordPress\Resources\BundledResources::root('skills');
        $roots = \PixflowDesign\WordPress\Modules\BuilderIntegrations::skill_roots() + \PixflowDesign\WordPress\Modules\FeatureContributions::skill_roots() + ['' => $plugin . '/resources/mcp-skills', 'bundled/' => $bundled];
        foreach (\PixflowDesign\WordPress\Modules\FeatureContributions::all() as $service) {
            if (isset($service['bundledSkillRoot'])) {
                try { $roots['bundled-pro/'] = ($service['bundledSkillRoot'])(); }
                catch (\RuntimeException) { /* Private Pro references remain unavailable; native and Free guidance still work. */ }
            }
        }
        if ($tool === 'skills.read') {
            if (isset($args['paths']) && is_array($args['paths'])) {
                $results = [];
                foreach (array_unique($args['paths']) as $path) {
                    try { $results[] = ['path' => $path] + $this->call('skills.read', ['path' => $path]); }
                    catch (\Throwable $error) { $results[] = ['path' => $path, 'error' => $error->getMessage()]; }
                }
                return ['references' => $results];
            }
            $path = str_replace('\\', '/', (string) ($args['path'] ?? ''));
            if ((str_starts_with($path, 'advanced-admin/') || str_starts_with($path, 'wp-admin/code-projects/') || $path === 'wp-admin/core/plugin-source.md') && !\PixflowDesign\WordPress\Modules\AdvancedSiteAccess::available()) return \PixflowDesign\WordPress\Modules\AdvancedSiteAccess::not_allowed();
            // References saved in older chats retain their IDs after a Pro
            // extraction. Only currently authorised contributions supply aliases.
            foreach (\PixflowDesign\WordPress\Modules\FeatureContributions::all() as $service) {
                foreach (($service['referenceAliases'] ?? []) as $old => $replacement) {
                    if ($path === $old || (str_ends_with($old, '/') && str_starts_with($path, $old))) {
                        $path = $replacement . substr($path, strlen($old));
                        break 2;
                    }
                }
            }
            if (str_starts_with($path, 'library/')) {
                $parts = explode('/', substr($path, 8), 2);
                return \PixflowDesign\WordPress\Modules\OfficialSkills::call('read', ['id'=>$parts[0], 'path'=>$parts[1] ?? 'SKILL.md']);
            }
            if (preg_match('~^bundled(?:-pro)?/([^/]+)(?:/|$)~', $path, $match)) {
                if (!SkillAccess::skill_allowed(['id' => $match[1]])) throw new \RuntimeException(SkillAccess::unavailable_message($match[1]));
                $entry = SkillAccess::entry($match[1]);
                if (($entry['status'] ?? '') === 'alias') {
                    if (!preg_match('~^bundled(?:-pro)?/[^/]+/SKILL\.md$~', $path)) throw new \RuntimeException('This old supporting reference is unavailable. Read the replacement SKILL.md first.');
                    $target = SkillAccess::canonical($match[1]);
                    $path = 'bundled/' . $target['folder'] . '/SKILL.md';
                    $match[1] = $target['folder'];
                }
                // Old conversations keep their bundled/ references after extraction.
                if (isset($roots['bundled-pro/']) && is_dir($roots['bundled-pro/'] . '/' . $match[1])) $path = preg_replace('~^bundled/~', 'bundled-pro/', $path);
            }
            if (str_starts_with($path, 'personal/')) {
                $id = substr($path, strlen('personal/'), -strlen('/SKILL.md'));
                if ($path !== 'personal/' . $id . '/SKILL.md' || !isset($personal[$id])) throw new \RuntimeException('Personal skill not found.');
                return ['content' => $personal[$id]['body']];
            }
            $prefix = '';
            foreach (array_keys($roots) as $candidate) if ($candidate !== '' && str_starts_with($path, $candidate) && strlen($candidate) > strlen($prefix)) $prefix = $candidate;
            $absolute = (new DirectSiteWorkspace())->resolve_path(substr($path, strlen($prefix)), $roots[$prefix]);
            if (!\PixflowDesign\WordPress\Modules\SkillAccess::reference_allowed($absolute)) throw new \RuntimeException('This skill requires Pixflow Design Pro.');
            if (!\PixflowDesign\WordPress\Modules\ImageGenerationAccess::reference_allowed($absolute)) throw new \RuntimeException('Image generation skills require Pixflow Design Pro.');
            if (!$this->available_path($path)) throw new \RuntimeException('This skill belongs to an inactive integration.');
            if (!is_file($absolute) || !is_readable($absolute)) throw new \RuntimeException('Skill reference not found.');
            $content = file_get_contents($absolute);
            if ($content === false) throw new \RuntimeException('Cannot read skill.');
            return ['content' => $content];
        }
        $entries = [];
        foreach ($roots as $prefix => $root) {
            if (!is_dir($root)) continue;
            $metadata = [];
            $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
            foreach ($iterator as $file) {
                if (!$file->isFile() || $file->isLink() || $file->getFilename() !== 'manifest.php' || $prefix === 'bundled/') continue;
                $manifest = (static fn(string $path): mixed => require $path)($file->getPathname());
                foreach ((array) $manifest as $item) {
                    if (!is_array($item) || empty($item['file'])) continue;
                    $target = realpath($file->getPath() . '/' . $item['file']);
                    if ($target !== false) $metadata[$target][] = $item;
                }
            }
            foreach ($iterator as $file) {
                if (!$file->isFile() || $file->isLink() || strtolower($file->getExtension()) !== 'md') continue;
                $path = $prefix . str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));
                if (!$this->available_path($path) || !\PixflowDesign\WordPress\Modules\SkillAccess::reference_allowed($file->getPathname()) || !\PixflowDesign\WordPress\Modules\ImageGenerationAccess::reference_allowed($file->getPathname())) continue;
                $source = (string) file_get_contents($file->getPathname());
                $items = $metadata[$file->getRealPath()] ?? [];
                $item = $items[0] ?? [];
                preg_match('/^# (.+)$/m', $source, $heading);
                preg_match('/^name:\s*["\']?(.+?)["\']?\r?$/m', $source, $name);
                preg_match('/^description:\s*["\']?(.+?)["\']?\r?$/m', $source, $description);
                $id = (string) ($item['id'] ?? ($file->getFilename() === 'SKILL.md' ? ($name[1] ?? basename($file->getPath())) : ''));
                $entries[] = ['id' => $id, 'ids' => array_values(array_unique(array_merge([$id], array_column($items, 'id')))),
                    'path' => $path, 'title' => trim((string) ($item['name'] ?? $heading[1] ?? basename($path, '.md'))),
                    'description' => trim((string) ($item['description'] ?? $description[1] ?? ''))];
            }
        }
        foreach (\PixflowDesign\WordPress\Modules\OfficialSkills::call('list') as $skill) {
            $entries[] = ['id'=>$skill['id'], 'ids'=>[$skill['id']], 'path'=>'library/'.$skill['id'].'/SKILL.md', 'title'=>$skill['name'], 'description'=>$skill['description']];
        }
        $entries = array_values(array_filter($entries, static fn(array $entry): bool => !isset($personal[$entry['id']])));
        foreach ($personal as $skill) {
            $entries[] = ['id' => $skill['id'], 'ids' => [$skill['id']], 'path' => 'personal/' . $skill['id'] . '/SKILL.md',
                'title' => $skill['name'], 'description' => $skill['description']];
        }
        usort($entries, static fn(array $a, array $b): int => strcmp($a['path'], $b['path']));
        $relationships = (new \PixflowDesign\WordPress\Mcp\PromptSkillCatalog())->relationships();
        // Public shortcuts without a relationship graph point at their owning reference.
        $aliases = ['online-research' => ['wordpress-online-research'], 'wordpress-content' => ['wordpress-admin-content'], 'wordpress-source' => ['wp-admin-code-projects']];
        foreach (\PixflowDesign\WordPress\Modules\BuilderIntegrations::all() as $definition) $aliases += $definition['skillAliases'] ?? [];
        $mentions = [];
        foreach ((array) ($args['ids'] ?? []) as $raw) {
            if (!is_string($raw)) continue;
            $id = str_starts_with($raw, 'skill:') ? substr($raw, 6) : $raw;
            $originalId = $id;
            if (\PixflowDesign\WordPress\Modules\OfficialSkills::owns($id)) {
                try {
                    $pinned = \PixflowDesign\WordPress\Modules\OfficialSkills::call('read', ['id'=>$id]);
                    $mentions[] = ['id'=>$raw, 'paths'=>['library/'.$pinned['id'].'/SKILL.md']];
                } catch (\Throwable $e) { $mentions[] = ['id'=>$raw, 'paths'=>[], 'error'=>$e->getMessage()]; }
                continue;
            }
            if (!isset($personal[$id]) && SkillAccess::skill_allowed(['id' => $id])) $id = SkillAccess::canonical($id)['id'] ?? $id;
            $related = array_unique(array_merge([$id], $aliases[$id] ?? [], $relationships[$id] ?? []));
            $paths = array_values(array_column(array_filter($entries, static fn(array $entry): bool => array_intersect($entry['ids'], $related) !== []), 'path'));
            $mention = ['id' => $raw, 'paths' => $paths];
            if (!$paths && SkillAccess::entry($originalId) !== null && !SkillAccess::skill_allowed(['id' => $originalId])) $mention['error'] = SkillAccess::unavailable_message($originalId);
            $mentions[] = $mention;
        }
        $query = trim((string) ($args['query'] ?? ''));
        if ($query !== '') {
            // Search words independently: skill IDs and paths use separators,
            // whereas users and agents normally search with natural spaces.
            $terms = preg_split('/\s+/u', $query, -1, PREG_SPLIT_NO_EMPTY) ?: [$query];
            $ranked = [];
            foreach ($entries as $entry) {
                $text = implode(' ', array_merge([$entry['path'], $entry['title'], $entry['description']], $entry['ids']));
                $score = count(array_filter($terms, static fn(string $term): bool => stripos($text, $term) !== false));
                if ($score > 0) $ranked[] = ['score'=>$score, 'entry'=>$entry];
            }
            usort($ranked, static fn(array $a, array $b): int => ($b['score'] <=> $a['score']) ?: strcmp($a['entry']['path'], $b['entry']['path']));
            $best = $ranked[0]['score'] ?? 0;
            $entries = array_column(array_filter($ranked, static fn(array $row): bool => $row['score'] === $best), 'entry');
        }
        return ['paths' => array_column($entries, 'path'), 'skills' => $entries, 'mentions' => $mentions];
    }
    private function available_path(string $path): bool
    {
        if (str_starts_with(str_replace('\\', '/', $path), 'elementor/') && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('elementor')) return false;
        if (str_starts_with(str_replace('\\', '/', $path), 'etch/') && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('etch')) return false;
        if (\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks')) return true;
        $path = str_replace('\\', '/', $path);
        return !str_starts_with($path, 'bricks/');
    }
}
