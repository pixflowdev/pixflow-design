<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) exit;

/** Compare the document the editor loaded, under a lock spanning the native save. */
class EditorSaveGuard
{
    protected array $locks = [];
    protected array $responseTargets = [];
    public const HEADER = 'X-Pixflow-Editor-Revisions';
    public const CONFLICT = 'A newer version of this document was saved in another editor. Your changes have not been saved. Keep a copy of your unsaved work, reload this tab, and reconcile the latest version before saving again.';

    public function register(): void
    {
        // Run at the native callback boundary. Some plugins use pre_dispatch for
        // initialization and discard an earlier filter's returned WP_Error.
        add_filter('rest_request_before_callbacks', [$this, 'rest_before'], 100, 3);
        add_filter('rest_post_dispatch', [$this, 'rest_after'], 100, 3);
        foreach (Gutenberg\GutenbergEntity::shared_types() as $type) add_filter('rest_prepare_' . $type, [$this, 'gutenberg_receipt'], 100, 3);
        add_action('rest_api_init', function (): void {
            foreach (get_post_types(['show_in_rest' => true], 'objects') as $type) {
                if (!in_array($type->name, Gutenberg\GutenbergEntity::shared_types(), true) && post_type_supports($type->name, 'editor')) add_filter('rest_prepare_' . $type->name, [$this, 'gutenberg_receipt'], 100, 3);
            }
        });
        add_action('shutdown', [$this, 'release'], PHP_INT_MAX);
    }

    public function enqueue_gutenberg(int $id): void
    {
        $type = $id ? get_post_type_object(get_post_type($id)) : null;
        $route = $type ? '/' . ($type->rest_namespace ?: 'wp/v2') . '/' . ($type->rest_base ?: $type->name) . '/' . $id : null;
        $path = PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-editor-save-guard.js';
        wp_enqueue_script('pixflow-editor-save-guard', PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-editor-save-guard.js', [], (string) filemtime($path), true);
        $routes = [];
        foreach (get_post_types(['show_in_rest' => true], 'objects') as $candidate) if (post_type_supports($candidate->name, 'editor')) $routes[] = '/' . ($candidate->rest_namespace ?: 'wp/v2') . '/' . ($candidate->rest_base ?: $candidate->name);
        $key = $id && in_array($type->name, Gutenberg\GutenbergEntity::shared_types(), true)
            ? Gutenberg\GutenbergEntity::key(['type' => $type->name, 'id' => (string) $id])
            : 'gutenberg:' . $id;
        wp_add_inline_script('pixflow-editor-save-guard', 'window.pixflowGutenbergSharedTypes=' . wp_json_encode(Gutenberg\GutenbergEntity::shared_types()) . ';window.pixflowGutenbergSharedRoutes=' . wp_json_encode(array_merge(['templates', 'template-parts', 'blocks', 'navigation'], array_keys(Gutenberg\GutenbergExtensions::contributions('sharedRoutes')))) . ';window.pixflowGutenbergEntityGuard=true;window.pixflowGutenbergPostRoutes=' . wp_json_encode($routes) . ';window.pixflowGutenbergSaveRoute=' . wp_json_encode($route) . ';window.pixflowEditorRevisions=' . wp_json_encode($id ? [$key => $this->fingerprint('gutenberg', $id)] : new \stdClass()) . ';', 'before');
    }

    /** Included in native REST preloads as well as normal entity reads. */
    public function gutenberg_receipt(mixed $response, mixed $object, \WP_REST_Request $request): mixed
    {
        if ($request->get_param('context') !== 'edit' || !current_user_can('manage_options') || !method_exists($response, 'get_data')) return $response;
        $data = $response->get_data();
        $type = $data['type'] ?? ($object->post_type ?? $object->type ?? null);
        if (!$type && preg_match('#/wp/v2/(templates|template-parts)/#', $request->get_route(), $match)) $type = $match[1] === 'templates' ? 'wp_template' : 'wp_template_part';
        if (empty($data['id']) || !$type) return $response;
        try {
            $entity = Gutenberg\GutenbergEntity::validate(['type' => $type, 'id' => (string) $data['id']]);
            $key = in_array($type, Gutenberg\GutenbergEntity::shared_types(), true) ? Gutenberg\GutenbergEntity::key($entity) : 'gutenberg:' . $entity['id'];
            $data['_pixflow_revision'] = [$key => Gutenberg\GutenbergEntity::fingerprint($entity)];
            $response->set_data($data);
        } catch (\Throwable) { /* Unreadable records do not establish a baseline. */ }
        return $response;
    }

    /** Read uncached records: a second PHP worker may have saved milliseconds ago. */
    public function fingerprint(string $builder, int $postId): string
    {
        global $wpdb;
        $post = $wpdb->get_row($wpdb->prepare("SELECT post_content, post_title, post_excerpt, post_status, post_type FROM {$wpdb->posts} WHERE ID = %d", $postId), ARRAY_A);
        $keys = \PixflowDesign\WordPress\Modules\BuilderIntegrations::get($builder, 'revisionMetaKeys', ['_wp_page_template']);
        if ($builder === 'gutenberg') {
            $keys = array_merge($keys, ['wp_pattern_sync_status', '_editor_width']);
            foreach (\PixflowDesign\WordPress\Modules\BuilderIntegrations::all() as $integration) if (isset($integration['gutenbergRevisionKeys'])) $keys = array_merge($keys, ($integration['gutenbergRevisionKeys'])());
        }
        $meta = $wpdb->get_results($wpdb->prepare("SELECT meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key IN (" . implode(',', array_fill(0, count($keys), '%s')) . ') ORDER BY meta_key, meta_id', $postId, ...$keys), ARRAY_A);
        // Pattern categories/collections are saved alongside the document. Read
        // membership uncached so an older editor cannot silently replace it.
        $terms = $builder === 'gutenberg' && ($post['post_type'] ?? '') === 'wp_block'
            ? $wpdb->get_results($wpdb->prepare("SELECT term_taxonomy_id FROM {$wpdb->term_relationships} WHERE object_id = %d ORDER BY term_taxonomy_id", $postId), ARRAY_A)
            : [];
        return hash('sha256', serialize([$post, $meta, $terms]));
    }

    public function acquire(string $builder, int $id, string $expected): void
    {
        global $wpdb;
        if (!current_user_can('edit_post', $id)) throw new \RuntimeException('This document is not editable.');
        $this->lock_resource($wpdb->posts . ':' . $id);
        if (!preg_match('/^[a-f0-9]{64}$/D', $expected) || !hash_equals($this->fingerprint($builder, $id), $expected)) throw new \RuntimeException(self::CONFLICT);
    }

    public function lock_resource(string $identity): void
    {
        global $wpdb;
        $lock = 'pixflow-save-' . hash('sha256', $identity);
        $lock = substr($lock, 0, 64);
        if (!isset($this->locks[$lock])) {
            if ((int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 5)', $lock)) !== 1) throw new \RuntimeException('Another editor is saving this document. Wait for it to finish, then try again.');
            $this->locks[$lock] = true;
        }
    }

    public function release(): void
    {
        global $wpdb;
        foreach ($this->locks as $lock => $_) $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock));
        $this->locks = [];
    }

    public function rest_before(mixed $result, mixed $server, \WP_REST_Request $request): mixed
    {
        if ($result !== null) return $result;
        $raw = (string) $request->get_header(self::HEADER);
        $revisions = json_decode($raw, true);
        $revisions = is_array($revisions) ? $revisions : [];
        $types = ['templates' => 'wp_template', 'template-parts' => 'wp_template_part', 'blocks' => 'wp_block', 'navigation' => 'wp_navigation'] + Gutenberg\GutenbergExtensions::contributions('sharedRoutes');
        if (preg_match('#^/wp/v2/(' . implode('|', array_map(static fn($key) => preg_quote($key, '#'), array_keys($types))) . ')/(.+?)(?:/autosaves)?/?$#D', rawurldecode($request->get_route()), $shared)) {
            // Revisions and collection creation have their own WordPress permissions.
            $entity = ['type' => $types[$shared[1]], 'id' => $shared[2]];
            try {
                $entity = Gutenberg\GutenbergEntity::validate($entity);
                $key = Gutenberg\GutenbergEntity::key($entity);
                if ($request->get_method() !== 'GET' && $raw !== '') {
                    $this->lock_resource('gutenberg-entity:' . get_current_blog_id() . ':' . $entity['type'] . ':' . $entity['id']);
                    if (!hash_equals(Gutenberg\GutenbergEntity::fingerprint($entity), (string) ($revisions[$key] ?? ''))) throw new \RuntimeException(self::CONFLICT);
                }
                $this->responseTargets[$key] = ['gutenberg-entity', $entity];
            } catch (\Throwable $error) {
                if ($request->get_method() !== 'GET' && $raw !== '') return new \WP_Error('pixflow_editor_conflict', $error->getMessage(), ['status' => 409]);
            }
            return $result;
        }
        foreach ($revisions as $key => $expected) {
            if (!preg_match('/^gutenberg:(\d+)$/D', $key, $target)) continue;
            $id = (int) $target[1];
            $type = get_post_type_object(get_post_type($id));
            if (!$type || !current_user_can('edit_post', $id)) continue;
            $route = '/' . ($type->rest_namespace ?: 'wp/v2') . '/' . ($type->rest_base ?: $type->name) . '/' . $id;
            // For an author's draft, WordPress autosave updates the parent post
            // directly. It must hold the same compare-and-save lock as Save.
            if (!in_array(rtrim($request->get_route(), '/'), [$route, $route . '/autosaves'], true)) continue;
            if (in_array($request->get_method(), ['POST', 'PUT', 'PATCH'], true)) {
                try { $this->acquire('gutenberg', $id, (string) $expected); }
                catch (\Throwable $error) { return new \WP_Error('pixflow_editor_conflict', $error->getMessage(), ['status' => 409]); }
            }
            $this->responseTargets[$key] = ['gutenberg', $id];
            return $result;
        }
        // Site Editor pages can be loaded after initial PHP bootstrap. Fail
        // closed if their native write has no matching loaded-version receipt.
        if ($raw !== '' && function_exists('get_post_types')) foreach (get_post_types(['show_in_rest' => true], 'objects') as $type) {
            if (!post_type_supports($type->name, 'editor')) continue;
            $base = '/' . ($type->rest_namespace ?: 'wp/v2') . '/' . ($type->rest_base ?: $type->name);
            if (!preg_match('#^' . preg_quote($base, '#') . '/(\d+)(?:/autosaves)?/?$#D', $request->get_route(), $matched)) continue;
            $id = (int) $matched[1];
            if (!current_user_can('edit_post', $id)) return $result;
            if ($request->get_method() !== 'GET') return new \WP_Error('pixflow_editor_conflict', self::CONFLICT, ['status' => 409]);
            $this->responseTargets['gutenberg:' . $id] = ['gutenberg', $id];
            return $result;
        }
        return $result;
    }

    public function rest_after(mixed $result): mixed
    {
        if ($this->responseTargets && method_exists($result, 'header') && $result->get_status() < 400) $result->header(self::HEADER, wp_json_encode($this->response_revisions()));
        return $result;
    }

    protected function response_revisions(): array
    {
        $result = [];
        foreach ($this->responseTargets as $key => [$builder, $id]) $result[$key] = $builder === 'gutenberg-entity' ? Gutenberg\GutenbergEntity::fingerprint($id) : $this->fingerprint($builder, $id);
        return $result;
    }

}
