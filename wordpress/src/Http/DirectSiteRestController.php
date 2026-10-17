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
        update_user_meta(get_current_user_id(), $this->setting_key(), false);
        $body = $request->get_json_params();
        $token = 'pfdirect_' . bin2hex(random_bytes(32));
        // Legacy mode values are accepted but no longer restrict a new session.
        // Existing tokens retain their original permissions until expiration.
        $session = ['userId' => get_current_user_id(), 'blogId' => get_current_blog_id(), 'writable' => !in_array($body['purpose'] ?? '', ['audio', 'external-mcp'], true), 'expiresAt' => time() + 3600];
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
        set_transient($this->key($token), $session, 3600);
        return ['token' => $token, 'endpoint' => add_query_arg('rest_route', '/pixflow-design/v1/wp-admin/direct/tools', home_url('/')), 'expiresAt' => $session['expiresAt'], 'writable' => $session['writable'], 'identity' => $this->identity($session), 'editorTarget' => $session['editorTarget'] ?? null, 'workspaceSource' => $session['workspaceSource'] ?? null];
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
        if (!$available) return new \WP_Error('builder_unavailable', 'This builder is not active.', ['status' => 409]);
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
        return ['features' => ['composio' => \PixflowDesign\WordPress\Modules\ComposioAccess::configured(), 'image-generation' => \PixflowDesign\WordPress\Modules\ImageGenerationAccess::available(), 'external-mcp' => \PixflowDesign\WordPress\Modules\FeatureContributions::available('external-mcp'), 'audio' => \PixflowDesign\WordPress\Modules\FeatureContributions::available('audio')], 'integrations' => ['bricks' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks')], 'identity' => $this->identity($this->session ?? []), 'writable' => $this->session['writable'] ?? false, 'editorTarget' => $this->session['editorTarget'] ?? null, 'workspaceSource' => $this->session['workspaceSource'] ?? null];
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
