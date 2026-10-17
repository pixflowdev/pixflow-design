<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** Request-local contributions from separately packaged builder modules.
 * Saved content is never removed when a contribution is unavailable.
 * Registration is not authorization: normal REST capabilities still apply.
 */
final class BuilderIntegrations
{
    private static ?\Closure $authorize = null;
    public static function authorize_using(\Closure $authorize): void { self::$authorize = $authorize; }
    private static function authorized(): bool { return self::$authorize === null || (self::$authorize)(); }
    private static array $builders = [];

    public static function add(string $id, array $definition): void
    {
        if (!preg_match('/^[a-z][a-z0-9-]*$/D', $id) || isset(self::$builders[$id])) throw new \LogicException('Invalid or duplicate builder integration.');
        if (!is_callable($definition['active'] ?? null)) throw new \InvalidArgumentException('An integration requires an availability check.');
        self::$builders[$id] = $definition;
    }

    public static function active(string $id): bool
    {
        return self::authorized() && self::present($id);
    }

    /** Package/theme presence for preservation only, never operation authorization. */
    public static function present(string $id): bool
    {
        return isset(self::$builders[$id]) && (bool) (self::$builders[$id]['active'])();
    }

    public static function get(string $id, string $key, mixed $default = null): mixed
    {
        return self::active($id) ? (self::$builders[$id][$key] ?? $default) : $default;
    }

    public static function require_service(string $id, string $key): mixed
    {
        $service = self::get($id, $key);
        if ($service === null) throw new \RuntimeException('This builder integration is unavailable. Activate Pixflow Design Pro and the builder plugin.');
        return $service;
    }

    public static function all(): array
    {
        return array_filter(self::authorized() ? self::$builders : [], static fn(array $definition): bool => (bool) ($definition['active'])());
    }

    public static function catalogue(): array
    {
        $tools = [];
        foreach (self::all() as $definition) if (isset($definition['catalogue'])) $tools = array_merge($tools, ($definition['catalogue'])());
        return $tools;
    }

    public static function skill_roots(): array
    {
        $roots = [];
        foreach (self::all() as $definition) $roots += $definition['skillRoots'] ?? [];
        return $roots;
    }

    public static function sync_icons(array $sets): void
    {
        foreach (self::all() as $definition) if (isset($definition['syncIcons'])) ($definition['syncIcons'])($sets);
    }
}
