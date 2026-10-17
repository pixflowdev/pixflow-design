<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Pages;

use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergDocumentRepository;
use PixflowDesign\WordPress\Modules\BuilderIntegrations;

if (!defined('ABSPATH')) exit;

/** Opens compatible pages or creates blank drafts; never converts existing documents. */
final class BuilderDestinations
{
    private const MARKER = '_pixflow_builder_destination_request';
    private const BUILDERS = ['gutenberg', 'bricks', 'etch', 'elementor'];

    public function listing(mixed $builder = null, mixed $search = null): array|\WP_Error
    {
        $builders = [
            ['id' => 'gutenberg', 'label' => 'Gutenberg', 'available' => $this->available('gutenberg')],
            ['id' => 'bricks', 'label' => 'Bricks', 'available' => $this->available('bricks')],
            ['id' => 'etch', 'label' => 'Etch', 'available' => $this->available('etch')],
            ['id' => 'elementor', 'label' => 'Elementor', 'available' => $this->available('elementor')],
        ];
        foreach ($builders as &$option) if (!$option['available']) $option['reason'] = $option['id'] === 'gutenberg' ? 'The WordPress block editor is unavailable for pages.' : 'Activate licensed Pixflow Design Pro and ' . $option['label'] . '.';
        unset($option);
        if ($builder === null || $builder === '') return ['builders' => $builders, 'pages' => [], 'hasMore' => false];
        if (!is_string($builder) || !in_array($builder, self::BUILDERS, true)) return self::error('Invalid builder.');
        if (!$this->available($builder)) return self::error('This builder is unavailable.', 403);
        if ($search !== null && (!is_string($search) || strlen($search) > 800)) return self::error('Invalid page search.');
        $pages = [];
        $query = new \WP_Query(['post_type' => 'page', 'post_status' => ['draft', 'pending', 'private', 'publish', 'future'], 'posts_per_page' => 101, 's' => sanitize_text_field($search ?? ''), 'orderby' => 'modified', 'order' => 'DESC', 'no_found_rows' => true]);
        foreach ($query->posts as $post) {
            $destination = $this->destination($builder, (int) $post->ID);
            if (!$destination instanceof \WP_Error) $pages[] = $destination;
        }
        return ['builders' => $builders, 'pages' => array_slice($pages, 0, 100), 'hasMore' => count($query->posts) > 100];
    }

    private function available(string $builder): bool
    {
        if ($builder !== 'gutenberg') return is_array(BuilderIntegrations::get($builder, 'pageDestination'));
        return post_type_supports('page', 'editor') && (!function_exists('use_block_editor_for_post_type') || use_block_editor_for_post_type('page'));
    }

    public function destination(string $builder, int $id): array|\WP_Error
    {
        if (!in_array($builder, self::BUILDERS, true) || !$this->available($builder)) return self::error('This builder is unavailable.', 403);
        $post = get_post($id);
        if (!$post instanceof \WP_Post || $post->post_type !== 'page' || !in_array($post->post_status, ['draft', 'pending', 'private', 'publish', 'future'], true)) return self::error('Page not found.', 404);
        if (!current_user_can('edit_post', $id) || !current_user_can('read_post', $id)) return self::error('You cannot edit this page.', 403);
        if (self::has_foreign_owner($post, $builder)) return self::error('This page belongs to another builder. Choose a compatible page or create a new draft.', 409);
        if ($builder === 'gutenberg') {
            // A builder mode marker is ownership even before the first content save.
            if (get_post_meta($id, '_bricks_editor_mode', true) === 'bricks' || get_post_meta($id, '_elementor_edit_mode', true) === 'builder') return self::error('This page belongs to another builder. Choose a compatible page or create a new draft.', 409);
            $status = (new GutenbergDocumentRepository())->target_status($id);
            if ($status instanceof \WP_Error || empty($status['usesBlockEditor'])) return self::error('This page cannot be opened in Gutenberg without conversion. Choose another page.', 409);
            $url = add_query_arg(['post' => $id, 'action' => 'edit'], admin_url('post.php'));
        } else {
            $adapter = BuilderIntegrations::get($builder, 'pageDestination');
            if (!($adapter['compatible'])($post)) return self::error('This page belongs to another builder. Choose a compatible page or create a new draft.', 409);
            $url = ($adapter['editorUrl'])($id);
        }
        return ['postId' => $id, 'title' => (string) $post->post_title, 'status' => (string) $post->post_status, 'builder' => $builder, 'editorUrl' => $url];
    }

    public function mutate(mixed $body): array|\WP_Error
    {
        if (!is_array($body) || !is_string($body['builder'] ?? null) || !in_array($body['builder'], self::BUILDERS, true)) return self::error('Invalid builder.');
        $builder = $body['builder'];
        if (!$this->available($builder)) return self::error('This builder is unavailable.', 403);
        if (($body['action'] ?? null) === 'open') {
            if (!is_int($body['postId'] ?? null) || $body['postId'] < 1) return self::error('Invalid page.');
            $destination = $this->destination($builder, $body['postId']);
            return $destination instanceof \WP_Error ? $destination : ['destination' => $destination, 'created' => false, 'reused' => false];
        }
        if (($body['action'] ?? null) !== 'create') return self::error('Invalid destination action.');
        $type = get_post_type_object('page');
        if (!$type || !current_user_can($type->cap->create_posts) || !current_user_can('edit_pages')) return self::error('You cannot create pages.', 403);
        $title = $body['title'] ?? null;
        $request_id = $body['requestId'] ?? null;
        if (!is_string($title) || trim($title) === '' || strlen($title) > 800 || preg_match_all('/./us', trim($title)) > 200 || preg_match('/[\x00-\x1f\x7f]/', $title)) return self::error('Enter a page title of 1–200 characters.');
        $title = sanitize_text_field(trim($title));
        if ($title === '') return self::error('Enter a page title.');
        if (!is_string($request_id) || !preg_match('/^[A-Za-z0-9_-]{16,128}$/D', $request_id)) return self::error('A valid request ID is required.');
        $key = '_pixflow_destination_' . hash('sha256', get_current_user_id() . ':' . $request_id);
        $fingerprint = hash('sha256', $builder . ':' . $title);
        // The unique options key is a permanent receipt, not an expiring lock. A retry
        // after a lost response or process failure must never create another draft.
        $claimed = AtomicDestinationStore::reserve($key, ['fingerprint' => $fingerprint, 'postId' => 0]);
        if (!$claimed) {
            $receipt = get_option($key, []);
            if (($receipt['fingerprint'] ?? '') !== $fingerprint) return self::error('This request ID was already used for another draft.', 409);
            $id = (int) ($receipt['postId'] ?? 0);
            if (!$id) {
                $matches = get_posts(['post_type' => 'page', 'post_status' => 'any', 'meta_key' => self::MARKER, 'meta_value' => $key, 'fields' => 'ids', 'posts_per_page' => 1]);
                $id = (int) ($matches[0] ?? 0);
            }
            if (!$id) return self::error('Draft creation is still pending. Retry the same request; do not create another draft.', 409);
            $destination = $this->destination($builder, $id);
            return $destination instanceof \WP_Error ? $destination : ['destination' => $destination, 'created' => false, 'reused' => true];
        }
        $meta = [self::MARKER => $key, '_pixflow_builder_destination_editor' => $builder];
        if ($builder !== 'gutenberg') $meta += (BuilderIntegrations::get($builder, 'pageDestination')['newMeta']);
        $id = wp_insert_post(['post_type' => 'page', 'post_status' => 'draft', 'post_author' => get_current_user_id(), 'post_title' => wp_slash($title), 'post_content' => '', 'meta_input' => $meta], true);
        if ($id instanceof \WP_Error || !$id) {
            // Retain the receipt: hooks may have partially persisted a page before failure.
            return self::error('The draft could not be confirmed. Retry this request before creating another page.', 409);
        }
        update_option($key, ['fingerprint' => $fingerprint, 'postId' => (int) $id], false);
        $destination = $this->destination($builder, (int) $id);
        return $destination instanceof \WP_Error ? $destination : ['destination' => $destination, 'created' => true, 'reused' => false];
    }
    /** Ownership survives empty documents and unavailable integrations; opening never converts it. */
    public static function has_foreign_owner(\WP_Post $post, string $builder): bool
    {
        $owner = get_post_meta($post->ID, '_pixflow_builder_destination_editor', true);
        if ($owner !== '' && $owner !== $builder) return true;
        $keys = [
            'bricks' => ['_bricks_page_content_2', '_bricks_page_header_2', '_bricks_page_footer_2'],
            'elementor' => ['_elementor_data'],
            'breakdance' => ['_breakdance_data'],
            'beaver' => ['_fl_builder_data', '_fl_builder_draft'],
        ];
        foreach ($keys as $candidate => $meta_keys) {
            if ($candidate === $builder) continue;
            foreach ($meta_keys as $key) if (metadata_exists('post', $post->ID, $key)) return true;
        }
        if ($builder !== 'bricks' && get_post_meta($post->ID, '_bricks_editor_mode', true) === 'bricks') return true;
        if ($builder !== 'elementor' && get_post_meta($post->ID, '_elementor_edit_mode', true) === 'builder') return true;
        if (get_post_meta($post->ID, '_fl_builder_enabled', true)) return true;
        if ($builder !== 'etch') {
            $pending = parse_blocks($post->post_content);
            while ($pending) {
                $block = array_pop($pending);
                if (str_starts_with((string) ($block['blockName'] ?? ''), 'etch/') || isset($block['attrs']['metadata']['etch'])) return true;
                foreach (($block['innerBlocks'] ?? []) as $child) $pending[] = $child;
            }
        }
        return false;
    }
    private static function error(string $message, int $status = 400): \WP_Error { return new \WP_Error('pixflow_builder_destination', $message, ['status' => $status]); }
}
