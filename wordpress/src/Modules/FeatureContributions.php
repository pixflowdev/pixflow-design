<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** Optional feature implementations. Absence never deletes saved content. */
final class FeatureContributions
{
    private static ?\Closure $authorize = null;
    public static function authorize_using(\Closure $authorize): void { self::$authorize = $authorize; }
    private static function authorized(): bool { return self::$authorize === null || (self::$authorize)(); }
    private static array $features = [];
    private static array $services = [];
    public static function add(string $id, callable $enqueue, array $services = []): void
    {
        if (!preg_match('/^[a-z][a-z0-9-]*$/D', $id) || isset(self::$features[$id])) throw new \LogicException('Invalid or duplicate feature.');
        self::$features[$id] = $enqueue;
        self::$services[$id] = $services;
    }
    public static function all(): array { return self::authorized() ? self::$services : []; }
    public static function skill_roots(): array
    {
        $roots = [];
        foreach (self::all() as $service) $roots += $service['skillRoots'] ?? [];
        return $roots;
    }
    public static function catalogue(): array
    {
        $tools = [];
        foreach (self::all() as $service) $tools += $service['tools'] ?? [];
        return $tools;
    }
    public static function call(string $tool, array $args): mixed
    {
        foreach (self::all() as $service) if (isset($service['tools'][$tool], $service['call'])) return ($service['call'])($tool, $args);
        throw new \RuntimeException('This operation requires an active Pixflow Design Pro feature.');
    }
    public static function available(string $id): bool { return isset(self::$features[$id]) && self::authorized(); }
    public static function enqueue(): array { return array_values(array_filter(array_map(static fn(callable $callback): string => $callback(), array_values(self::authorized() ? self::$features : [])), static fn(string $handle): bool => $handle !== '')); }
}
