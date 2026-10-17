<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Http;

if (!defined('ABSPATH')) {
    exit;
}

use PixflowDesign\WordPress\Admin\WpAdminCapabilitySafetyPlane;
use PixflowDesign\WordPress\Admin\WpAdminPairingService;
use PixflowDesign\WordPress\Admin\WpAdminContextAuthority;
use PixflowDesign\WordPress\Admin\WpAdminSurfacePolicy;
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergSerializationTicketStore;

/** REST adapter for the shared WP Admin capability safety plane. */
final class WpAdminCapabilityRestController
{
    public function __construct(
        private readonly WpAdminCapabilitySafetyPlane $plane = new WpAdminCapabilitySafetyPlane(),
        private readonly WpAdminPairingService $pairing = new WpAdminPairingService(),
        private readonly GutenbergSerializationTicketStore $gutenberg_tickets = new GutenbergSerializationTicketStore(),
        private readonly WpAdminContextAuthority $context_authority = new WpAdminContextAuthority(),
    ) {
    }

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void
    {
        (new DirectSiteRestController())->register_routes();
        register_rest_route('pixflow-design/v1', '/wp-admin/capabilities', [
            'methods' => 'GET',
            'callback' => [$this, 'summary'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/capabilities/(?P<capability_id>[a-z0-9\-]+(?:/[a-z0-9\-]+)+)', [
            'methods' => 'GET',
            'callback' => [$this, 'detail'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/approvals', [
            'methods' => 'POST',
            'callback' => [$this, 'approval'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/execute', [
            'methods' => 'POST',
            'callback' => [$this, 'execute'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/operations/(?P<operation_id>[a-zA-Z0-9_\-]+)', [
            'methods' => 'GET',
            'callback' => [$this, 'operation'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/audit', [
            'methods' => 'GET',
            'callback' => [$this, 'audit'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/rollback', [
            'methods' => 'POST',
            'callback' => [$this, 'rollback'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/gutenberg/prepare', [
            'methods' => 'POST',
            'callback' => [$this, 'gutenberg_prepare'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/gutenberg/discovery-ticket', [
            'methods' => 'POST',
            'callback' => [$this, 'gutenberg_discovery_ticket'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/gutenberg/serialization-result', [
            'methods' => 'POST',
            'callback' => [$this, 'gutenberg_serialization_result'],
            'permission_callback' => [$this, 'permission'],
        ]);
        // Agent-tool aliases deliberately delegate to the same typed plane;
        // they do not load every detailed schema during a normal turn.
        register_rest_route('pixflow-design/v1', '/wp-admin/tools', [
            'methods' => 'GET',
            'callback' => [$this, 'summary'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/tools/call', [
            'methods' => 'POST',
            'callback' => [$this, 'execute'],
            'permission_callback' => [$this, 'permission'],
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/pairing', [
            'methods' => 'POST',
            'callback' => [$this, 'pairing_issue'],
            'permission_callback' => static fn(): bool => WpAdminSurfacePolicy::can_use(),
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/pairing', [
            'methods' => 'GET',
            'callback' => [$this, 'pairing_list'],
            'permission_callback' => static fn(): bool => WpAdminSurfacePolicy::can_use(),
        ]);
        register_rest_route('pixflow-design/v1', '/wp-admin/pairing/(?P<token_id>[a-zA-Z0-9_\-]+)', [
            'methods' => 'DELETE',
            'callback' => [$this, 'pairing_revoke'],
            'permission_callback' => static fn(): bool => WpAdminSurfacePolicy::can_use(),
        ]);
    }

    public function permission(\WP_REST_Request $request): bool
    {
        return $this->pairing->authenticate_request($request);
    }

    public function summary(): array
    {
        return $this->plane->summary();
    }

    public function detail(\WP_REST_Request $request): array|\WP_Error
    {
        return $this->plane->detail((string) $request->get_param('capability_id'));
    }

    public function approval(\WP_REST_Request $request): array|\WP_Error
    {
        return $this->plane->request_approval($this->body($request));
    }

    public function execute(\WP_REST_Request $request): array|\WP_Error
    {
        return $this->plane->execute($this->body($request));
    }

    public function operation(\WP_REST_Request $request): array|\WP_Error
    {
        return $this->plane->operation((string) $request->get_param('operation_id'));
    }

    public function audit(\WP_REST_Request $request): array
    {
        return $this->plane->audit_events((int) $request->get_param('limit'));
    }

    public function rollback(\WP_REST_Request $request): array|\WP_Error
    {
        return $this->plane->rollback($this->body($request));
    }

    public function gutenberg_prepare(\WP_REST_Request $request): array|\WP_Error
    {
        $body = $this->body($request);
        $binding = is_array($body['contextBinding'] ?? null) ? $body['contextBinding'] : [];
        $verified = $this->context_authority->verify($binding);
        if ($verified instanceof \WP_Error) return $verified;
        $identity = is_array($verified['identity'] ?? null) ? $verified['identity'] : [];
        if (($identity['objectKind'] ?? '') !== 'post' || (int) ($identity['objectId'] ?? 0) !== (int) ($body['postId'] ?? 0)) {
            return new \WP_Error('context_mismatch', 'Gutenberg preparation does not match the active post context.', ['status' => 409, 'retryable' => false]);
        }
        return $this->gutenberg_tickets->prepare($body);
    }

    public function gutenberg_discovery_ticket(\WP_REST_Request $request): array|\WP_Error
    {
        return $this->gutenberg_tickets->prepare_discovery($this->body($request));
    }

    public function gutenberg_serialization_result(\WP_REST_Request $request): array|\WP_Error
    {
        return $this->gutenberg_tickets->accept_browser_result($this->body($request));
    }

    public function pairing_issue(\WP_REST_Request $request): array|\WP_Error
    {
        try {
            $ttl = (int) ($this->body($request)['ttl'] ?? 2_592_000);
            $pairing = $this->pairing->issue(null, $ttl);
            return [
                'schema' => 'pixflow.wp-admin.capability-api.v1',
                'version' => 1,
                'siteId' => $pairing['siteId'],
                'userId' => $pairing['userId'],
                'token' => $pairing['token'],
                'expiresAt' => $pairing['expiresAt'],
            ];
        } catch (\Throwable $exception) {
            return new \WP_Error('pairing_failed', 'Could not create a Pixflow site pairing.', ['status' => 403]);
        }
    }

    public function pairing_list(): array
    {
        return ['pairings' => $this->pairing->list()];
    }

    public function pairing_revoke(\WP_REST_Request $request): array
    {
        return ['revoked' => $this->pairing->revoke((string) $request->get_param('token_id'))];
    }

    /** @return array<string, mixed> */
    private function body(\WP_REST_Request $request): array
    {
        $body = $request->get_json_params();
        return is_array($body) ? $body : [];
    }
}
