<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Framework\DesignSystem;
if (!defined('ABSPATH')) exit;

/** Builder-neutral saved profiles; legacy option keys preserve existing libraries. */
class SavedDesignSystems
{
    protected const PREFIX = 'pixflow_design_bricks_system_';
    public function all(): array
    {
        global $wpdb;
        $names = $wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like(self::PREFIX) . '%'));
        $items = [];
        foreach ($names as $name) { $item = get_option($name); if (is_array($item) && isset($item['profile'], $item['id'])) $items[] = $item; }
        usort($items, static fn($a, $b) => strcmp($a['title'], $b['title']));
        return $items;
    }
    public function get(string $id): ?array
    {
        if (!preg_match('/^pds-[a-f0-9]{12}$/D', $id)) return null;
        $item = get_option(self::PREFIX . $id);
        return is_array($item) ? $item : null;
    }
}
