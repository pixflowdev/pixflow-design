<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin;
if (!defined('ABSPATH')) exit;

/** Bounded native WordPress operations shared by API and CLI tool callers. */
final class WordPressAdminOperations
{
    private const READS = ['wordpress.posts.list', 'wordpress.posts.get', 'wordpress.terms.list', 'wordpress.terms.get', 'wordpress.media.list', 'wordpress.media.get', 'wordpress.settings.get'];
    private const ARGUMENTS = [
        'wordpress.posts.list' => ['postType','status','search','perPage','page'],
        'wordpress.posts.get' => ['postId'],
        'wordpress.posts.create' => ['postType','status','title','slug','content','excerpt','parent','terms','featuredMediaId'],
        'wordpress.posts.update' => ['postId','expectedModifiedGmt','fields'],
        'wordpress.posts.trash' => ['postId','expectedModifiedGmt','expectedFingerprint'],
        'wordpress.posts.restore' => ['postId','expectedModifiedGmt','expectedFingerprint'],
        'wordpress.terms.list' => ['taxonomy','search','perPage'],
        'wordpress.terms.get' => ['taxonomy','termId'],
        'wordpress.terms.create' => ['taxonomy','name','slug','description','parent'],
        'wordpress.terms.update' => ['taxonomy','termId','expectedFingerprint','fields'],
        'wordpress.terms.delete' => ['taxonomy','termId','expectedFingerprint'],
        'wordpress.media.list' => ['search','mimeType','page','perPage'],
        'wordpress.media.get' => ['attachmentId'],
        'wordpress.media.update' => ['attachmentId','expectedFingerprint','fields'],
        'wordpress.media.delete' => ['attachmentId','expectedFingerprint'],
        'wordpress.settings.get' => [],
        'wordpress.settings.update' => ['settings','expectedFingerprint'],
    ];

    public function __construct(
        private readonly WpAdminWordPressCapabilityService $core = new WpAdminWordPressCapabilityService(),
        private readonly WpAdminSettingsCapabilityService $settings = new WpAdminSettingsCapabilityService(),
    ) {}

    public static function handles(string $tool): bool { return isset(self::ARGUMENTS[$tool]); }

    public static function catalogue(): array
    {
        return [
            'wordpress.posts.list' => ['postType'=>'post (default) or page', 'status'=>'Optional registered status or any', 'search'=>'Optional title/content search', 'perPage'=>'1..50', 'page'=>'1..1000'],
            'wordpress.posts.get' => ['postId'=>'Exact numeric post ID; returns modifiedGmt and fingerprint for subsequent writes'],
            'wordpress.posts.create' => ['postType'=>'post (default) or page', 'title'=>'Title', 'slug'=>'Optional slug', 'status'=>'draft (default), pending, private or publish with native permission', 'content'=>'Optional safe classic HTML/text; use live Gutenberg tools for block documents', 'excerpt'=>'Optional plain text', 'parent'=>'Optional editable parent ID', 'terms'=>'Optional taxonomy to existing term ID arrays', 'featuredMediaId'=>'Optional existing image attachment ID'],
            'wordpress.posts.update' => ['postId'=>'Exact post ID from a fresh read', 'expectedModifiedGmt'=>'modifiedGmt from wordpress.posts.get', 'fields'=>'Nonempty object of title, slug, content, excerpt, status, parent, terms only; native permissions, editor locks, revisions and builder boundaries apply'],
            'wordpress.posts.trash' => ['postId'=>'Exact discovered post ID', 'expectedModifiedGmt'=>'Fresh modifiedGmt', 'expectedFingerprint'=>'Optional fresh fingerprint; moves to native Trash, never permanently deletes'],
            'wordpress.posts.restore' => ['postId'=>'Exact discovered trashed post ID', 'expectedModifiedGmt'=>'Fresh modifiedGmt', 'expectedFingerprint'=>'Optional fresh fingerprint'],
            'wordpress.terms.list' => ['taxonomy'=>'Registered editable taxonomy, e.g. category or post_tag', 'search'=>'Optional text', 'perPage'=>'1..100'],
            'wordpress.terms.get' => ['taxonomy'=>'Registered editable taxonomy', 'termId'=>'Exact term ID; returns fingerprint'],
            'wordpress.terms.create' => ['taxonomy'=>'Registered editable taxonomy', 'name'=>'Required name', 'slug'=>'Optional slug', 'description'=>'Optional plain text', 'parent'=>'Optional existing parent term ID'],
            'wordpress.terms.update' => ['taxonomy'=>'Registered editable taxonomy', 'termId'=>'Exact term ID', 'expectedFingerprint'=>'Fresh fingerprint from wordpress.terms.get', 'fields'=>'Nonempty object of name, slug, description, parent only'],
            'wordpress.terms.delete' => ['taxonomy'=>'Registered editable taxonomy', 'termId'=>'Exact term ID', 'expectedFingerprint'=>'Fresh fingerprint; uses native term deletion and reassignment rules'],
            'wordpress.media.list' => ['search'=>'Optional search', 'mimeType'=>'image, audio, video or all', 'page'=>'1..1000', 'perPage'=>'1..50'],
            'wordpress.media.get' => ['attachmentId'=>'Exact attachment ID; returns metadata and fingerprint'],
            'wordpress.media.update' => ['attachmentId'=>'Exact attachment ID', 'expectedFingerprint'=>'Fresh fingerprint from wordpress.media.get', 'fields'=>'Nonempty object of title, caption, description, altText only'],
            'wordpress.media.delete' => ['attachmentId'=>'Exact attachment ID', 'expectedFingerprint'=>'Fresh fingerprint; permanently removes this native media attachment only'],
            'wordpress.settings.get' => ['description'=>'Read safe basic site settings and fingerprint; requires manage_options'],
            'wordpress.settings.update' => ['expectedFingerprint'=>'Fresh fingerprint from wordpress.settings.get', 'settings'=>'Nonempty allowlisted object: blogname, blogdescription, timezone_string, date_format, time_format, start_of_week, permalink_structure only; no arbitrary options'],
        ];
    }

    public function call(string $tool, array $arguments, bool $writable): mixed
    {
        if (!self::handles($tool)) return $this->error('unknown_wordpress_operation', 'Unknown native WordPress operation.', 400);
        if (!current_user_can('edit_posts')) return $this->error('target_permission_denied', 'WordPress operations require an authenticated editing account.', 403);
        if (!$writable && !in_array($tool, self::READS, true)) return $this->error('read_only_session', 'This session is read-only. Start a writable session before changing the site.', 403);
        if ($error = $this->validate($tool, $arguments)) return $error;
        if (str_starts_with($tool, 'wordpress.posts.')) {
            // Never turn an executable-snippet plugin's custom post type into
            // an indirect code editor. Dedicated integrations own other types.
            $type = isset($arguments['postId']) ? get_post_type($arguments['postId']) : ($arguments['postType'] ?? 'post');
            if (!in_array($type, ['post','page'], true)) return $this->error('post_type_not_allowed', 'Use standard posts/pages or the dedicated content integration.', 422);
            if (!isset($arguments['postId'])) $arguments['postType'] = $type;
        }
        if (isset($arguments['content'])) {
            if ($error = $this->content_error($arguments['content'])) return $error;
            $arguments['content'] = wp_kses_post($arguments['content']);
        }
        if (isset($arguments['fields']['content'])) {
            if ($error = $this->content_error($arguments['fields']['content'])) return $error;
            $arguments['fields']['content'] = wp_kses_post($arguments['fields']['content']);
        }
        if (isset($arguments['fields']['title'])) $arguments['fields']['title'] = sanitize_text_field($arguments['fields']['title']);
        return match ($tool) {
            'wordpress.posts.list' => $this->core->list_posts($arguments),
            'wordpress.posts.get' => $this->core->get_post($arguments['postId']),
            'wordpress.posts.create' => $this->core->create_post($arguments),
            'wordpress.posts.update' => $this->core->update_post($arguments),
            'wordpress.posts.trash' => $this->core->trash_post($arguments),
            'wordpress.posts.restore' => $this->core->restore_post($arguments),
            'wordpress.terms.list' => $this->core->list_terms($arguments),
            'wordpress.terms.get' => $this->term($arguments),
            'wordpress.terms.create' => $this->core->create_term($arguments),
            'wordpress.terms.update' => $this->core->update_term($arguments),
            'wordpress.terms.delete' => $this->delete_term($arguments),
            'wordpress.media.list' => current_user_can('upload_files') ? $this->core->list_media($arguments) : $this->error('target_permission_denied', 'Media operations require upload_files.', 403),
            'wordpress.media.get' => $this->media($arguments['attachmentId']),
            'wordpress.media.update' => $this->update_media($arguments),
            'wordpress.media.delete' => $this->delete_media($arguments),
            'wordpress.settings.get' => $this->settings->read(),
            'wordpress.settings.update' => $this->settings->update($arguments),
        };
    }

    private function validate(string $tool, array $args): ?\WP_Error
    {
        if (array_diff(array_keys($args), self::ARGUMENTS[$tool])) return $this->error('argument_not_allowlisted', 'This operation accepts only its documented arguments.', 400);
        foreach ($args as $key => $value) {
            if (in_array($key, ['fields','settings','terms'], true)) {
                if (!is_array($value) || ($value !== [] && array_is_list($value))) return $this->error('invalid_arguments', $key . ' must be an object.', 400);
                continue;
            }
            if (in_array($key, ['postId','termId','attachmentId','parent','featuredMediaId','page','perPage'], true)) {
                if (!is_int($value) || $value < (in_array($key, ['parent','featuredMediaId'], true) ? 0 : 1)) return $this->error('invalid_arguments', $key . ' must be a bounded integer.', 400);
            } elseif (!is_string($value) || strlen($value) > 1048576) return $this->error('invalid_arguments', $key . ' must be bounded text.', 400);
        }
        foreach (['postId','termId','attachmentId'] as $id) {
            if (in_array($id, self::ARGUMENTS[$tool], true) && !isset($args[$id])) return $this->error('invalid_arguments', $id . ' is required.', 400);
        }
        if (str_starts_with($tool, 'wordpress.terms.') && (!isset($args['taxonomy']) || $args['taxonomy'] === '')) return $this->error('invalid_arguments', 'taxonomy is required.', 400);
        if (str_ends_with($tool, '.update') && $tool !== 'wordpress.settings.update' && !isset($args['fields'])) return $this->error('invalid_arguments', 'fields is required.', 400);
        if (isset($args['fields'])) {
            if ($args['fields'] === []) return $this->error('invalid_arguments', 'At least one field is required.', 400);
            $allowed = str_starts_with($tool, 'wordpress.posts.') ? ['title','slug','content','excerpt','status','parent','terms'] : (str_starts_with($tool, 'wordpress.terms.') ? ['name','slug','description','parent'] : ['title','caption','description','altText']);
            if (array_diff(array_keys($args['fields']), $allowed)) return $this->error('field_not_allowlisted', 'Only documented fields may be changed.', 422);
            foreach ($args['fields'] as $key => $value) {
                if ($key === 'terms') { if ($error = $this->validate_terms($value)) return $error; }
                elseif ($key === 'parent') { if (!is_int($value) || $value < 0) return $this->error('invalid_arguments', 'parent must be a nonnegative integer.', 400); }
                elseif (!is_string($value) || strlen($value) > 1048576) return $this->error('invalid_arguments', 'Field values must be bounded text.', 400);
            }
        }
        if (isset($args['terms']) && ($error = $this->validate_terms($args['terms']))) return $error;
        return null;
    }

    private function validate_terms(mixed $terms): ?\WP_Error
    {
        if (!is_array($terms) || ($terms !== [] && array_is_list($terms)) || count($terms) > 32) return $this->error('invalid_arguments', 'terms must map registered taxonomies to term ID arrays.', 400);
        foreach ($terms as $taxonomy => $ids) {
            if (!is_string($taxonomy) || !is_array($ids) || !array_is_list($ids) || count($ids) > 100) return $this->error('invalid_arguments', 'Term IDs must be a bounded array.', 400);
            foreach ($ids as $id) if (!is_int($id) || $id < 1) return $this->error('invalid_arguments', 'Term IDs must be positive integers.', 400);
        }
        return null;
    }

    private function content_error(string $content): ?\WP_Error
    {
        return str_contains($content, '<?') || preg_match('~<\s*(?:script|iframe|object|embed)\b|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:~i', $content)
            ? $this->error('executable_content_not_allowed', 'Use safe native content; executable code is not accepted by WordPress content operations.', 422) : null;
    }

    private function term(array $args): array|\WP_Error
    {
        $taxonomy = get_taxonomy($args['taxonomy']);
        if (!$taxonomy instanceof \WP_Taxonomy || empty($taxonomy->show_ui) || in_array($taxonomy->name, ['nav_menu','link_category'], true)) return $this->error('taxonomy_not_allowed', 'This taxonomy is not available.', 403);
        if (!current_user_can((string) ($taxonomy->cap->assign_terms ?? 'edit_posts'))) return $this->error('target_permission_denied', 'This taxonomy is not available to the current account.', 403);
        $term = get_term($args['termId'], $taxonomy->name);
        if (!$term instanceof \WP_Term) return $this->error('term_not_found', 'The term was not found.', 404);
        return ['id'=>(int) $term->term_id, 'taxonomy'=>$taxonomy->name, 'name'=>$term->name, 'slug'=>$term->slug, 'description'=>$term->description, 'parentId'=>(int) $term->parent, 'count'=>(int) $term->count, 'fingerprint'=>$this->core->term_fingerprint((int) $term->term_id, $taxonomy->name)];
    }

    private function delete_term(array $args): array|\WP_Error
    {
        $term = $this->term($args);
        if ($term instanceof \WP_Error) return $term;
        $taxonomy = get_taxonomy($args['taxonomy']);
        if (!current_user_can((string) ($taxonomy->cap->delete_terms ?? 'manage_categories'))) return $this->error('target_permission_denied', 'This account cannot delete the term.', 403);
        if (empty($args['expectedFingerprint']) || !hash_equals($term['fingerprint'], $args['expectedFingerprint'])) return $this->error('stale_term', 'The term changed; read it again before deleting.', 409);
        $deleted = wp_delete_term($term['id'], $term['taxonomy']);
        if (is_wp_error($deleted)) return $deleted;
        return $deleted ? ['deleted'=>true, 'termId'=>$term['id'], 'taxonomy'=>$term['taxonomy']] : $this->error('term_delete_failed', 'The term could not be deleted.', 500);
    }

    private function media(int $id): array|\WP_Error
    {
        $item = $this->core->get_media(['attachmentId'=>$id]);
        if ($item instanceof \WP_Error) return $item;
        $post = get_post($id);
        if (!$post instanceof \WP_Post || $post->post_type !== 'attachment') return $this->error('attachment_not_found', 'The attachment was not found.', 404);
        $item['fingerprint'] = hash('sha256', (string) wp_json_encode([$id,$post->post_modified_gmt,$post->post_title,$post->post_excerpt,$post->post_content,get_post_meta($id, '_wp_attachment_image_alt', true)]));
        return $item;
    }

    private function writable_media(array $args, string $capability): array|\WP_Error
    {
        if (!current_user_can('upload_files') || !current_user_can($capability, $args['attachmentId'])) return $this->error('target_permission_denied', 'This account cannot change the media attachment.', 403);
        $item = $this->media($args['attachmentId']);
        if ($item instanceof \WP_Error) return $item;
        if (empty($args['expectedFingerprint']) || !hash_equals($item['fingerprint'], $args['expectedFingerprint'])) return $this->error('stale_attachment', 'The media changed; read it again before changing it.', 409);
        return $item;
    }

    private function update_media(array $args): array|\WP_Error
    {
        $current = $this->writable_media($args, 'edit_post');
        if ($current instanceof \WP_Error) return $current;
        $post = ['ID'=>$args['attachmentId']];
        foreach (['title'=>'post_title','caption'=>'post_excerpt','description'=>'post_content'] as $field => $column) if (array_key_exists($field, $args['fields'])) $post[$column] = wp_slash(sanitize_textarea_field($args['fields'][$field]));
        $updated = wp_update_post($post, true);
        if (is_wp_error($updated)) return $updated;
        if (array_key_exists('altText', $args['fields'])) update_post_meta($args['attachmentId'], '_wp_attachment_image_alt', sanitize_text_field($args['fields']['altText']));
        return $this->media($args['attachmentId']);
    }

    private function delete_media(array $args): array|\WP_Error
    {
        $current = $this->writable_media($args, 'delete_post');
        if ($current instanceof \WP_Error) return $current;
        return wp_delete_attachment($args['attachmentId'], true) ? ['deleted'=>true, 'attachmentId'=>$args['attachmentId']] : $this->error('attachment_delete_failed', 'The attachment could not be deleted.', 500);
    }

    private function error(string $code, string $message, int $status): \WP_Error { return new \WP_Error($code, $message, ['status'=>$status]); }
}
