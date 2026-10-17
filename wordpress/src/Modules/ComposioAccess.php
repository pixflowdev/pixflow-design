<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** Optional Pro dispatch only. Saved accounts and credentials are never migrated or deleted here. */
final class ComposioAccess
{
    public static function available(): bool { return FeatureContributions::available('composio'); }
    private static function service(string $name): callable
    {
        $service = FeatureContributions::all()['composio'][$name] ?? null;
        if (!is_callable($service)) throw new \RuntimeException('Composio requires an active Pixflow Design Pro add-on.');
        return $service;
    }
    public static function configured(): bool
    {
        return self::available() && (self::service('status')()['configured'] ?? false) === true;
    }
    public static function call(string $tool, array $args, bool $writable): mixed
    {
        return self::service('appCall')($tool, $args, $writable);
    }
    public static function summarize(array $input, string $system, string $text): string
    {
        return self::service('summarize')($input, $system, $text);
    }
}
