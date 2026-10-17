<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

if (!defined('ABSPATH')) {
    exit;
}

/** Loads the native post connection and the separate ticket-bound serializer. */
final class WpAdminGutenbergEditorBridge
{
    public function __construct(private readonly GutenbergSerializationTicketStore $tickets = new GutenbergSerializationTicketStore())
    {
    }

    public function register(): void
    {
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
        add_action('enqueue_block_editor_assets', [$this, 'enqueue_live']);
    }

    public static function require_post(int $id): void
    {
        $post = get_post($id);
        if (!$post || !current_user_can('edit_post', $id) || !use_block_editor_for_post($post)) throw new \RuntimeException('Open an editable Gutenberg document.');
        if (in_array($post->post_type, GutenbergEntity::shared_types(), true)) return;
        $status = (new GutenbergDocumentRepository())->target_status($id);
        if ($status instanceof \WP_Error) throw new \RuntimeException($status->get_error_message());
    }

    public function enqueue_live(): void
    {
        if (!empty($_GET['pixflow-gutenberg-serializer']) || !current_user_can('manage_options')) return;
        $screen = get_current_screen();
        global $post;
        $site_editor = $screen && $screen->base === 'site-editor';
        if (($site_editor || ($post && in_array($post->post_type, GutenbergEntity::SHARED, true)))
            && !\PixflowDesign\WordPress\Modules\FeatureContributions::available('site-editor')) return;
        if (!$site_editor && (!$screen || $screen->base !== 'post' || !$screen->is_block_editor() || !$post)) return;
        if ($site_editor && !current_user_can('edit_theme_options')) return;
        if (!$site_editor) { try { self::require_post((int) $post->ID); } catch (\Throwable) { return; } }
        $guard = new \PixflowDesign\WordPress\Admin\EditorSaveGuard();
        $guard->enqueue_gutenberg($site_editor ? 0 : (int) $post->ID);
        wp_enqueue_script('pixflow-gutenberg-workspace-menu', PIXFLOW_DESIGN_ASSETS_URL . 'builder/workspace-menu.js', [], (string) filemtime(PIXFLOW_DESIGN_ASSETS_DIR . 'builder/workspace-menu.js'), true);
        wp_enqueue_style('pixflow-native-workspace', PIXFLOW_DESIGN_ASSETS_URL . 'builder/native-workspace.css', [], (string) filemtime(PIXFLOW_DESIGN_ASSETS_DIR . 'builder/native-workspace.css'));
        wp_enqueue_style('pixflow-gutenberg-editor', PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-gutenberg-editor.css', [], (string) filemtime(PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-gutenberg-editor.css'));
        $dependencies = GutenbergExtensions::enqueue();
        $path = PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-gutenberg-editor.js';
        wp_enqueue_script('pixflow-gutenberg-editor', PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-gutenberg-editor.js', array_merge(['wp-data', 'wp-blocks', 'wp-editor', 'pixflow-editor-save-guard', 'pixflow-gutenberg-workspace-menu', \PixflowDesign\WordPress\Assets\AssetRegistrar::WP_ADMIN_SCRIPT_HANDLE], $dependencies), (string) filemtime($path), true);
        wp_add_inline_script('pixflow-gutenberg-editor', 'window.pixflowGutenbergEditor=true;', 'before');
    }

    public function enqueue(string $hook_suffix): void
    {
        if ($hook_suffix !== 'post.php' || (string) ($_GET['pixflow-gutenberg-serializer'] ?? '') !== '1') {
            return;
        }
        $post_id = isset($_GET['post']) ? absint($_GET['post']) : 0;
        $ticket_id = sanitize_text_field(wp_unslash((string) ($_GET['pixflow-gutenberg-ticket'] ?? '')));
        $ticket = $this->tickets->editor_ticket($ticket_id, $post_id);
        if ($ticket instanceof \WP_Error) {
            return;
        }

        $relative = 'admin/gutenberg-editor-bridge.js';
        $dependencies = GutenbergExtensions::enqueue(true);
        $path = trailingslashit(PIXFLOW_DESIGN_PLUGIN_DIR) . 'assets/' . $relative;
        wp_enqueue_script(
            'pixflow-design-gutenberg-editor-bridge',
            PIXFLOW_DESIGN_ASSETS_URL . $relative,
            array_merge(['wp-blocks', 'wp-data', 'wp-dom-ready'], $dependencies),
            PIXFLOW_DESIGN_VERSION . '.' . (file_exists($path) ? (string) filemtime($path) : '0'),
            true,
        );
        wp_add_inline_script(
            'pixflow-design-gutenberg-editor-bridge',
            'window.pixflowDesignGutenbergBridge=' . wp_json_encode([
                'ticketId' => $ticket['ticketId'],
                'postId' => $ticket['postId'],
                'resolvedTreeHash' => $ticket['resolvedTreeHash'],
                'purpose' => $ticket['purpose'],
                'expiresAt' => $ticket['expiresAt'],
                'origin' => wp_parse_url(home_url(), PHP_URL_SCHEME) . '://' . wp_parse_url(home_url(), PHP_URL_HOST) . (($port = wp_parse_url(home_url(), PHP_URL_PORT)) ? ':' . $port : ''),
            ], JSON_UNESCAPED_SLASHES) . ';',
            'before',
        );
        wp_register_style('pixflow-design-gutenberg-serializer-frame', false, [], PIXFLOW_DESIGN_VERSION);
        wp_enqueue_style('pixflow-design-gutenberg-serializer-frame');
        wp_add_inline_style('pixflow-design-gutenberg-serializer-frame', 'html,body{background:transparent!important}body{visibility:hidden!important}');
    }
}
