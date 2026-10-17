<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** Pixflow image creation belongs to Pro; existing media remains usable in Free. */
final class ImageGenerationAccess
{
    public static function available(): bool { return FeatureContributions::available('assets'); }
    public static function skill_allowed(array $skill): bool
    {
        if (self::available()) return true;
        $id = (string) ($skill['id'] ?? $skill['name'] ?? '');
        return ($skill['category'] ?? '') !== 'image-generation'
            && !preg_match('/^(?:imagegen(?:-|$)|imagen$|venice-image-|fal-(?:generate|image-edit|tryon|restore|upscale)$)/', $id);
    }
    public static function reference_allowed(string $path): bool
    {
        if (self::available()) return true;
        // Apply the owning skill policy to its nested guides/scripts as well.
        $dir = is_dir($path) ? $path : dirname($path);
        while ($dir !== dirname($dir)) {
            $manifest = $dir . '/SKILL.md';
            if (is_file($manifest)) {
                $source = (string) file_get_contents($manifest);
                preg_match('/^name:\s*[\x22\x27]?([^\r\n\x22\x27]+)/m', $source, $name);
                preg_match('/^\s*category:\s*[\x22\x27]?([^\r\n\x22\x27]+)/m', $source, $category);
                return self::skill_allowed(['id' => trim($name[1] ?? basename($dir)), 'category' => trim($category[1] ?? '')]);
            }
            $dir = dirname($dir);
        }
        return true;
    }
}
