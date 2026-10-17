<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Server-authored, bounded context for the WP Admin agent.
 *
 * Query strings and DOM selections are treated as hints. Objects only enter
 * the context after WordPress resolves them and the current user can read
 * them. This keeps a forged `post`, `tag_ID`, or `user_id` from becoming agent
 * authority in a later capability phase.
 */
final class WpAdminContext
{
    private const SCHEMA = 'pixflow.wp-admin.context.v1';
    private const IDENTITY_SCHEMA = 'pixflow.wp-admin.context-identity.v1';

    /**
     * @param array<string, mixed>|null $hints Optional browser navigation hints.
     * @return array<string, mixed>
     */
    public function snapshot(?array $hints = null): array
    {
        $hints = is_array($hints) ? $hints : [];
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        $screen_payload = $this->screen_payload($screen, $hints);
        $object = $this->resolve_object($screen, $screen_payload, $hints);
        if (($object['kind'] ?? '') === 'post') {
            $screen_payload['postType'] = sanitize_key((string) ($object['type'] ?? ''));
        }
        $site_url = untrailingslashit(home_url());
        $site_hash = hash('sha256', $site_url);
        $user_id = get_current_user_id();

        $context = [
            'schema' => self::SCHEMA,
            'surface' => 'wp_admin',
            'source' => 'wordpress-server',
            'revision' => '',
            'site' => [
                'hash' => $site_hash,
                'url' => esc_url_raw($site_url),
                'label' => sanitize_text_field((string) get_bloginfo('name')),
                'multisite' => is_multisite(),
                'blogId' => is_multisite() ? get_current_blog_id() : null,
                'wordpressVersion' => sanitize_text_field((string) get_bloginfo('version')),
            ],
            'user' => [
                'id' => $user_id > 0 ? $user_id : null,
                'loggedIn' => is_user_logged_in(),
                'locale' => sanitize_text_field((string) get_locale()),
            ],
            'screen' => $screen_payload,
            'object' => $object,
            'request' => [
                'path' => $this->request_path(),
            ],
            'capabilities' => $this->capabilities(),
            'integrations' => $this->integrations(),
            'hints' => [
                'selection' => null,
                'trusted' => false,
            ],
        ];

        $context['revision'] = hash('sha256', (string) wp_json_encode([
            $context['site'],
            $context['user'],
            $context['screen'],
            $context['object'],
        ]));

        $context['identity'] = [
            'schema' => self::IDENTITY_SCHEMA,
            'version' => 1,
            'siteHash' => $site_hash,
            'userId' => $user_id > 0 ? (string) $user_id : '',
            'surface' => 'wp_admin',
            'objectKind' => sanitize_key((string) ($object['kind'] ?? 'screen')) ?: 'screen',
            'objectType' => sanitize_key((string) ($object['type'] ?? $screen_payload['postType'] ?? $screen_payload['taxonomy'] ?? '')),
            'objectId' => $object['id'] ?? null,
            'screenId' => sanitize_key((string) ($screen_payload['id'] ?? '')),
            'screenBase' => sanitize_key((string) ($screen_payload['base'] ?? '')),
            'adminArea' => sanitize_key((string) ($screen_payload['parentBase'] ?? $screen_payload['base'] ?? '')),
            'contextRevision' => $context['revision'],
            'contentFingerprint' => is_array($object) && isset($object['contentFingerprint']) ? (string) $object['contentFingerprint'] : null,
        ];

        return $context;
    }

    /**
     * @return array<string, mixed>
     */
    private function screen_payload(?object $screen, array $hints): array
    {
        $id = $screen !== null
            ? sanitize_key((string) ($screen->id ?? ''))
            : sanitize_key((string) ($hints['screenId'] ?? ''));
        $base = $screen !== null
            ? sanitize_key((string) ($screen->base ?? ''))
            : sanitize_key((string) ($hints['base'] ?? ''));
        $post_type = $screen !== null
            ? sanitize_key((string) ($screen->post_type ?? ''))
            : sanitize_key((string) ($hints['postType'] ?? ''));
        $taxonomy = $screen !== null
            ? sanitize_key((string) ($screen->taxonomy ?? ''))
            : sanitize_key((string) ($hints['taxonomy'] ?? ''));

        return [
            'id' => $id,
            'base' => $base,
            'parentBase' => $screen !== null ? sanitize_key((string) ($screen->parent_base ?? '')) : '',
            'postType' => $post_type,
            'taxonomy' => $taxonomy,
            'isAdmin' => function_exists('is_admin') && is_admin(),
            'isBuilder' => false,
            'verified' => $screen !== null,
        ];
    }

    /**
     * @param object|null $screen
     * @param array<string, mixed> $screen_payload
     * @param array<string, mixed> $hints
     * @return array<string, mixed>|null
     */
    private function resolve_object(?object $screen, array $screen_payload, array $hints): ?array
    {
        $post_id = $this->positive_int($hints['postId'] ?? ($_GET['post'] ?? null));
        if ($post_id > 0) {
            $post = get_post($post_id);
            if ($post instanceof \WP_Post
                && (current_user_can('read_post', $post_id) || current_user_can('edit_post', $post_id))) {
                return [
                    'kind' => 'post',
                    'id' => $post_id,
                    'type' => sanitize_key($post->post_type),
                    'status' => sanitize_key($post->post_status),
                    'title' => sanitize_text_field(get_the_title($post_id)),
                    'slug' => sanitize_title($post->post_name),
                    'modifiedGmt' => sanitize_text_field((string) $post->post_modified_gmt),
                    'contentFingerprint' => 'sha256:' . hash('sha256', (string) $post->post_content),
                    'verified' => true,
                ];
            }
        }

        $term_id = $this->positive_int($hints['termId'] ?? ($_GET['tag_ID'] ?? null));
        $taxonomy = sanitize_key((string) ($screen_payload['taxonomy'] ?? ''));
        if ($term_id > 0 && $taxonomy !== '') {
            $term = get_term($term_id, $taxonomy);
            if ($term instanceof \WP_Term && !is_wp_error($term)) {
                return [
                    'kind' => 'term',
                    'id' => $term_id,
                    'type' => sanitize_key($term->taxonomy),
                    'name' => sanitize_text_field($term->name),
                    'slug' => sanitize_title($term->slug),
                    'verified' => true,
                ];
            }
        }

        $user_id = $this->positive_int($hints['userId'] ?? ($_GET['user_id'] ?? null));
        if ($user_id > 0) {
            $user = get_userdata($user_id);
            $can_view_user = current_user_can('list_users') || $user_id === get_current_user_id();
            if ($user instanceof \WP_User && $can_view_user) {
                return [
                    'kind' => 'user',
                    'id' => $user_id,
                    'name' => sanitize_text_field($user->display_name),
                    'login' => sanitize_user($user->user_login, true),
                    'verified' => true,
                ];
            }
        }

        if ($screen !== null && in_array((string) ($screen_payload['base'] ?? ''), ['plugins', 'settings'], true)) {
            return [
                'kind' => (string) ($screen_payload['base'] ?? 'settings'),
                'id' => sanitize_key((string) ($screen_payload['id'] ?? '')),
                'verified' => true,
            ];
        }

        return null;
    }

    /**
     * @return array<string, bool>
     */
    private function capabilities(): array
    {
        return [
            'canUseAgent' => WpAdminSurfacePolicy::can_use(),
            'canEditPosts' => current_user_can('edit_posts'),
            'canManageSettings' => current_user_can('manage_options'),
            'canManagePlugins' => current_user_can('activate_plugins'),
            'canManageUsers' => current_user_can('list_users'),
            'canUploadFiles' => current_user_can('upload_files'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function integrations(): array
    {
        $states = [];
        $catalogue = new WpAdminIntegrationCatalogue();
        foreach (WpAdminIntegrationCatalogue::definitions() as $slug => $_definition) {
            $gate = $catalogue->gate((string) $slug);
            $states[(string) $slug] = [
                'status' => sanitize_key((string) ($gate['status'] ?? 'missing')),
                'available' => ($gate['available'] ?? false) === true,
                'version' => isset($gate['version']) ? sanitize_text_field((string) $gate['version']) : null,
                'edition' => isset($gate['edition']) ? sanitize_key((string) $gate['edition']) : null,
            ];
        }

        return [
            'acf' => ($states['acf']['available'] ?? false) === true,
            'bricks' => ($states['bricks']['available'] ?? false) === true,
            'multisite' => is_multisite(),
            'catalogue' => $states,
        ];
    }

    private function request_path(): string
    {
        // A request path is display context only. Reject malformed server
        // values before decoding; never carry query tokens into the context.
        if (!isset($_SERVER['REQUEST_URI']) || !is_string($_SERVER['REQUEST_URI'])) return '';
        $path = wp_parse_url(wp_unslash($_SERVER['REQUEST_URI']), PHP_URL_PATH);
        return is_string($path) ? sanitize_text_field($path) : '';
    }

    private function positive_int(mixed $value): int
    {
        if (!is_scalar($value) || !is_numeric($value)) {
            return 0;
        }

        return max(0, min(2147483647, (int) $value));
    }
}
