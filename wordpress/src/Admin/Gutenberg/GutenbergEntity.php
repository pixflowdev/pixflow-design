<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin\Gutenberg;
if (!defined('ABSPATH')) exit;

/** WordPress entity identities stay intact, including theme-provided templates. */
final class GutenbergEntity
{
    public const SHARED = ['wp_template', 'wp_template_part', 'wp_block', 'wp_navigation'];

    public static function shared_types(): array { return array_merge(self::SHARED, GutenbergExtensions::contributions('sharedTypes')); }

    public static function validate(array $entity): array
    {
        $type = (string) ($entity['type'] ?? '');
        $id = (string) ($entity['id'] ?? '');
        GutenbergExtensions::assert_entity($type);
        if (in_array($type, ['wp_template', 'wp_template_part'], true)) {
            if (!current_user_can('edit_theme_options') || !preg_match('#^[a-zA-Z0-9_-]+//[a-zA-Z0-9_-]+$#D', $id) || !get_block_template($id, $type)) throw new \RuntimeException('This template is unavailable or not editable.');
        } else {
            $post = ctype_digit($id) ? get_post((int) $id) : null;
            if (!$post || $post->post_type !== $type || !current_user_can('edit_post', (int) $id)) throw new \RuntimeException('This Gutenberg document is unavailable or not editable.');
            if (!in_array($type, self::shared_types(), true)) WpAdminGutenbergEditorBridge::require_post((int) $id);
        }
        return ['type' => $type, 'id' => $id];
    }

    public static function key(array $entity): string { return 'gutenberg-entity:' . $entity['type'] . ':' . $entity['id']; }

    public static function fingerprint(array $entity): string
    {
        if (in_array($entity['type'], ['wp_template', 'wp_template_part'], true)) {
            // Core resolves file templates and database overrides in the same way.
            $template = get_block_template($entity['id'], $entity['type']);
            if (!$template) throw new \RuntimeException('This template no longer exists.');
            if (!empty($template->wp_id)) return (new \PixflowDesign\WordPress\Admin\EditorSaveGuard())->fingerprint('gutenberg', (int) $template->wp_id);
            return hash('sha256', serialize([$template->id, $template->content, $template->title, $template->source]));
        }
        return (new \PixflowDesign\WordPress\Admin\EditorSaveGuard())->fingerprint('gutenberg', (int) $entity['id']);
    }
}
