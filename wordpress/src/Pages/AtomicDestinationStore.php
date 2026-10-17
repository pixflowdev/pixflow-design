<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Pages;
if (!defined('ABSPATH')) exit;

/** Persistent no-autoload receipts. INSERT IGNORE avoids add_option's upsert race. */
final class AtomicDestinationStore
{
    public static function reserve(string $key, array $value): bool
    {
        global $wpdb;
        $inserted = $wpdb->query($wpdb->prepare("INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'no')", $key, maybe_serialize($value)));
        if ($inserted === false) throw new \RuntimeException('The destination receipt could not be stored.');
        self::invalidate($key);
        return $inserted === 1;
    }
    public static function replace(string $key, array $previous, array $next): bool
    {
        global $wpdb;
        $changed = $wpdb->update($wpdb->options, ['option_value' => maybe_serialize($next)], ['option_name' => $key, 'option_value' => maybe_serialize($previous)], ['%s'], ['%s', '%s']);
        self::invalidate($key);
        if ($changed === false) throw new \RuntimeException('The destination receipt could not be updated.');
        return $changed === 1;
    }
    /** Release only a reservation whose value still belongs to this attempt. */
    public static function remove(string $key, array $expected): bool
    {
        global $wpdb;
        $removed = $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $key, maybe_serialize($expected)));
        self::invalidate($key);
        if ($removed === false) throw new \RuntimeException('The destination reservation could not be released.');
        return $removed === 1;
    }
    private static function invalidate(string $key): void
    {
        wp_cache_delete($key, 'options');
        wp_cache_delete('notoptions', 'options');
    }
}
