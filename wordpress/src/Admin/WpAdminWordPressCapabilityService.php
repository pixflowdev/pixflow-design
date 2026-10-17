<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

use PixflowDesign\WordPress\Media\MediaLibraryService;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Explicit WordPress Core adapter. It never forwards an arbitrary request
 * array to wp_insert_post/wp_update_post and refuses builder-owned storage.
 */
final class WpAdminWordPressCapabilityService
{
    public function __construct(private readonly MediaLibraryService $media = new MediaLibraryService())
    {
    }

    /** @return list<array<string, mixed>> */
    public function list_posts(array $arguments): array|\WP_Error
    {
        $post_types = $this->list_post_types($arguments);
        if ($post_types instanceof \WP_Error) return $post_types;
        $status = sanitize_key((string) ($arguments['status'] ?? 'any'));
        $allowed_statuses = get_post_stati(['internal' => false], 'names');
        if ($status !== 'any' && !in_array($status, $allowed_statuses, true)) return $this->error('status_not_allowed', 'Post status is not public or registered.', 400);
        $per_page = max(1, min((int) ($arguments['perPage'] ?? 20), 50));
        $page = max(1, min((int) ($arguments['page'] ?? 1), 1000));
        $posts = get_posts([
            'post_type' => $post_types,
            'post_status' => $status,
            's' => sanitize_text_field((string) ($arguments['search'] ?? '')),
            'posts_per_page' => $per_page,
            'paged' => $page,
            'orderby' => 'modified',
            'order' => 'DESC',
            'no_found_rows' => true,
            'ignore_sticky_posts' => true,
        ]);
        $out = [];
        foreach ($posts as $post) {
            if (!$post instanceof \WP_Post || !current_user_can('read_post', $post->ID)) continue;
            $out[] = $this->public_post($post);
        }
        return $out;
    }

    /** @return list<string>|\WP_Error */
    private function list_post_types(array $arguments): array|\WP_Error
    {
        if (array_key_exists('postType', $arguments) && trim((string) $arguments['postType']) !== '') {
            $post_type = $this->post_type((string) $arguments['postType']);
            return $post_type instanceof \WP_Error ? $post_type : [$post_type->name];
        }

        $types = [];
        foreach (get_post_types(['show_ui' => true], 'objects') as $candidate) {
            if (!$candidate instanceof \WP_Post_Type) continue;
            $post_type = $this->post_type($candidate->name);
            if ($post_type instanceof \WP_Error) continue;
            $edit_capability = (string) ($post_type->cap->edit_posts ?? 'edit_posts');
            if (!current_user_can($edit_capability)) continue;
            $types[] = $post_type->name;
        }

        if ($types === []) return $this->error('post_type_not_allowed', 'No supported editable WordPress content types are available.', 403);
        return array_values(array_unique($types));
    }

    /** @return array<string, mixed>|\WP_Error */
    public function list_media(array $arguments): array|\WP_Error
    {
        $type = sanitize_key((string) ($arguments['mimeType'] ?? 'all'));
        return $this->media->list([
            'search' => (string) ($arguments['search'] ?? ''),
            'type' => in_array($type, ['image', 'audio', 'video'], true) ? $type : 'all',
            'page' => max(1, min((int) ($arguments['page'] ?? 1), 1000)),
            'perPage' => max(1, min((int) ($arguments['perPage'] ?? 25), 50)),
        ]);
    }

    /** @return array<string, mixed>|\WP_Error */
    public function get_media(array $arguments): array|\WP_Error
    {
        return $this->media->get((int) ($arguments['attachmentId'] ?? 0));
    }

    /** @return array<string, mixed>|\WP_Error */
    public function list_terms(array $arguments): array|\WP_Error
    {
        $taxonomy = sanitize_key((string) ($arguments['taxonomy'] ?? ''));
        $object = $taxonomy !== '' ? get_taxonomy($taxonomy) : null;
        if (!$object instanceof \WP_Taxonomy || empty($object->show_ui)) return $this->error('taxonomy_not_allowed', 'The taxonomy is not an editable WordPress taxonomy.', 403);
        $assign = $object->cap->assign_terms ?? 'edit_posts';
        if (!current_user_can((string) $assign)) return $this->error('target_permission_denied', 'The current user cannot assign terms in this taxonomy.', 403);
        $terms = get_terms([
            'taxonomy' => $taxonomy,
            'hide_empty' => false,
            'search' => sanitize_text_field((string) ($arguments['search'] ?? '')),
            'number' => max(1, min((int) ($arguments['perPage'] ?? 50), 100)),
        ]);
        if (is_wp_error($terms)) return $terms;
        $items = [];
        foreach (is_array($terms) ? $terms : [] as $term) {
            if (!$term instanceof \WP_Term) continue;
            $items[] = ['id' => (int) $term->term_id, 'name' => sanitize_text_field($term->name), 'slug' => sanitize_title($term->slug), 'parentId' => (int) $term->parent, 'count' => (int) $term->count];
        }
        return ['taxonomy' => $taxonomy, 'terms' => $items];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function get_post(int $post_id): array|\WP_Error
    {
        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) return $this->error('post_not_found', 'Post was not found.', 404);
        if (!$this->readable($post)) return $this->error('target_permission_denied', 'The current user cannot read this post.', 403);
        $public = $this->public_post($post, true);
        $public['fingerprint'] = $this->post_fingerprint($post);
        return $public;
    }

    /** @return array<string, mixed>|\WP_Error */
    public function get_post_metadata(int $post_id): array|\WP_Error
    {
        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) return $this->error('post_not_found', 'Post was not found.', 404);
        if (!$this->readable($post)) return $this->error('target_permission_denied', 'The current user cannot read this post.', 403);
        $public = $this->public_post($post, false);
        $public['terms'] = $this->post_terms($post);
        $uses_block_editor = post_type_supports($post->post_type, 'editor');
        if (function_exists('use_block_editor_for_post')) $uses_block_editor = (bool) use_block_editor_for_post($post);
        elseif (function_exists('use_block_editor_for_post_type')) $uses_block_editor = (bool) use_block_editor_for_post_type($post->post_type);
        $public['schema'] = 'pixflow.wp-admin.post-metadata.v1';
        $public['contentMode'] = 'metadata_only';
        $public['contentIncluded'] = false;
        $public['usesBlockEditor'] = $uses_block_editor;
        $public['completeContentCapability'] = $uses_block_editor ? 'pixflow/wp-admin/gutenberg/read-document' : null;
        return $public;
    }

    /** @return array<string, mixed>|\WP_Error */
    public function create_post(array $arguments): array|\WP_Error
    {
        if ($error = Gutenberg\GutenbergExtensions::authoring_error((string) ($arguments['postType'] ?? 'post'))) return $error;
        $post_type = $this->post_type((string) ($arguments['postType'] ?? 'post'));
        if ($post_type instanceof \WP_Error) return $post_type;
        if (!$this->is_creatable($post_type)) return $this->error('post_type_not_creatable', 'The current user cannot create this post type.', 403);
        $status = sanitize_key((string) ($arguments['status'] ?? 'draft'));
        if (!in_array($status, ['draft', 'pending', 'private', 'publish', 'future'], true)) return $this->error('status_not_allowed', 'This post status is not allowed.', 400);
        if ($status === 'publish' && !$this->can_publish($post_type)) return $this->error('publish_forbidden', 'Publishing requires the post type publish capability.', 403);
        if ($status === 'future') return $this->error('scheduled_create_not_enabled', 'Scheduled creation requires a separately approved date contract.', 403);
        $content = (string) ($arguments['content'] ?? '');
        $builder_guard = $this->builder_content_guard($content);
        if ($builder_guard instanceof \WP_Error) return $builder_guard;
        $parent = (int) ($arguments['parent'] ?? 0);
        if ($parent > 0 && (!is_post_type_hierarchical($post_type->name) || !current_user_can('edit_post', $parent))) {
            return $this->error('parent_forbidden', 'The requested parent is not valid or editable.', 403);
        }
        $terms = array_key_exists('terms', $arguments) ? $this->validate_terms_for_post_type($post_type->name, $arguments['terms']) : null;
        if ($terms instanceof \WP_Error) return $terms;
        $featured_media_id = (int) ($arguments['featuredMediaId'] ?? 0);
        if ($featured_media_id > 0) {
            $attachment = get_post($featured_media_id);
            if (!$attachment instanceof \WP_Post || $attachment->post_type !== 'attachment' || !str_starts_with((string) get_post_mime_type($featured_media_id), 'image/')) {
                return $this->error('featured_media_invalid', 'Featured media must be an existing image attachment.', 400);
            }
            if (!post_type_supports($post_type->name, 'thumbnail')) return $this->error('featured_media_unsupported', 'This post type does not support featured images.', 422);
            if (!current_user_can('upload_files') || !current_user_can('read_post', $featured_media_id)) return $this->error('target_permission_denied', 'The current user cannot use this image attachment.', 403);
        }
        $postarr = [
            'post_type' => $post_type->name,
            'post_status' => $status,
            'post_title' => wp_slash(sanitize_text_field((string) ($arguments['title'] ?? ''))),
            'post_name' => wp_slash(sanitize_title((string) ($arguments['slug'] ?? ''))),
            'post_content' => wp_slash($content),
            'post_excerpt' => wp_slash(sanitize_textarea_field((string) ($arguments['excerpt'] ?? ''))),
            'post_parent' => $parent,
        ];
        $post_id = wp_insert_post($postarr, true);
        if (is_wp_error($post_id)) return $post_id;
        if ($terms !== null) {
            foreach ($terms as $taxonomy => $term_ids) {
                $assigned = wp_set_post_terms((int) $post_id, $term_ids, $taxonomy, false);
                if (is_wp_error($assigned)) {
                    wp_delete_post((int) $post_id, true);
                    return $assigned;
                }
            }
        }
        if ($featured_media_id > 0 && (!set_post_thumbnail((int) $post_id, $featured_media_id) || (int) get_post_thumbnail_id((int) $post_id) !== $featured_media_id)) {
            wp_delete_post((int) $post_id, true);
            return $this->error('featured_media_assignment_failed', 'The featured image could not be assigned; the incomplete draft was removed.', 500);
        }
        $created = get_post((int) $post_id);
        if (!$created instanceof \WP_Post) return $this->error('create_readback_failed', 'The created post could not be read back.', 500);
        return [
            'post' => $this->public_post($created, true),
            'created' => true,
            'rollback' => [
                'supported' => true,
                'policy' => 'trash_created_draft',
                'postId' => (int) $post_id,
                'afterFingerprint' => $this->post_fingerprint($created),
            ],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function rollback_created_post(array $result): array|\WP_Error
    {
        $post_id = (int) ($result['post']['id'] ?? 0);
        $post = $post_id > 0 ? get_post($post_id) : null;
        if (!$post instanceof \WP_Post) return $this->error('rollback_target_missing', 'Created post no longer exists.', 409);
        if ($post->post_status !== 'draft' || !current_user_can('delete_post', $post_id)) return $this->error('rollback_conflict', 'Created post is no longer an untouched draft.', 409);
        if (!wp_trash_post($post_id)) return $this->error('rollback_failed', 'Could not move the created draft to trash.', 500);
        return ['postId' => $post_id, 'result' => 'trashed'];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function rollback_post(array $result): array|\WP_Error
    {
        $post_id = (int) ($result['post']['id'] ?? 0);
        $post = $post_id > 0 ? get_post($post_id) : null;
        $before = is_array($result['before'] ?? null) ? $result['before'] : [];
        if (!$post instanceof \WP_Post || $before === []) return $this->error('rollback_target_missing', 'The update rollback state is unavailable.', 409);
        if (!current_user_can('edit_post', $post_id)) return $this->error('target_permission_denied', 'The current user cannot roll back this post.', 403);
        $postarr = ['ID' => $post_id];
        foreach (['title' => 'post_title', 'slug' => 'post_name', 'content' => 'post_content', 'excerpt' => 'post_excerpt', 'status' => 'post_status', 'parentId' => 'post_parent'] as $key => $wp_key) {
            if (!array_key_exists($key, $before)) continue;
            $postarr[$wp_key] = wp_slash($key === 'parentId' ? (int) $before[$key] : (string) $before[$key]);
        }
        $updated = wp_update_post($postarr, true);
        if (is_wp_error($updated)) return $updated;
        if (is_array($before['terms'] ?? null)) {
            foreach ($before['terms'] as $taxonomy => $term_ids) {
                $assigned = wp_set_post_terms($post_id, is_array($term_ids) ? array_map('intval', $term_ids) : [], sanitize_key((string) $taxonomy), false);
                if (is_wp_error($assigned)) return $assigned;
            }
        }
        return ['postId' => $post_id, 'result' => 'restored', 'fingerprint' => $this->post_fingerprint((get_post($post_id) instanceof \WP_Post) ? get_post($post_id) : $post)];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function update_post(array $arguments): array|\WP_Error
    {
        $post_id = (int) ($arguments['postId'] ?? 0);
        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) return $this->error('post_not_found', 'Post was not found.', 404);
        if ($error = Gutenberg\GutenbergExtensions::authoring_error((string) $post->post_type)) return $error;
        if (!$this->readable($post) || !current_user_can('edit_post', $post_id)) return $this->error('target_permission_denied', 'The current user cannot edit this post.', 403);
        if ($this->builder_owned($post)) return $this->error('builder_owned_target', 'Builder-managed content must use the dedicated builder capability.', 422);
        $expected = sanitize_text_field((string) ($arguments['expectedModifiedGmt'] ?? ''));
        if ($expected === '' || $expected !== (string) $post->post_modified_gmt) return $this->error('stale_revision', 'The post changed since it was read; refresh before updating.', 409);
        if ($this->has_newer_editor_state($post)) return $this->error('editor_state_conflict', 'An autosave or newer revision exists; refresh the editor before updating.', 409);
        if (function_exists('wp_check_post_lock')) {
            $lock = wp_check_post_lock($post_id);
            if ($lock && (int) $lock !== get_current_user_id()) return $this->error('post_locked', 'The post is currently locked by another user.', 409);
        }
        $fields = is_array($arguments['fields'] ?? null) ? $arguments['fields'] : [];
        if ($fields === []) return $this->error('no_fields', 'At least one allowlisted field is required.', 400);
        $unknown = array_values(array_diff(array_keys($fields), ['title', 'slug', 'content', 'excerpt', 'status', 'parent', 'terms']));
        if ($unknown !== []) return $this->error('field_not_allowlisted', 'Only title, slug, content, excerpt, status, parent, and explicitly assigned terms may be changed.', 422);
        $terms = array_key_exists('terms', $fields) ? $this->validate_terms($post, $fields['terms']) : null;
        if ($terms instanceof \WP_Error) return $terms;
        if (array_key_exists('status', $fields)) {
            $status = sanitize_key((string) $fields['status']);
            if (!in_array($status, ['draft', 'pending', 'private', 'publish'], true)) return $this->error('status_not_allowed', 'This post status is not allowed.', 400);
            if ($status === 'publish' && !$this->can_publish(get_post_type_object($post->post_type))) return $this->error('publish_forbidden', 'Publishing requires the post type publish capability.', 403);
        }
        if (array_key_exists('content', $fields)) {
            $guard = $this->builder_content_guard((string) $fields['content']);
            if ($guard instanceof \WP_Error) return $guard;
        }
        if (array_key_exists('parent', $fields)) {
            $parent = (int) $fields['parent'];
            if ($parent < 0 || ($parent > 0 && (!is_post_type_hierarchical($post->post_type) || !current_user_can('edit_post', $parent)))) {
                return $this->error('parent_forbidden', 'The requested parent is not valid or editable.', 403);
            }
        }
        $postarr = ['ID' => $post_id];
        foreach (['title' => 'post_title', 'slug' => 'post_name', 'content' => 'post_content', 'excerpt' => 'post_excerpt', 'status' => 'post_status'] as $input_key => $wp_key) {
            if (!array_key_exists($input_key, $fields)) continue;
            $postarr[$wp_key] = wp_slash($input_key === 'slug' ? sanitize_title((string) $fields[$input_key]) : ($input_key === 'excerpt' ? sanitize_textarea_field((string) $fields[$input_key]) : ($input_key === 'status' ? sanitize_key((string) $fields[$input_key]) : (string) $fields[$input_key])));
        }
        foreach (['parent' => 'post_parent'] as $input_key => $wp_key) {
            if (array_key_exists($input_key, $fields)) $postarr[$wp_key] = (int) $fields[$input_key];
        }
        $updated = wp_update_post($postarr, true);
        if (is_wp_error($updated)) return $updated;
        if ($terms !== null) {
            foreach ($terms as $taxonomy => $term_ids) {
                $assigned = wp_set_post_terms($post_id, $term_ids, $taxonomy, false);
                if (is_wp_error($assigned)) {
                    wp_update_post(['ID' => $post_id, 'post_title' => wp_slash($post->post_title), 'post_name' => wp_slash($post->post_name), 'post_content' => wp_slash($post->post_content), 'post_excerpt' => wp_slash($post->post_excerpt), 'post_status' => $post->post_status, 'post_parent' => $post->post_parent]);
                    foreach ($this->post_terms($post) as $before_taxonomy => $before_ids) wp_set_post_terms($post_id, $before_ids, $before_taxonomy, false);
                    return $assigned;
                }
            }
        }
        $after = get_post($post_id);
        if (!$after instanceof \WP_Post) return $this->error('update_readback_failed', 'The updated post could not be read back.', 500);
        return [
            'post' => $this->public_post($after, true),
            'updatedFields' => array_values(array_keys($fields)),
            'before' => $this->public_post($post, true),
            'beforeFingerprint' => $this->post_fingerprint($post),
            'afterFingerprint' => $this->post_fingerprint($after),
            'revisionId' => $this->latest_revision_id($post_id),
            'rollback' => ['supported' => true, 'policy' => 'recorded_before_state'],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function trash_post(array $arguments): array|\WP_Error
    {
        $post_id = (int) ($arguments['postId'] ?? 0);
        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) return $this->error('post_not_found', 'Post was not found.', 404);
        if ($post->post_status === 'trash') return $this->error('post_already_trashed', 'The post is already in trash.', 409);
        if (!$this->readable($post) || !current_user_can('delete_post', $post_id)) return $this->error('target_permission_denied', 'The current user cannot trash this post.', 403);
        if ($this->builder_owned($post)) return $this->error('builder_owned_target', 'Builder-managed content must use the dedicated builder capability.', 422);
        $expected = sanitize_text_field((string) ($arguments['expectedModifiedGmt'] ?? ''));
        if ($expected === '' || $expected !== (string) $post->post_modified_gmt) return $this->error('stale_revision', 'The post changed since it was read; refresh before trashing.', 409);
        $expected_fingerprint = sanitize_text_field((string) ($arguments['expectedFingerprint'] ?? ''));
        if ($expected_fingerprint !== '' && !hash_equals($expected_fingerprint, $this->post_fingerprint($post))) {
            return $this->error('stale_revision', 'The post changed since it was read; refresh before trashing.', 409);
        }
        if ($this->has_newer_editor_state($post)) return $this->error('editor_state_conflict', 'An autosave or newer revision exists; refresh before trashing.', 409);
        if (function_exists('wp_check_post_lock')) {
            $lock = wp_check_post_lock($post_id);
            if ($lock && (int) $lock !== get_current_user_id()) return $this->error('post_locked', 'The post is currently locked by another user.', 409);
        }

        $trashed = wp_trash_post($post_id);
        $after = get_post($post_id);
        if (!$trashed || !$after instanceof \WP_Post || $after->post_status !== 'trash') {
            return $this->error('trash_readback_failed', 'The post could not be verified in WordPress trash.', 500);
        }

        return [
            'postId' => $post_id,
            'result' => 'trashed',
            'before' => $this->public_post($post, true),
            'beforeStatus' => sanitize_key($post->post_status),
            'beforeFingerprint' => $this->post_fingerprint($post),
            'afterFingerprint' => 'trash:' . $post_id,
            'rollback' => ['supported' => true, 'policy' => 'restore_trashed_post'],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function rollback_trashed_post(array $result): array|\WP_Error
    {
        $post_id = (int) ($result['postId'] ?? 0);
        $post = $post_id > 0 ? get_post($post_id) : null;
        if (!$post instanceof \WP_Post || $post->post_status !== 'trash') return $this->error('rollback_target_missing', 'The trashed post is no longer available for restoration.', 409);
        if (!current_user_can('delete_post', $post_id)) return $this->error('target_permission_denied', 'The current user cannot restore this post.', 403);
        $restored = wp_untrash_post($post_id);
        $after = get_post($post_id);
        if (!$restored || !$after instanceof \WP_Post || $after->post_status === 'trash') return $this->error('rollback_failed', 'The trashed post could not be restored.', 500);
        return ['postId' => $post_id, 'result' => 'restored', 'fingerprint' => $this->post_fingerprint($after)];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function restore_post(array $arguments): array|\WP_Error
    {
        $post_id = (int) ($arguments['postId'] ?? 0);
        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) return $this->error('post_not_found', 'Post was not found.', 404);
        if ($post->post_status !== 'trash') return $this->error('post_not_trashed', 'Only content currently in trash can be restored.', 409);
        if (!$this->readable($post) || !current_user_can('delete_post', $post_id)) return $this->error('target_permission_denied', 'The current user cannot restore this post.', 403);
        if ($this->builder_owned($post)) return $this->error('builder_owned_target', 'Builder-managed content must use the dedicated builder capability.', 422);
        $expected = sanitize_text_field((string) ($arguments['expectedModifiedGmt'] ?? ''));
        if ($expected === '' || $expected !== (string) $post->post_modified_gmt) return $this->error('stale_revision', 'The trashed post changed since it was read; refresh before restoring.', 409);
        $expected_fingerprint = sanitize_text_field((string) ($arguments['expectedFingerprint'] ?? ''));
        if ($expected_fingerprint !== '' && !hash_equals($expected_fingerprint, $this->post_fingerprint($post))) {
            return $this->error('stale_revision', 'The trashed post changed since it was read; refresh before restoring.', 409);
        }

        $before = $this->public_post($post, true);
        $before_fingerprint = $this->post_fingerprint($post);
        $restored = wp_untrash_post($post_id);
        $after = get_post($post_id);
        if (!$restored || !$after instanceof \WP_Post || $after->post_status === 'trash') {
            return $this->error('restore_readback_failed', 'The post could not be verified after restoration.', 500);
        }

        return [
            'post' => $this->public_post($after, true),
            'postId' => $post_id,
            'result' => 'restored',
            'before' => $before,
            'beforeFingerprint' => $before_fingerprint,
            'afterFingerprint' => $this->post_fingerprint($after),
            'rollback' => ['supported' => true, 'policy' => 'retrash_restored_post'],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function rollback_restored_post(array $result): array|\WP_Error
    {
        $post_id = (int) ($result['postId'] ?? 0);
        $post = $post_id > 0 ? get_post($post_id) : null;
        if (!$post instanceof \WP_Post || $post->post_status === 'trash') return $this->error('rollback_target_missing', 'The restored post is no longer available for rollback.', 409);
        if (!current_user_can('delete_post', $post_id)) return $this->error('target_permission_denied', 'The current user cannot return this post to trash.', 403);
        $trashed = wp_trash_post($post_id);
        $after = get_post($post_id);
        if (!$trashed || !$after instanceof \WP_Post || $after->post_status !== 'trash') return $this->error('rollback_failed', 'The restored post could not be returned to trash.', 500);
        return ['postId' => $post_id, 'result' => 'retrashed', 'fingerprint' => $this->post_fingerprint($after)];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function create_term(array $arguments): array|\WP_Error
    {
        $taxonomy = $this->taxonomy_for_write((string) ($arguments['taxonomy'] ?? ''));
        if ($taxonomy instanceof \WP_Error) return $taxonomy;
        $name = sanitize_text_field((string) ($arguments['name'] ?? ''));
        if ($name === '' || strlen($name) > 200) return $this->error('term_name_invalid', 'A bounded term name is required.', 400);
        $manage = (string) ($taxonomy->cap->manage_terms ?? 'manage_categories');
        if (!current_user_can($manage)) return $this->error('target_permission_denied', 'The current user cannot manage terms in this taxonomy.', 403);
        $parent = (int) ($arguments['parent'] ?? 0);
        if ($parent < 0 || ($parent > 0 && !term_exists($parent, $taxonomy->name))) return $this->error('term_parent_invalid', 'The requested term parent does not exist.', 400);
        $result = wp_insert_term($name, $taxonomy->name, [
            'slug' => sanitize_title((string) ($arguments['slug'] ?? '')),
            'description' => sanitize_textarea_field((string) ($arguments['description'] ?? '')),
            'parent' => $parent,
        ]);
        if (is_wp_error($result)) return $result;
        $term = get_term((int) ($result['term_id'] ?? 0), $taxonomy->name);
        if (!$term instanceof \WP_Term) return $this->error('term_readback_failed', 'The created term could not be read back.', 500);
        return [
            'term' => $this->public_term($term),
            'created' => true,
            'afterFingerprint' => $this->build_term_fingerprint($term),
            'rollback' => ['supported' => true, 'policy' => 'delete_unused_created_term', 'termId' => (int) $term->term_id, 'taxonomy' => $taxonomy->name],
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function rollback_created_term(array $result): array|\WP_Error
    {
        $taxonomy = sanitize_key((string) ($result['taxonomy'] ?? $result['term']['taxonomy'] ?? ''));
        $term_id = (int) ($result['termId'] ?? $result['term']['id'] ?? 0);
        $taxonomy_object = $this->taxonomy_for_write($taxonomy);
        if ($taxonomy_object instanceof \WP_Error) return $taxonomy_object;
        if ($term_id <= 0 || !term_exists($term_id, $taxonomy)) return $this->error('rollback_target_missing', 'The created term no longer exists.', 409);
        if (!current_user_can((string) ($taxonomy_object->cap->delete_terms ?? 'manage_categories'))) return $this->error('target_permission_denied', 'The current user cannot remove this term.', 403);
        $term = get_term($term_id, $taxonomy);
        if (!$term instanceof \WP_Term || (int) $term->count > 0) return $this->error('rollback_conflict', 'The term is now in use and cannot be removed automatically.', 409);
        if (!wp_delete_term($term_id, $taxonomy)) return $this->error('rollback_failed', 'The created term could not be removed.', 500);
        return ['termId' => $term_id, 'taxonomy' => $taxonomy, 'result' => 'deleted'];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function update_term(array $arguments): array|\WP_Error
    {
        $taxonomy = $this->taxonomy_for_write((string) ($arguments['taxonomy'] ?? ''));
        if ($taxonomy instanceof \WP_Error) return $taxonomy;
        $term_id = (int) ($arguments['termId'] ?? 0);
        $term = $term_id > 0 ? get_term($term_id, $taxonomy->name) : null;
        if (!$term instanceof \WP_Term) return $this->error('term_not_found', 'The requested term was not found.', 404);
        $edit = (string) ($taxonomy->cap->edit_terms ?? 'manage_categories');
        if (!current_user_can($edit)) return $this->error('target_permission_denied', 'The current user cannot edit terms in this taxonomy.', 403);
        $expected = sanitize_text_field((string) ($arguments['expectedFingerprint'] ?? ''));
        if ($expected === '' || !hash_equals($expected, $this->build_term_fingerprint($term))) return $this->error('stale_term', 'The term changed; refresh before updating.', 409);
        $fields = is_array($arguments['fields'] ?? null) ? $arguments['fields'] : [];
        $unknown = array_diff(array_keys($fields), ['name', 'slug', 'description', 'parent']);
        if ($unknown !== []) return $this->error('field_not_allowlisted', 'Only name, slug, description, and parent may be changed.', 422);
        $parent = array_key_exists('parent', $fields) ? (int) $fields['parent'] : (int) $term->parent;
        if ($parent < 0 || ($parent > 0 && !term_exists($parent, $taxonomy->name))) return $this->error('term_parent_invalid', 'The requested term parent does not exist.', 400);
        $before = $this->public_term($term);
        $updated = wp_update_term($term_id, $taxonomy->name, [
            'name' => array_key_exists('name', $fields) ? sanitize_text_field((string) $fields['name']) : $term->name,
            'slug' => array_key_exists('slug', $fields) ? sanitize_title((string) $fields['slug']) : $term->slug,
            'description' => array_key_exists('description', $fields) ? sanitize_textarea_field((string) $fields['description']) : $term->description,
            'parent' => $parent,
        ]);
        if (is_wp_error($updated)) return $updated;
        $after_term = get_term($term_id, $taxonomy->name);
        if (!$after_term instanceof \WP_Term) return $this->error('term_readback_failed', 'The updated term could not be read back.', 500);
        return ['term' => $this->public_term($after_term), 'before' => $before, 'beforeFingerprint' => $this->build_term_fingerprint($term), 'afterFingerprint' => $this->build_term_fingerprint($after_term), 'rollback' => ['supported' => true, 'policy' => 'recorded_before_state']];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function rollback_term(array $result): array|\WP_Error
    {
        $before = is_array($result['before'] ?? null) ? $result['before'] : [];
        $taxonomy = $this->taxonomy_for_write((string) ($before['taxonomy'] ?? $result['term']['taxonomy'] ?? ''));
        if ($taxonomy instanceof \WP_Error || $before === []) return $taxonomy instanceof \WP_Error ? $taxonomy : $this->error('rollback_state_missing', 'Term rollback state is unavailable.', 409);
        $term_id = (int) ($before['id'] ?? 0);
        $current = $term_id > 0 ? get_term($term_id, $taxonomy->name) : null;
        if (!$current instanceof \WP_Term) return $this->error('rollback_target_missing', 'The term no longer exists.', 409);
        if (!current_user_can((string) ($taxonomy->cap->edit_terms ?? 'manage_categories'))) return $this->error('target_permission_denied', 'The current user cannot roll back this term.', 403);
        $updated = wp_update_term($term_id, $taxonomy->name, ['name' => $before['name'], 'slug' => $before['slug'], 'description' => $before['description'], 'parent' => (int) ($before['parentId'] ?? 0)]);
        if (is_wp_error($updated)) return $updated;
        return ['termId' => $term_id, 'taxonomy' => $taxonomy->name, 'result' => 'restored'];
    }

    /** @return array<string, mixed> */
    private function public_post(\WP_Post $post, bool $include_content = false): array
    {
        $data = [
            'id' => (int) $post->ID,
            'type' => sanitize_key($post->post_type),
            'status' => sanitize_key($post->post_status),
            'title' => sanitize_text_field($post->post_title),
            'slug' => sanitize_title($post->post_name),
            'excerpt' => sanitize_textarea_field($post->post_excerpt),
            'modifiedGmt' => sanitize_text_field($post->post_modified_gmt),
            'authorId' => (int) $post->post_author,
            'parentId' => (int) $post->post_parent,
            'permalink' => esc_url_raw((string) get_permalink($post)),
            'featuredMediaId' => (int) get_post_thumbnail_id($post->ID),
        ];
        if ($include_content) {
            $data['content'] = wp_kses_post($post->post_content);
            $data['terms'] = $this->post_terms($post);
        }
        $data['fingerprint'] = $this->post_fingerprint($post);
        return $data;
    }

    private function readable(\WP_Post $post): bool
    {
        return current_user_can('read_post', (int) $post->ID)
            && ($post->post_status === 'publish' || current_user_can('edit_post', (int) $post->ID));
    }

    private function is_creatable(?\WP_Post_Type $post_type): bool
    {
        return $post_type instanceof \WP_Post_Type && !in_array($post_type->name, ['attachment', 'revision', 'nav_menu_item'], true)
            && !empty($post_type->show_ui)
            && current_user_can($post_type->cap->create_posts ?: 'edit_posts');
    }

    private function can_publish(?\WP_Post_Type $post_type): bool
    {
        return $post_type instanceof \WP_Post_Type && current_user_can($post_type->cap->publish_posts ?: 'publish_posts');
    }

    private function post_type(string $post_type): \WP_Post_Type|\WP_Error
    {
        $post_type = sanitize_key($post_type !== '' ? $post_type : 'post');
        $object = get_post_type_object($post_type);
        if (!$object instanceof \WP_Post_Type || empty($object->show_ui)) return $this->error('post_type_not_allowed', 'The post type is not a supported editable WordPress resource.', 403);
        if (in_array($post_type, ['attachment', 'revision', 'nav_menu_item', 'bricks_template'], true)
            || preg_match('/(?:bricks|elementor|breakdance|fl_builder)/i', $post_type) === 1) {
            return $this->error('builder_or_system_type', 'This post type requires a dedicated integration capability.', 422);
        }
        return $object;
    }

    private function taxonomy_for_write(string $taxonomy): \WP_Taxonomy|\WP_Error
    {
        $taxonomy = sanitize_key($taxonomy);
        $object = $taxonomy !== '' ? get_taxonomy($taxonomy) : null;
        if (!$object instanceof \WP_Taxonomy || empty($object->show_ui) || in_array($taxonomy, ['nav_menu', 'link_category'], true)) return $this->error('taxonomy_not_allowed', 'The taxonomy is not an editable WordPress resource.', 403);
        return $object;
    }

    /** @return array<string, mixed> */
    private function public_term(\WP_Term $term): array
    {
        return ['id' => (int) $term->term_id, 'taxonomy' => sanitize_key($term->taxonomy), 'name' => sanitize_text_field($term->name), 'slug' => sanitize_title($term->slug), 'description' => sanitize_textarea_field($term->description), 'parentId' => (int) $term->parent, 'count' => (int) $term->count];
    }

    private function build_term_fingerprint(\WP_Term $term): string
    {
        return hash('sha256', (string) wp_json_encode($this->public_term($term)));
    }

    public function term_fingerprint(int $term_id, string $taxonomy): string
    {
        if ($term_id < 1 || $taxonomy === '') return '';
        $term = get_term($term_id, sanitize_key($taxonomy));
        return $term instanceof \WP_Term ? $this->build_term_fingerprint($term) : '';
    }

    public function fingerprint(int $post_id): string
    {
        $post = get_post($post_id);
        return $post instanceof \WP_Post ? $this->post_fingerprint($post) : '';
    }

    private function builder_owned(\WP_Post $post): bool
    {
        if (str_contains(strtolower($post->post_type), 'bricks')) return true;
        foreach (['_bricks_page_content_2', '_bricks_page_header_2', '_bricks_page_footer_2', '_elementor_data', '_breakdance_data', '_fl_builder_data'] as $key) {
            if (get_post_meta($post->ID, $key, true) !== '') return true;
        }
        return false;
    }

    private function builder_content_guard(string $content): ?\WP_Error
    {
        if (stripos($content, '<!-- wp:') !== false) {
            return $this->error(
                'gutenberg_content_requires_dedicated_capability',
                'Serialized Block Editor content must use the dedicated Gutenberg document capability.',
                422,
            );
        }
        foreach (['<!-- wp:bricks/', '<!-- wp:elementor/', '[vc_row', '[et_pb_section'] as $marker) {
            if (stripos($content, $marker) !== false) return $this->error('builder_content_rejected', 'Builder-managed markup must use its dedicated integration capability.', 422);
        }
        return null;
    }

    private function has_newer_editor_state(\WP_Post $post): bool
    {
        if (function_exists('wp_get_post_autosave')) {
            $autosave = wp_get_post_autosave($post->ID);
            if ($autosave instanceof \WP_Post && strtotime((string) $autosave->post_modified_gmt) > strtotime((string) $post->post_modified_gmt)) return true;
        }
        if (function_exists('wp_get_post_revisions')) {
            $revisions = wp_get_post_revisions(['post_parent' => $post->ID, 'posts_per_page' => 1, 'check_enabled' => false]);
            $revision = is_array($revisions) ? reset($revisions) : null;
            if ($revision instanceof \WP_Post && strtotime((string) $revision->post_modified_gmt) > strtotime((string) $post->post_modified_gmt)) return true;
        }
        return false;
    }

    private function latest_revision_id(int $post_id): ?int
    {
        if (!function_exists('wp_get_post_revisions')) return null;
        $revisions = wp_get_post_revisions(['post_parent' => $post_id, 'posts_per_page' => 1, 'check_enabled' => false]);
        $revision = is_array($revisions) ? reset($revisions) : null;
        return $revision instanceof \WP_Post ? (int) $revision->ID : null;
    }

    /** @return array<string, list<int>>|\WP_Error|null */
    private function validate_terms(\WP_Post $post, mixed $raw): array|\WP_Error|null
    {
        return $this->validate_terms_for_post_type($post->post_type, $raw);
    }

    /** @return array<string, list<int>>|\WP_Error|null */
    private function validate_terms_for_post_type(string $post_type, mixed $raw): array|\WP_Error|null
    {
        if (!is_array($raw) || array_is_list($raw)) return $this->error('terms_invalid', 'Terms must be an object keyed by taxonomy.', 400);
        $out = [];
        foreach ($raw as $taxonomy => $ids) {
            $taxonomy = sanitize_key((string) $taxonomy);
            $object = get_taxonomy($taxonomy);
            if (!$object instanceof \WP_Taxonomy || !is_object_in_taxonomy($post_type, $taxonomy)) return $this->error('taxonomy_not_allowed', 'The taxonomy is not registered for this post type.', 403);
            $assign = $object->cap->assign_terms ?? 'edit_posts';
            if (!current_user_can((string) $assign)) return $this->error('target_permission_denied', 'The current user cannot assign this taxonomy.', 403);
            if (!is_array($ids) || count($ids) > 100) return $this->error('terms_invalid', 'A taxonomy assignment must be a bounded list of term IDs or slugs.', 400);
            $normalised = [];
            foreach ($ids as $raw_id) {
                $id = is_int($raw_id) || (is_string($raw_id) && ctype_digit($raw_id)) ? (int) $raw_id : 0;
                if ($id <= 0 && is_string($raw_id) && trim($raw_id) !== '') {
                    $term = get_term_by('slug', sanitize_title($raw_id), $taxonomy);
                    if (!$term instanceof \WP_Term) $term = get_term_by('name', sanitize_text_field($raw_id), $taxonomy);
                    $id = $term instanceof \WP_Term ? (int) $term->term_id : 0;
                }
                if ($id <= 0 || !term_exists($id, $taxonomy)) return $this->error('term_not_found', 'A requested term does not exist in this taxonomy.', 404);
                $normalised[] = $id;
            }
            $normalised = array_values(array_unique($normalised));
            $out[$taxonomy] = $normalised;
        }
        return $out;
    }

    /** @return array<string, list<int>> */
    private function post_terms(\WP_Post $post): array
    {
        $out = [];
        foreach (get_object_taxonomies($post->post_type, 'objects') as $taxonomy => $object) {
            if (!$object instanceof \WP_Taxonomy || !$object->publicly_queryable) continue;
            $ids = wp_get_post_terms($post->ID, $taxonomy, ['fields' => 'ids']);
            if (is_array($ids) && $ids !== []) $out[sanitize_key((string) $taxonomy)] = array_values(array_map('intval', $ids));
        }
        return $out;
    }

    /** @return array<string, mixed> */
    private function post_fingerprint(\WP_Post $post): string
    {
        $terms = $this->post_terms($post);
        return hash('sha256', wp_json_encode([
            'id' => (int) $post->ID,
            'modified' => (string) $post->post_modified_gmt,
            'status' => (string) $post->post_status,
            'title' => (string) $post->post_title,
            'content' => hash('sha256', (string) $post->post_content),
            'terms' => $terms,
            'featuredMediaId' => (int) get_post_thumbnail_id($post->ID),
        ]));
    }

    private function error(string $code, string $message, int $status): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status]);
    }
}
