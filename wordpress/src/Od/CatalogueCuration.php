<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\Od;

/** Product discovery curation; never an authorization boundary or agent skill allowlist. */
final class CatalogueCuration
{
    private static ?array $policy = null;

    private static function policy(): array
    {
        if (self::$policy === null) {
            $raw = file_get_contents(__DIR__ . '/../../resources/catalogue-curation.json');
            self::$policy = is_string($raw) ? (json_decode($raw, true) ?: []) : [];
        }
        return self::$policy;
    }

    public static function revision(): string
    {
        return 'skill-cleanup-v1:' . (string) (self::policy()['revision'] ?? 'uncurated');
    }

    public static function discoverable(string $collection, string $id): bool
    {
        // Saved selections still resolve through plugin(); only discovery is retired.
        if ($collection === 'plugins') return false;
        if ($collection === 'skills' && self::templateSkill($id)) return false;
        if ($collection === 'skills') {
            $entry = \PixflowDesign\WordPress\Modules\SkillAccess::entry($id);
            if ($entry !== null) return ($entry['status'] ?? 'bundled') === 'bundled' && $entry['discoverable'];
        }
        $key = ['skills' => 'hiddenSkills', 'templates' => 'hiddenTemplates', 'plugins' => 'hiddenPlugins'][$collection] ?? '';
        return !isset(self::policy()[$key][$id]);
    }

    public static function pluginDestination(string $id): ?string
    {
        $destination = self::policy()['pluginDestinations'][$id] ?? null;
        return in_array($destination, ['bricks', 'media'], true) ? $destination : null;
    }

    public static function templateSkill(string $folder): bool
    {
        return isset(self::policy()['templateSkills'][$folder]);
    }
}
