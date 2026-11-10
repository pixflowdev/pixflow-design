<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Http;

if (!defined('ABSPATH')) exit;

use PixflowDesign\WordPress\Admin\DirectSiteWorkspace;
use PixflowDesign\WordPress\Admin\DirectCanvasRelay;
use PixflowDesign\WordPress\Admin\WpAdminPairingService;

/** A short-lived, site/user-bound tool connection. */
final class DirectSiteRestController
{
    private const SETTING = 'pixflow_direct_guarded';
    private ?array $session = null;

    public function register_routes(): void
    {
        foreach (['settings' => ['GET', 'POST'], 'sessions' => ['POST']] as $path => $methods) {
            register_rest_route('pixflow-design/v1', '/wp-admin/direct/' . $path, [
                'methods' => $methods, 'callback' => [$this, $path],
                'permission_callback' => [$this, 'owner_permission'],
            ]);
        }
        register_rest_route('pixflow-design/v1', '/wp-admin/direct/tools', [
            'methods' => 'POST', 'callback' => [$this, 'tools'],
            'permission_callback' => [$this, 'session_permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/direct/session', [
            'methods' => ['GET', 'DELETE'], 'callback' => [$this, 'session'],
            'permission_callback' => [$this, 'session_permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/direct/canvas', [
            'methods' => 'POST', 'callback' => [$this, 'canvas'],
            'permission_callback' => [$this, 'owner_permission'],
        ]);
    }

    public function owner_permission(\WP_REST_Request $request): bool
    {
        return (new WpAdminPairingService())->authenticate_request($request) && current_user_can('manage_options');
    }

    public function settings(\WP_REST_Request $request): array
    {
        // Compatibility for cached clients: retire the saved preference on read
        // as well as write. Authentication remains in owner_permission.
        update_user_meta(get_current_user_id(), $this->setting_key(), false);
        return ['guarded' => false];
    }

    public function sessions(\WP_REST_Request $request): array|\WP_Error
    {
        $body = $request->get_json_params();
        if (($body['purpose'] ?? '') !== 'guidance-draft' && get_user_meta(get_current_user_id(), $this->setting_key(), true)) update_user_meta(get_current_user_id(), $this->setting_key(), false);
        $token = 'pfdirect_' . bin2hex(random_bytes(32));
        // Legacy mode values are accepted but no longer restrict a new session.
        // Existing tokens retain their original permissions until expiration.
        $session = ['userId' => get_current_user_id(), 'blogId' => get_current_blog_id(), 'writable' => !in_array($body['purpose'] ?? '', ['audio', 'external-mcp', 'guidance-draft'], true), 'expiresAt' => time() + 3600];
        if (isset($body['workspaceSource'])) {
            if (isset($body['editorTarget']) || !$session['writable']) return new \WP_Error('workspace_source_invalid', 'Workspace handoff sessions cannot also target an editor or an audio-only connection.', ['status' => 400]);
            $source = (new \PixflowDesign\WordPress\Pages\BuilderHandoffs())->workspace_source($body['workspaceSource']);
            if ($source instanceof \WP_Error) return $source;
            $session['workspaceSource'] = $source;
        }
        if (isset($body['editorTarget'])) {
            try {
                $target = $body['editorTarget'];
                $session['editorTarget'] = (new DirectCanvasRelay((string) ($target['builder'] ?? '')))
                    ->target((string) ($target['canvasId'] ?? ''), (int) ($target['postId'] ?? 0), is_array($target['entity'] ?? null) ? $target['entity'] : null);
            } catch (\Throwable $error) { return new \WP_Error('editor_unavailable', $error->getMessage(), ['status' => 409]); }
        }
        // Premium guidance is resolved after authorization, never accepted from request JSON.
        // Do not retain an extra copy in the credential transient or expose guidance on draft/audio sessions.
        $guidance = $session['writable'] ? apply_filters('pixflow_design_run_guidance', null) : null;
        $extra = [];
        if (isset($body['historyBinding'])) {
            $binding = $body['historyBinding'];
            if (!is_array($binding) || !is_string($binding['projectId'] ?? null) || !is_string($binding['conversationId'] ?? null)) {
                return new \WP_Error('pixflow_history_invalid', 'Invalid conversation.', ['status' => 400]);
            }
            if (!current_user_can('edit_posts')) {
                return new \WP_Error('pixflow_history_forbidden', 'Chat history access is required.', ['status' => 403]);
            }
            // HistoryService enforces ownership of the conversation for the signed-in user.
            $history = new \PixflowDesign\WordPress\Chat\HistoryService();
            if (($body['restorePanel'] ?? false) === true && !isset($binding['throughMessageId'])) {
                $latest = $history->page($binding['projectId'], $binding['conversationId'], 1);
                if (is_wp_error($latest)) return $latest;
                if (!empty($latest['messages'][0]['id'])) $binding['throughMessageId'] = $latest['messages'][0]['id'];
            }
            if (isset($binding['throughMessageId'])) {
                $through = $binding['throughMessageId'];
                if (!is_string($through) || $through === '' || strlen($through) > 191) return new \WP_Error('pixflow_history_invalid', 'Invalid history cutoff.', ['status' => 400]);
                $revision = $history->prefix_revision($binding['projectId'], $binding['conversationId'], $through);
                if (is_wp_error($revision)) return $revision;
                $session['historyPrefix'] = [$binding['projectId'], $binding['conversationId'], $through, $revision];
                $extra['historyRevision'] = $revision;
                $extra['historyThrough'] = $through;
            }
            $restorePanel = isset($session['historyPrefix']) && ($body['restorePanel'] ?? false) === true;
            $page = $history->page($binding['projectId'], $binding['conversationId'], $restorePanel || !isset($session['historyPrefix']) ? 50 : 100);
            if (is_wp_error($page)) return $page;
            if ($restorePanel) {
                // The browser restores the latest 50 rows. Send may also need the older prefix.
                $extra['historyWindow'] = ['nextCursor' => $page['nextCursor'], 'hasMore' => $page['hasMore']];
            }
            // Avoid a second WordPress bootstrap for moderately long chats. Keep the
            // response bounded; larger transcripts continue with the normal cursor.
            if (isset($session['historyPrefix']) && $page['hasMore']) {
                $remainingBytes = 512 * 1024 - strlen((string) wp_json_encode($page['messages']));
                $extraPages = 4;
                for ($i = 0; $i < $extraPages && $remainingBytes > 0 && $page['hasMore']; ++$i) {
                    $older = $history->page($binding['projectId'], $binding['conversationId'], 100, $page['nextCursor']);
                    if (is_wp_error($older)) return $older;
                    $remainingBytes -= strlen((string) wp_json_encode($older['messages']));
                    if ($remainingBytes < 0) break;
                    $page = ['messages' => array_merge($older['messages'], $page['messages']), 'hasMore' => $older['hasMore'], 'nextCursor' => $older['nextCursor']];
                }
            }
            $extra['historyPage'] = $page;
        }
        set_transient($this->key($token), $session, 3600);
        return $extra + ['designGuidance' => is_array($guidance) ? $guidance : null, 'token' => $token, 'endpoint' => add_query_arg('rest_route', '/pixflow-design/v1/wp-admin/direct/tools', home_url('/')), 'expiresAt' => $session['expiresAt'], 'writable' => $session['writable'], 'identity' => $this->identity($session), 'editorTarget' => $session['editorTarget'] ?? null, 'workspaceSource' => $session['workspaceSource'] ?? null];
    }

    public function session_permission(\WP_REST_Request $request): bool
    {
        $this->session = null;
        $token = $this->token($request);
        if (!preg_match('/^pfdirect_[a-f0-9]{64}$/D', $token)) return false;
        $session = get_transient($this->key($token));
        if (!is_array($session) || $session['expiresAt'] <= time() || $session['blogId'] !== get_current_blog_id()) return false;
        wp_set_current_user((int) $session['userId']);
        if (!current_user_can('manage_options')) return false;
        $this->session = $session;
        return true;
    }

    public function tools(\WP_REST_Request $request): mixed
    {
        if (!$this->session) return new \WP_Error('unauthorized', 'A direct session is required.', ['status' => 403]);
        $body = $request->get_json_params();
        try {
            $tool = (string) ($body['tool'] ?? '');
            if (str_starts_with($tool, 'bricks.')) \PixflowDesign\WordPress\Modules\BuilderIntegrations::require_service('bricks', 'active');
            $args = is_array($body['arguments'] ?? null) ? $body['arguments'] : [];
            if ($tool === 'provider.turn') return (new \PixflowDesign\WordPress\Http\Routes\ProviderSettingsRoutes())->agent_turn($args);
            $builder = str_starts_with($tool, 'gutenberg.') ? 'gutenberg' : (str_starts_with($tool, 'elementor.') ? 'elementor' : (str_starts_with($tool, 'etch.') ? 'etch' : 'bricks'));
            if ($builder !== 'bricks') $args = $this->native_payload($request, 'arguments');
            if ($builder === 'etch' && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('etch')) throw new \RuntimeException('Etch is not active.');
            if ($builder === 'elementor' && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('elementor')) throw new \RuntimeException('Elementor is not active.');
            if (!str_starts_with($tool, $builder . '.')) return (new DirectSiteWorkspace($this->session['workspaceSource'] ?? null))->call($tool, $args, $this->session['writable']);
            $relay = new DirectCanvasRelay($builder);
            if ($builder === 'gutenberg' && ($this->session['editorTarget']['builder'] ?? '') === 'bricks') {
                $this->session['editorTarget'] = (new DirectCanvasRelay('bricks'))->navigation_target($this->session['editorTarget']);
            }
            if ($tool === $builder . '.canvases') return $relay->listing($this->session['editorTarget'] ?? null);
            if ($tool === $builder . '.context') {
                $relay->assert_target((string) ($args['canvasId'] ?? ''), $this->session['editorTarget'] ?? null);
                return $relay->context((string) ($args['canvasId'] ?? ''), (string) ($args['revision'] ?? ''));
            }
            if ($tool === $builder . '.result') return $relay->result((string) ($args['commandId'] ?? ''), $this->key($this->token($request)));
            if (str_starts_with($tool, $builder . '.')) return $relay->submit((string) ($args['canvasId'] ?? ''), $tool, $args, $this->session, $this->key($this->token($request)));
            return (new DirectSiteWorkspace($this->session['workspaceSource'] ?? null))->call((string) ($body['tool'] ?? ''), is_array($body['arguments'] ?? null) ? $body['arguments'] : [], $this->session['writable']);
        } catch (\Throwable $error) {
            return new \WP_Error('site_tool_error', $error->getMessage(), ['status' => 400]);
        }
    }

    public function canvas(\WP_REST_Request $request): mixed
    {
        $body = $request->get_json_params();
        $builder = (string) ($body['builder'] ?? 'bricks');
        if (!in_array($builder, ['bricks', 'etch', 'elementor', 'gutenberg'], true)) return new \WP_Error('builder_unavailable', 'Unknown builder.', ['status' => 400]);
        $available = $builder === 'gutenberg' || ($builder === 'elementor' ? \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('elementor') : ($builder === 'etch' ? \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('etch') : \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks')));
        if (!$available) {
            if (\PixflowDesign\WordPress\Modules\BuilderIntegrations::present($builder))
                return new \WP_Error('pixflow_pro_required', 'Pixflow Design Pro access could not be verified. Check the saved licence status; the editor will reconnect when access is restored.', ['status' => 403]);
            return new \WP_Error('builder_unavailable', 'The builder integration is unavailable. Check that the builder and Pixflow Design Pro are active.', ['status' => 409]);
        }
        $relay = new DirectCanvasRelay($builder);
        try {
            $id = (string) ($body['canvasId'] ?? '');
            if ($builder === 'gutenberg' && empty($body['entity']) && in_array($body['action'] ?? '', ['register', 'poll'], true)) \PixflowDesign\WordPress\Admin\Gutenberg\WpAdminGutenbergEditorBridge::require_post((int) ($body['postId'] ?? 0));
            return match ($body['action'] ?? '') {
                'validate-styles' => $builder === 'elementor' ? (\PixflowDesign\WordPress\Modules\BuilderIntegrations::require_service('elementor', 'validateStyles'))((int) ($body['postId'] ?? 0), (array) ($body['tree'] ?? [])) : throw new \RuntimeException('Style validation is only available for Elementor.'),
                'register' => $relay->register((int) ($body['postId'] ?? 0), $id, !empty($body['hasCompletion']), is_array($body['entity'] ?? null) ? $body['entity'] : null),
                'poll' => $relay->poll($id, (int) ($body['postId'] ?? 0), is_array($body['context'] ?? null) ? $body['context'] : null, is_array($body['entity'] ?? null) ? $body['entity'] : null),
                'complete' => $relay->complete($id, (string) ($body['commandId'] ?? ''), $builder !== 'bricks' ? $this->native_payload($request, 'result') : (array) ($body['result'] ?? [])),
                'close' => $relay->close($id),
                'depart' => $relay->depart($id, (int) ($body['postId'] ?? 0), is_array($body['destination'] ?? null) ? $body['destination'] : null),
                default => throw new \RuntimeException('Unknown canvas connection action.'),
            };
        } catch (\Throwable $error) {
            return new \WP_Error('canvas_error', $error->getMessage(), ['status' => 400]);
        }
    }

    public function close(\WP_REST_Request $request): array
    {
        delete_transient($this->key($this->token($request)));
        return ['closed' => true];
    }

    /** Keep native JSON objects (including {}) distinct from positional arrays.
     * WordPress get_json_params() recursively converts objects to PHP arrays,
     * which corrupts empty Etch options/attributes on a read-copy-write round trip.
     * Only the envelope is associative; opaque native values retain JSON types.
     */
    private function native_payload(\WP_REST_Request $request, string $field): array
    {
        $body = json_decode($request->get_body());
        $value = $body instanceof \stdClass ? ($body->{$field} ?? null) : null;
        return $value instanceof \stdClass ? (array) $value : [];
    }

    /** Current authorization is checked even when recovering old Bridge output. */
    public function session(\WP_REST_Request $request): array
    {
        if ($request->get_method() === 'DELETE') return $this->close($request);
        // Take one authorized snapshot for this response. Tool execution and
        // later ownership requests still evaluate their own current access.
        $services = \PixflowDesign\WordPress\Modules\FeatureContributions::all();
        $composio_status = $services['composio']['status'] ?? null;
        $features = [
            'composio' => is_callable($composio_status) && ($composio_status()['configured'] ?? false) === true,
            'image-generation' => isset($services['assets']),
            'external-mcp' => isset($services['external-mcp']),
            'audio' => isset($services['audio']),
        ];
        $historyState = [];
        if (isset($this->session['historyPrefix']) && $request->get_param('checkHistory')) {
            [$project, $conversation, $through, $expected] = $this->session['historyPrefix'];
            $current = (new \PixflowDesign\WordPress\Chat\HistoryService())->prefix_revision($project, $conversation, $through);
            $historyState['historyCurrent'] = is_string($current) && hash_equals($expected, $current);
        }
        return $historyState + ['siteTitle' => sanitize_text_field((string) get_bloginfo('name')), 'features' => $features, 'integrations' => ['bricks' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks')], 'identity' => $this->identity($this->session ?? []), 'writable' => $this->session['writable'] ?? false, 'editorTarget' => $this->session['editorTarget'] ?? null, 'workspaceSource' => $this->session['workspaceSource'] ?? null];
    }

    private function identity(array $session): array
    {
        return ['siteId' => hash('sha256', home_url('/') . ':' . get_current_blog_id()),
            'userId' => (int) ($session['userId'] ?? 0), 'blogId' => (int) ($session['blogId'] ?? 0)];
    }

    private function token(\WP_REST_Request $request): string
    {
        $header = $request->get_header('authorization') ?: ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        return preg_match('/^Bearer\s+(\S+)$/i', trim($header), $match) ? $match[1] : '';
    }

    private function key(string $token): string { return 'pixflow_direct_' . hash('sha256', $token); }
    private function setting_key(): string { return self::SETTING . '_' . get_current_blog_id(); }
}
