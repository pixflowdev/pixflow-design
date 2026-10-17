<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** Package ownership, independent of discovery curation and cached catalogues. */
final class SkillAccess
{
    public static function policy(): array
    {
        static $policy;
        return $policy ??= json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/resources/skill-editions.json'), true, 512, JSON_THROW_ON_ERROR);
    }
    public static function available(): bool { return FeatureContributions::available('creative-skills'); }
    public static function entry(string $id): ?array
    {
        foreach (self::policy()['skills'] as $entry) {
            if ($entry['id'] === $id || $entry['folder'] === $id) return $entry;
        }
        return null;
    }
    /** Only explicit, one-hop, same-edition aliases may resolve packaged instructions. */
    public static function canonical(string $id): ?array
    {
        $entry = self::entry($id);
        if ($entry === null) return null;
        if (($entry['status'] ?? 'bundled') === 'alias') {
            $target = self::entry((string) ($entry['aliasOf'] ?? ''));
            if ($target === null || $target['edition'] !== $entry['edition'] || ($target['status'] ?? '') !== 'bundled') return null;
            return $target;
        }
        return ($entry['status'] ?? 'bundled') === 'bundled' ? $entry : null;
    }
    public static function listed(string $id): bool
    {
        $entry = self::entry($id);
        return $entry === null || ($entry['status'] ?? 'bundled') === 'bundled';
    }
    public static function unavailable_message(string $id): string
    {
        return self::entry($id) !== null && self::canonical($id) === null
            ? 'This bundled skill is retired and is no longer available. Existing content and personal skills are unchanged.'
            : 'This skill requires Pixflow Design Pro.';
    }
    public static function skill_allowed(array $skill): bool
    {
        $id = (string) ($skill['id'] ?? $skill['name'] ?? '');
        if ($id === 'composio' && !ComposioAccess::available()) return false;
        if (self::entry($id) === null) return true; // Native and personal skills retain their own boundaries.
        $entry = self::canonical($id);
        return $entry !== null && ($entry['edition'] !== 'pro' || self::available());
    }
    public static function reference_allowed(string $path): bool
    {
        $dir = is_dir($path) ? $path : dirname($path);
        while ($dir !== dirname($dir)) {
            if (is_file($dir . '/SKILL.md')) {
                $id = self::reference_skill_id($dir . '/SKILL.md', basename($dir));
                return self::listed($id) && self::skill_allowed(['id' => $id]);
            }
            $dir = dirname($dir);
        }
        return true;
    }
    /** Native references use their declared identity; legacy skills may use their folder. */
    private static function reference_skill_id(string $manifest, string $fallback): string
    {
        $source = (string) file_get_contents($manifest);
        if (preg_match('/\A---\R([\s\S]*?)\R---(?:\R|$)/', $source, $frontmatter)
            && preg_match('/^name:\s*[\x22\x27]?([^\r\n\x22\x27]+)/m', $frontmatter[1], $name)) {
            $id = trim($name[1]);
            if ($id !== '') return $id;
        }
        return $fallback;
    }
    /** Labels only: no instructions, source paths, scripts or automatic selection. */
    public static function locked_skills(): array
    {
        if (self::available()) return [];
        $items = [];
        foreach (self::policy()['skills'] as $entry) {
            if ($entry['edition'] !== 'pro' || !$entry['discoverable'] || !self::listed($entry['id'])) continue;
            $items[] = ['id' => $entry['id'], 'name' => $entry['label'], 'description' => $entry['description'], 'requiresPro' => true];
        }
        return $items;
    }
}
