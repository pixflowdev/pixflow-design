<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** Optional instructions: absence never deletes the saved per-user library. */
final class PersonalSkills
{
    public static function all(): array
    {
        $read = FeatureContributions::all()['custom-skills']['personalSkills'] ?? null;
        return $read ? $read() : [];
    }
    public static function save(array $input, ?string $id = null): array
    {
        return (self::handler('saveSkill'))($input, $id);
    }
    public static function delete(string $id): void { (self::handler('deleteSkill'))($id); }
    private static function handler(string $name): callable
    {
        $handler = FeatureContributions::all()['custom-skills'][$name] ?? null;
        if (!$handler) throw new \RuntimeException('Custom skills require Pixflow Design Pro. Saved skills are preserved.');
        return $handler;
    }
}
