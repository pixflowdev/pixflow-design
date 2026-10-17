<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** Optional Pro library resolver. Downloaded files never enter PHP manifest scanners. */
final class OfficialSkills
{
    private static ?\Closure $resolver = null;
    public static function register(\Closure $resolver): void { self::$resolver = $resolver; }
    public static function owns(string $id): bool { return str_starts_with($id, 'pixflow-library-'); }
    public static function call(string $action, array $args = []): array
    {
        if (self::$resolver === null || !SkillAccess::available()) {
            if ($action === 'list') return [];
            throw new \RuntimeException('This library skill requires active Pixflow Design Pro. Your message and installed files are preserved.');
        }
        return (self::$resolver)($action, $args);
    }
}
