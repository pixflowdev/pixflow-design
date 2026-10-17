<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Http;

use PixflowDesign\WordPress\Admin\WpAdminContext;
use PixflowDesign\WordPress\Admin\WpAdminContextAuthority;
use PixflowDesign\WordPress\Admin\WpAdminPairingService;
use PixflowDesign\WordPress\Admin\WpAdminSurfacePolicy;
use PixflowDesign\WordPress\Diagnostics\DiagnosticsSnapshotService;
use PixflowDesign\WordPress\Diagnostics\DiagnosticsArchiveService;

use PixflowDesign\WordPress\Http\Routes\OnboardingRoutes;
use PixflowDesign\WordPress\Http\Routes\ProjectRoutes;

use PixflowDesign\WordPress\License\LicenseService;
use PixflowDesign\WordPress\Mcp\PromptSkillCatalog;
use PixflowDesign\WordPress\Media\MediaGenerationService;
use PixflowDesign\WordPress\Media\MediaLibraryService;
use PixflowDesign\WordPress\Onboarding\UserOnboardingProfile;
use PixflowDesign\WordPress\Od\ProjectAdapter;
use PixflowDesign\WordPress\Od\MemoryService;
use PixflowDesign\WordPress\Od\PluginApplyService;
use PixflowDesign\WordPress\Od\RegistryService;
use PixflowDesign\WordPress\Od\RuntimeCapabilityService;
use PixflowDesign\WordPress\Providers\ProviderSettingsRepository;
use PixflowDesign\WordPress\Projects\ProjectRepository;
use PixflowDesign\WordPress\Projects\ProjectContextRepository;
use PixflowDesign\WordPress\Projects\ProjectPermission;
use PixflowDesign\WordPress\Projects\ProjectFileService;
use PixflowDesign\WordPress\Projects\ProjectService;

if (!defined('ABSPATH')) {
    exit;
}

class RestController
{
    protected const OPTION_APP_CONFIG = 'pixflow_design_app_config';
    private const AIHUBMIX_MEDIA_GENERATION_TYPES = ['image_generation', 'video', 'tts'];

    public function __construct(
        protected readonly LicenseService $license_service = new LicenseService(),

        protected readonly PromptSkillCatalog $pixflow_prompt_skills = new PromptSkillCatalog(),
        protected readonly OnboardingRoutes $onboarding_routes = new OnboardingRoutes(),
        protected readonly ProjectRoutes $project_routes = new ProjectRoutes(),

        protected readonly ProjectRepository $project_repository = new ProjectRepository(),
        protected readonly ProjectContextRepository $project_contexts = new ProjectContextRepository(),
        protected readonly ProjectPermission $project_permissions = new ProjectPermission(),
        protected readonly ProjectService $project_service = new ProjectService(),
        protected readonly ProjectFileService $project_files = new ProjectFileService(),
        protected readonly RegistryService $od_registry = new RegistryService(),
        protected readonly MemoryService $od_memory = new MemoryService(),
        protected readonly PluginApplyService $od_plugin_apply = new PluginApplyService(),
        protected readonly RuntimeCapabilityService $od_runtime = new RuntimeCapabilityService(),
        protected readonly ProjectAdapter $od_project_adapter = new ProjectAdapter(),
        protected readonly ProviderSettingsRepository $provider_settings = new ProviderSettingsRepository(),

        protected readonly MediaGenerationService $media_generation = new MediaGenerationService(),
        protected readonly MediaLibraryService $media_library = new MediaLibraryService(),
        protected readonly WpAdminContext $wp_admin_context = new WpAdminContext(),
        protected readonly WpAdminPairingService $wp_admin_pairing = new WpAdminPairingService(),
        protected readonly WpAdminContextAuthority $wp_admin_context_authority = new WpAdminContextAuthority(),
        protected readonly DiagnosticsSnapshotService $diagnostics = new DiagnosticsSnapshotService(),
        protected readonly DiagnosticsArchiveService $diagnostics_archive = new DiagnosticsArchiveService(),
    ) {
    }

    public function register(): void
    {
        \PixflowDesign\WordPress\Http\Routes\SkillLibraryRoutes::register_cli();
        \PixflowDesign\WordPress\Http\Routes\LanguagePackRoutes::register_cli();
        \PixflowDesign\WordPress\Http\Routes\ChatHistoryRoutes::register_cli();
        add_action('rest_api_init', [$this, 'register_routes']);
        add_filter('rest_pre_serve_request', [$this, 'serve_raw_text_response'], 10, 4);
        add_action('wp_ajax_pixflow_design_refresh_rest_nonce', [$this, 'handle_rest_nonce_refresh']);
    }

    public function handle_rest_nonce_refresh(): void
    {
        if (!current_user_can('edit_posts')) {
            wp_send_json_error(['message' => 'You are not allowed to use Pixflow Design.'], 403);
        }

        wp_send_json_success([
            'restNonce' => wp_create_nonce('wp_rest'),
        ]);
    }

    protected function register_site_route(string $route, array $options): void
    {
        register_rest_route('pixflow-design/v1', $route, $options);
    }

    public function register_routes(): void
    {
        (new \PixflowDesign\WordPress\Http\Routes\BuilderDestinationRoutes())->register();
        (new \PixflowDesign\WordPress\Http\Routes\BuilderHandoffRoutes())->register();
        (new \PixflowDesign\WordPress\Http\Routes\SkillLibraryRoutes())->register();
        (new \PixflowDesign\WordPress\Http\Routes\LanguagePackRoutes())->register();
        (new \PixflowDesign\WordPress\Http\Routes\WorkspaceOrganizationRoutes())->register();
        (new \PixflowDesign\WordPress\Http\Routes\ChatHistoryRoutes())->register();
        $this->register_site_route('/features/annotations/authorize', [
            'methods' => 'POST',
            'permission_callback' => [$this, 'can_use_wp_admin_surface'],
            'callback' => static function () {
                if (!\PixflowDesign\WordPress\Modules\FeatureContributions::available('annotations')) return new \WP_Error('pixflow_annotations_unavailable', 'Annotations require Pixflow Design Pro.', ['status' => 403]);
                return new \WP_REST_Response(['available' => true], 200, ['Cache-Control' => 'no-store']);
            },
        ]);
        $this->register_site_route('/features/audio/authorize', [
            'methods' => 'POST',
            'permission_callback' => [$this, 'can_use_wp_admin_surface'],
            'callback' => static function () {
                if (!\PixflowDesign\WordPress\Modules\FeatureContributions::available('audio')) return new \WP_Error('pixflow_audio_unavailable', 'Dictation and Codex Voice require Pixflow Design Pro.', ['status' => 403]);
                return new \WP_REST_Response(['available' => true], 200, ['Cache-Control' => 'no-store']);
            },
        ]);
        $this->onboarding_routes->register();
        $this->project_routes->register();

        // WP Admin context is deliberately a separate read-only route. The
        // generic OD proxy remains capability-rich for the Bricks surface;
        // this endpoint only returns bounded, server-verified screen/object
        // context and never dispatches a content or plugin mutation.
        $this->register_site_route( '/wp-admin/context', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_wp_admin_context'],
            'permission_callback' => [$this, 'can_use_wp_admin_surface'],
        ]);

        $this->register_site_route( '/diagnostics/snapshot', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_diagnostics_snapshot'],
            'permission_callback' => [$this, 'can_manage_site_settings'],
        ]);

        $this->register_site_route( '/diagnostics/prepare', [
            'methods' => 'POST',
            'callback' => [$this, 'handle_diagnostics_prepare'],
            'permission_callback' => [$this, 'can_manage_site_settings'],
        ]);

        $this->register_site_route( '/diagnostics/download/(?P<ticket>[a-f0-9]{64})', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_diagnostics_download'],
            'permission_callback' => [$this, 'can_manage_site_settings'],
        ]);

        $this->register_site_route( '/od/(?P<path>.*)', [
            'methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            'callback' => [$this, 'handle_od_rest_request'],
            'permission_callback' => [$this, 'can_use_workspace_request'],
        ]);

        // Pixflow-owned: license checks live in the builder workspace/settings
        // rather than a WP admin page, but WordPress remains the trusted server.
        $this->register_site_route( '/license/status', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_license_status'],
            'permission_callback' => [$this, 'can_use_rest_api'],
        ]);

        $this->register_site_route('/license/features', [
            'methods' => 'GET',
            'callback' => fn () => $this->json_response(\PixflowDesign\WordPress\Assets\FeatureRuntime::state()),
            'permission_callback' => [$this, 'can_use_rest_api'],
        ]);

        $this->register_site_route( '/license/validate', [
            'methods' => 'POST',
            'callback' => [$this, 'handle_license_validate'],
            'permission_callback' => [$this, 'can_manage_site_settings'],
        ]);

        $this->register_site_route( '/license/reset', [
            'methods' => 'POST',
            'callback' => [$this, 'handle_license_reset'],
            'permission_callback' => [$this, 'can_manage_site_settings'],
        ]);

        // Pixflow-owned: proxy public bridge release metadata through WP REST
        // so the bridge iframe never depends on cross-origin browser CORS.
        $this->register_site_route( '/bridge/release', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_bridge_release'],
            'permission_callback' => [$this, 'can_use_rest_api'],
        ]);

        // Pixflow-owned: framework setup and token mapping live in the embedded
        // Pixflow Design wizard/settings instead of the old Pixflow AI sidebar.

        // Pixflow-owned: neutral alias for hosts/CDNs that apply broad WAF
        // rules to "design-system" request paths before WordPress handles REST.

        // Pixflow-owned: custom template library endpoints replace the old
        // native Bricks template-source mutation layer.

        $this->register_site_route('/icons/packs/wordpress', [
            'methods' => 'GET',
            'callback' => fn () => $this->json_response(\PixflowDesign\WordPress\Icons\WordPressIconLibrary::state()),
            'permission_callback' => fn () => current_user_can('edit_posts'),
        ]);
        $this->register_site_route('/fonts/google/state', [
            'methods' => 'GET', 'permission_callback' => [$this, 'can_use_rest_api'],
            'callback' => fn() => $this->json_response(\PixflowDesign\WordPress\Fonts\WordPressFontManager::state()),
        ]);

        // Pixflow-owned MCP contract and mutation endpoints provide the model
        // handoff layer for the Bricks adapter.

        $this->register_site_route( '/pixflow-mcp/prompt-skills', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_pixflow_mcp_prompt_skills'],
            'permission_callback' => [$this, 'can_use_rest_api'],
        ]);

        // Pixflow-owned: Stage 4 exposes a single model-callable tool layer.
        // Tool execution lives in wordpress/src/Mcp instead of this controller.

        // Pixflow-owned: Handoff to Bricks target picker needs a scoped page
        // list/create API before any generated HTML is prepared or inserted.

        // Pixflow-owned: live Bricks schema snapshots are passed into the
        // Handoff to Bricks model phase so element/control choices are grounded
        // in the installed Bricks runtime instead of guessed strings.

    }

    public function can_use_rest_api(): bool
    {
        return current_user_can('edit_posts');
    }

    /** Site-wide settings and diagnostics require administration, independently of Pro. */
    public function can_manage_site_settings(): bool
    {
        return current_user_can('manage_options');
    }

    public function can_use_workspace_request(\WP_REST_Request $request): bool
    {
        if (!$this->can_use_rest_api()) return false;
        $path = trim((string) $request->get_param('path'), '/');
        if (preg_match('#^projects/([^/]+)(?:/|$)#', $path, $match)) {
            $project = $this->project_repository->find_access_by_uuid(sanitize_text_field($match[1]));
            if ($project === null) return false;
            return in_array(strtoupper($request->get_method()), ['GET', 'HEAD'], true)
                ? $this->project_permissions->can_view($project)
                : $this->project_permissions->can_edit($project);
        }
        if ($path === 'app-config' && !in_array(strtoupper($request->get_method()), ['GET', 'HEAD'], true)) {
            return $this->can_manage_site_settings();
        }
        return $this->can_use_rest_api();
    }

    public function can_use_wp_admin_surface(?\WP_REST_Request $request = null): bool
    {
        if (WpAdminSurfacePolicy::can_use()) return true;
        return $request instanceof \WP_REST_Request && $this->wp_admin_pairing->authenticate_request($request);
    }

    public function handle_wp_admin_context(\WP_REST_Request $request): \WP_REST_Response
    {
        $hints = [
            'screenId' => $request->get_param('screenId'),
            'base' => $request->get_param('base'),
            'postType' => $request->get_param('postType'),
            'taxonomy' => $request->get_param('taxonomy'),
            'postId' => $request->get_param('postId'),
            'termId' => $request->get_param('termId'),
            'userId' => $request->get_param('userId'),
        ];

        $context = $this->wp_admin_context->snapshot($hints);
        $authority = $this->wp_admin_context_authority->issue(
            $context,
            (string) $request->get_param('tabId'),
            (string) ($request->get_param('targetProvenance') ?: 'active_context_target'),
        );
        return $this->json_response([
            'ok' => true,
            'context' => $context,
            'contextAuthority' => $authority instanceof \WP_Error ? null : $authority,
        ]);

    }

    public function handle_diagnostics_snapshot(): \WP_REST_Response
    {
        return $this->json_response([
            'ok' => true,
            'snapshot' => $this->diagnostics->snapshot(),
        ]);
    }

    public function handle_diagnostics_prepare(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];
        $prepared = $this->diagnostics_archive->prepare(
            is_array($body['client'] ?? null) ? $body['client'] : [],
            is_array($body['context'] ?? null) ? $body['context'] : [],
        );
        if ($prepared instanceof \WP_Error) {
            return $this->json_response([
                'ok' => false,
                'error' => $prepared->get_error_code(),
                'message' => $prepared->get_error_message(),
            ], 500);
        }

        $download_url = add_query_arg(
            ['_wpnonce' => wp_create_nonce('wp_rest')],
            rest_url('pixflow-design/v1/diagnostics/download/' . $prepared['ticket']),
        );
        return $this->json_response([
            'ok' => true,
            'downloadUrl' => esc_url_raw($download_url),
            'filename' => $prepared['filename'],
            'expiresAt' => $prepared['expiresAt'],
        ], 201);
    }

    public function handle_diagnostics_download(\WP_REST_Request $request): \WP_REST_Response
    {
        $archive = $this->diagnostics_archive->consume((string) $request->get_param('ticket'));
        if ($archive instanceof \WP_Error) {
            return $this->json_response([
                'ok' => false,
                'error' => $archive->get_error_code(),
                'message' => $archive->get_error_message(),
            ], 404);
        }

        return new \WP_REST_Response($archive['bytes'], 200, [
            'Content-Type' => 'application/zip',
            'Content-Disposition' => 'attachment; filename="' . sanitize_file_name($archive['filename']) . '"',
            'Content-Length' => (string) strlen($archive['bytes']),
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
            'X-Pixflow-Raw-Binary' => '1',
        ]);
    }

    public function can_manage_pixflow_fonts(): bool
    {
        return current_user_can('manage_options');
    }

    public function can_manage_pixflow_icon_packs(): bool
    {
        return current_user_can('manage_options');
    }

    public function handle_od_rest_request(\WP_REST_Request $request): \WP_REST_Response
    {
        $path = trim((string) $request->get_param('path'), '/');
        $method = strtoupper($request->get_method());
        if (!\PixflowDesign\WordPress\Modules\WorkspaceAccess::permits($path, $method)) {
            return $this->json_response(['error' => ['code' => 'pro_workspace_required', 'message' => 'The design workspace requires Pixflow Design Pro. Saved projects remain available for export.']], 403);
        }
        if ((str_starts_with($path, 'design-systems/bricks') || $path === 'design-systems/pixflow-framework') && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks')) {
            return $this->json_response(['ok' => false, 'error' => 'Bricks is not the active theme.'], 409);
        }

        if ($path === 'health') {
            return $this->json_response([
                'ok' => true,
                'status' => 'ok',
                'runtime' => 'wordpress',
                'version' => PIXFLOW_DESIGN_VERSION,
                'capabilities' => $this->od_runtime->capabilities(),
            ]);
        }

        if ($path === 'version') {
            return $this->json_response([
                'version' => [
                    'version' => PIXFLOW_DESIGN_VERSION,
                    'runtimeVersion' => PIXFLOW_DESIGN_VERSION,
                    'product' => 'pixflow-design-wordpress',
                    'channel' => 'wordpress-local',
                    'packaged' => false,
                    'platform' => 'wordpress',
                    'arch' => 'site',
                ],
                'runtime' => 'wordpress',
                'bridge' => $this->od_runtime->bridge_payload(),
                'capabilities' => $this->od_runtime->capabilities(),
            ]);
        }

        if ($path === 'app-config') {
            return $this->handle_app_config_request($method, $request);
        }

        if ($path === 'agents') {
            return $this->json_response($this->od_runtime->agents_payload());
        }

        if ($path === 'skills') {
            return $this->json_response(['skills' => $this->od_registry->skills(), 'lockedSkills' => \PixflowDesign\WordPress\Modules\SkillAccess::locked_skills()]);
        }

        if (str_starts_with($path, 'skills/') && in_array($method, ['POST', 'PUT', 'DELETE'], true) && !\PixflowDesign\WordPress\Modules\FeatureContributions::available('custom-skills')) return $this->json_response(['error' => ['code' => 'pro_custom_skills_required', 'message' => 'Custom skills require Pixflow Design Pro. Saved skills are preserved.']], 403);

        if ($path === 'skills/import' && $method === 'POST') {
            try {
                return $this->json_response(['skill' => \PixflowDesign\WordPress\Modules\PersonalSkills::save((array) $request->get_json_params())], 201);
            } catch (\Throwable $error) {
                return $this->json_response(['error' => ['message' => $error->getMessage()]], $error instanceof \InvalidArgumentException ? 400 : 500);
            }
        }

        if (preg_match('#^skills/([^/]+)(/files)?$#', $path, $match)) {
            $id = (string) $match[1];
            $skill = $this->od_registry->skill($id);
            if ($skill === null) return $this->json_response(['error' => ['message' => 'Skill not found.']], 404);
            if (!empty($match[2])) return $this->json_response(['files' => [['path' => 'SKILL.md', 'kind' => 'file', 'size' => strlen((string) ($skill['body'] ?? ''))]]]);
            try {
                $store = new \PixflowDesign\WordPress\Modules\PersonalSkills();
                if ($method === 'PUT') return $this->json_response(['skill' => $store::save((array) $request->get_json_params(), $id)]);
                if ($method === 'DELETE') { $store::delete($id); return $this->json_response(['ok' => true]); }
                return $this->json_response($skill + ['skill' => $skill]);
            } catch (\Throwable $error) {
                return $this->json_response(['error' => ['message' => $error->getMessage()]], $error instanceof \InvalidArgumentException ? 400 : 500);
            }
        }

        foreach (\PixflowDesign\WordPress\Modules\BuilderIntegrations::all() as $integration) {
            if (!isset($integration['dispatch'])) continue;
            $response = ($integration['dispatch'])($path, $method, $request);
            if ($response !== null) return $response;
        }

        foreach (\PixflowDesign\WordPress\Modules\FeatureContributions::all() as $feature) {
            if (!isset($feature['dispatch'])) continue;
            $response = ($feature['dispatch'])($path, $method, $request);
            if ($response !== null) return $response;
        }

        if ($path === 'design-systems') {
            $design_systems = $this->od_registry->design_systems();
            return $this->json_response(['designSystems' => $design_systems, 'systems' => $design_systems]);
        }

        if (preg_match('#^design-systems/([^/]+)$#', $path, $match)) {
            $design_system = $this->od_registry->design_system((string) $match[1]);
            if ($design_system === null) {
                return $this->json_response(['message' => 'Design system not found.'], 404);
            }

            return $this->json_response($design_system + ['designSystem' => $design_system]);
        }

        if ($path === 'design-templates') {
            $templates = $this->od_registry->design_templates();
            return $this->json_response(['designTemplates' => $templates, 'templates' => $templates]);
        }

        if (preg_match('#^design-systems/([^/]+)/(?:preview|showcase)$#', $path, $match)) {
            $asset = $this->od_registry->design_system_preview((string) $match[1]);
            return $asset === null
                ? $this->json_response(['message' => 'Style preview not found.'], 404)
                : $this->text_response((string) $asset['body'], (string) $asset['mime']);
        }

        if (preg_match('#^design-templates/([^/]+)$#', $path, $match)) {
            $template = $this->od_registry->design_template((string) $match[1]);
            if ($template === null) {
                return $this->json_response(['message' => 'Design template not found.'], 404);
            }

            return $this->json_response($template + ['designTemplate' => $template]);
        }

        if ($path === 'prompt-templates') {
            $templates = $this->od_registry->prompt_templates();
            return $this->json_response(['promptTemplates' => $templates, 'templates' => $templates]);
        }

        if (preg_match('#^prompt-templates/([^/]+)/([^/]+)$#', $path, $match)) {
            $template = $this->od_registry->prompt_template((string) $match[1], (string) $match[2]);
            if ($template === null) {
                return $this->json_response(['message' => 'Prompt template not found.'], 404);
            }

            return $this->json_response(['promptTemplate' => $template]);
        }

        if ($path === 'projects') {
            if ($method === 'POST') {
                $body = $request->get_json_params();
                $input = is_array($body) ? $body : [];
                $metadata = is_array($input['metadata'] ?? null) ? $input['metadata'] : [];
                $plugin_inputs = is_array($input['pluginInputs'] ?? null) ? $input['pluginInputs'] : [];
                $project_input = [
                    'title' => sanitize_text_field((string) ($input['name'] ?? $input['title'] ?? 'Untitled project')),
                    'kind' => sanitize_key((string) ($metadata['kind'] ?? 'project')) ?: 'project',
                    'status' => 'draft',
                    'visibility' => 'site',
                    'metadata' => array_replace_recursive($metadata, [
                        'localProjectId' => sanitize_text_field((string) ($input['id'] ?? '')),
                        'skillId' => isset($input['skillId']) ? sanitize_text_field((string) $input['skillId']) : null,
                        'designSystemId' => isset($input['designSystemId']) ? sanitize_text_field((string) $input['designSystemId']) : null,
                        'pendingPrompt' => sanitize_textarea_field((string) ($input['pendingPrompt'] ?? '')),
                        'conversationMode' => sanitize_key((string) ($input['conversationMode'] ?? 'design')),
                        'pluginId' => isset($input['pluginId']) ? sanitize_text_field((string) $input['pluginId']) : null,
                        'appliedPluginSnapshotId' => isset($input['appliedPluginSnapshotId']) ? sanitize_text_field((string) $input['appliedPluginSnapshotId']) : null,
                        'pluginInputs' => $plugin_inputs,
                    ]),
                    'context' => [
                        'designSystemId' => isset($input['designSystemId']) ? sanitize_text_field((string) $input['designSystemId']) : null,
                    ],
                ];
                $result = $this->project_service->create($project_input);
                if (empty($result['ok'])) {
                    return $this->json_response($result, (int) ($result['status'] ?? 500));
                }
                $app_project = $this->od_project_adapter->to_app_project(is_array($result['project'] ?? null) ? $result['project'] : []);
                $conversation_id = 'wp-conversation-' . sanitize_key((string) ($app_project['id'] ?? 'current'));
                $project_id = sanitize_text_field((string) ($app_project['id'] ?? 'current'));
                $conversation = $this->od_conversation_payload(
                    $project_id,
                    'New chat',
                    sanitize_key((string) ($input['conversationMode'] ?? 'design')) ?: 'design',
                    $conversation_id
                );
                $this->od_save_project_state($project_id, [
                    'conversations' => [$conversation],
                    'messages' => [$conversation_id => []],
                    'comments' => [],
                    'tabs' => ['tabs' => [], 'active' => null],
                ]);
                return $this->json_response([
                    'ok' => true,
                    'project' => $app_project,
                    'conversationId' => $conversation_id,
                    'appliedPluginSnapshotId' => isset($input['appliedPluginSnapshotId']) ? sanitize_text_field((string) $input['appliedPluginSnapshotId']) : null,
                    'wordpressProject' => is_array($result['project'] ?? null) ? ProjectAdapter::without_chat_backup($result['project']) : null,
                ], 200);
            }

            $result = $this->project_service->list([
                'limit' => (int) ($request->get_param('limit') ?: 30),
                'offset' => (int) $request->get_param('offset'),
                'kind' => (string) $request->get_param('kind'),
                'status' => (string) $request->get_param('status'),
            ]);
            if (!empty($result['projects']) && is_array($result['projects'])) {
                $result['wordpressProjects'] = array_map([ProjectAdapter::class, 'without_chat_backup'], $result['projects']);
                $result['projects'] = array_map([$this->od_project_adapter, 'to_app_project'], $result['projects']);
            }
            return $this->json_response($result, (int) ($result['status'] ?? 200));
        }

        if (preg_match('#^projects/([^/]+)$#', $path, $match)) {
            if ($method === 'PATCH') {
                $uuid = sanitize_text_field((string) $match[1]);
                $project = $this->project_repository->find_by_uuid($uuid);
                if ($project === null) {
                    return $this->json_response(['message' => 'Pixflow project was not found.'], 404);
                }
                if (!$this->project_permissions->can_edit($project)) {
                    return $this->json_response(['message' => 'You are not allowed to edit this Pixflow project.'], 403);
                }

                $body = $request->get_json_params();
                $body = is_array($body) ? $body : [];
                $metadata = is_array($project['metadata'] ?? null) ? $project['metadata'] : [];
                if (is_array($body['metadata'] ?? null)) {
                    // Preserve the server-owned odState and project markers
                    // while accepting the app's partial metadata patch.
                    $incoming_metadata = $body['metadata'];
                    unset($incoming_metadata['odState']);
                    $metadata = array_replace_recursive($metadata, $incoming_metadata);
                }
                foreach (['pendingPrompt', 'skillId', 'designSystemId'] as $field) {
                    if (!array_key_exists($field, $body)) continue;
                    $metadata[$field] = $field === 'pendingPrompt'
                        ? sanitize_textarea_field((string) ($body[$field] ?? ''))
                        : sanitize_text_field((string) ($body[$field] ?? ''));
                }

                $patch = ['metadata' => $metadata];
                if (array_key_exists('name', $body)) {
                    $patch['title'] = sanitize_text_field((string) $body['name']);
                } elseif (array_key_exists('title', $body)) {
                    $patch['title'] = sanitize_text_field((string) $body['title']);
                }
                if (array_key_exists('kind', $body)) {
                    $patch['kind'] = sanitize_key((string) $body['kind']);
                }
                $updated = $this->project_repository->update_by_uuid($uuid, $patch);
                if ($updated === null) {
                    return $this->json_response(['message' => 'Could not update the Pixflow project.'], 500);
                }

                // Project creation stores design-system selection in the
                // related context table. Keep that source in sync when the
                // app changes it through the daemon-compatible patch route.
                if (array_key_exists('designSystemId', $body)) {
                    $context = $this->project_contexts->find_by_project((int) ($project['id'] ?? 0)) ?? [];
                    $this->project_contexts->upsert((int) ($project['id'] ?? 0), [
                        'post_id' => $context['postId'] ?? null,
                        'post_type' => $context['postType'] ?? '',
                        'bricks_template_id' => $context['bricksTemplateId'] ?? null,
                        'framework_route' => $context['frameworkRoute'] ?? '',
                        'design_system_id' => sanitize_text_field((string) ($body['designSystemId'] ?? '')),
                        'mapping_route' => $context['mappingRoute'] ?? '',
                        'metadata' => $context['metadata'] ?? [],
                    ]);
                }

                $related = $this->project_service->detail($uuid);
                $fresh = is_array($related['project'] ?? null) ? $related['project'] : $updated;
                return $this->json_response([
                    'ok' => true,
                    'project' => $this->od_project_adapter->to_app_project($fresh),
                ]);
            }
            if ($method === 'DELETE') {
                $result = $this->project_service->delete_project(sanitize_text_field((string) $match[1]));
                return $this->json_response($result, (int) ($result['status'] ?? 200));
            }

            $result = $this->project_service->detail(sanitize_text_field((string) $match[1]));
            if (!empty($result['project']) && is_array($result['project'])) {
                $result['wordpressProject'] = ProjectAdapter::without_chat_backup($result['project']);
                $result['project'] = $this->od_project_adapter->to_app_project($result['project']);
            }
            return $this->json_response($result, (int) ($result['status'] ?? 200));
        }

        // WordPress-backed projects use the same relative file contract as the
        // desktop daemon. Keep this compatibility surface here because the
        // embedded workspace requests /od/... rather than the daemon's /api.
        if (preg_match('#^projects/([^/]+)/files(?:/(.*))?$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            $suffix = isset($match[2]) ? rawurldecode((string) $match[2]) : '';
            if ($suffix === 'batch' && $method === 'POST') {
                $body = $request->get_json_params();
                $result = $this->project_files->write_batch(
                    $project_id,
                    is_array($body) && is_array($body['files'] ?? null) ? $body['files'] : []
                );
                return $this->project_file_response($result);
            }
            if ($suffix === 'rename' && $method === 'POST') {
                $body = $request->get_json_params();
                $body = is_array($body) ? $body : [];
                $result = $this->project_files->rename(
                    $project_id,
                    (string) ($body['from'] ?? ''),
                    (string) ($body['to'] ?? '')
                );
                return $this->project_file_response($result);
            }
            if ($suffix !== '' && str_ends_with($suffix, '/preview') && $method === 'GET') {
                $name = substr($suffix, 0, -strlen('/preview'));
                $result = $this->project_files->read($project_id, $name);
                if (is_wp_error($result)) return $this->project_file_response($result);
                $text = @file_get_contents((string) $result['path']);
                $lines = is_string($text) ? preg_split('/\R/', $text) : [];
                return $this->json_response([
                    'kind' => $this->project_preview_kind((string) ($result['mime'] ?? '')),
                    'title' => (string) ($result['name'] ?? $name),
                    'sections' => [[
                        'title' => (string) ($result['name'] ?? $name),
                        'lines' => is_array($lines) ? array_slice(array_map('strval', $lines), 0, 500) : [],
                    ]],
                ]);
            }
            if ($suffix === '' && $method === 'GET') {
                return $this->project_file_response($this->project_files->list(
                    $project_id,
                    (string) $request->get_param('contentHashes') === '1'
                ));
            }
            if ($suffix === '' && $method === 'POST') {
                // Bridge project mirroring uses multipart uploads so binary
                // bytes and their project-relative path travel together.
                // WordPress exposes multipart fields through body params,
                // while JSON writes continue to use JSON params.
                $form_body = $request->get_body_params();
                $json_body = $request->get_json_params();
                $body = array_merge(
                    is_array($form_body) ? $form_body : [],
                    is_array($json_body) ? $json_body : []
                );
                return $this->project_file_response($this->project_files->write(
                    $project_id,
                    $body,
                    $request->get_file_params()
                ));
            }
            if ($suffix !== '' && $method === 'GET') {
                return $this->project_raw_file_response($this->project_files->read($project_id, $suffix));
            }
            if ($suffix !== '' && $method === 'DELETE') {
                return $this->project_file_response($this->project_files->delete($project_id, $suffix));
            }
        }

        if (preg_match('#^projects/([^/]+)/upload$#', $path, $match) && $method === 'POST') {
            $project_id = sanitize_text_field((string) $match[1]);
            $uploaded = $request->get_file_params()['files'] ?? [];
            $uploaded = is_array($uploaded) && isset($uploaded['name']) && is_array($uploaded['name'])
                ? $this->normalize_multiple_uploads($uploaded)
                : (is_array($uploaded) ? [$uploaded] : []);
            $dir = sanitize_text_field((string) $request->get_param('dir'));
            $saved = [];
            $failed = [];
            foreach ($uploaded as $file) {
                $name = $dir !== '' ? $dir . '/' . (string) ($file['name'] ?? '') : (string) ($file['name'] ?? '');
                $result = $this->project_files->write($project_id, ['name' => $name], ['file' => $file]);
                if (is_wp_error($result)) {
                    $failed[] = ['name' => (string) ($file['name'] ?? ''), 'error' => $result->get_error_message(), 'code' => $result->get_error_code()];
                } elseif (is_array($result['file'] ?? null)) {
                    $saved[] = $result['file'];
                }
            }
            return $this->json_response(['ok' => $failed === [], 'files' => $saved, 'failed' => $failed], $failed === [] ? 200 : 400);
        }

        if (preg_match('#^projects/([^/]+)/folders$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            if ($method === 'GET') return $this->project_file_response($this->project_files->folders($project_id));
            if ($method !== 'POST' && $method !== 'DELETE') {
                return $this->json_response(['ok' => false, 'code' => 'method_not_allowed', 'message' => 'Use POST to create or DELETE to remove a project folder.'], 405);
            }
            $body = $request->get_json_params();
            $body = is_array($body) ? $body : [];
            $name = (string) ($body['name'] ?? $body['path'] ?? '');
            if ($method === 'POST') {
                $folder = $this->project_files->create_folder($project_id, $name);
                if (is_wp_error($folder)) return $this->project_file_response($folder);
                return $this->json_response(['ok' => true, 'folder' => $folder]);
            }
            return $this->project_file_response($this->project_files->delete_folder($project_id, $name));
        }

        if (preg_match('#^projects/([^/]+)/raw/(.+)$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            $name = rawurldecode((string) $match[2]);
            if ($method === 'GET') return $this->project_raw_file_response($this->project_files->read($project_id, $name));
            if ($method === 'DELETE') return $this->project_file_response($this->project_files->delete($project_id, $name));
        }

        if (preg_match('#^projects/([^/]+)/conversations$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            $state = $this->od_project_state($project_id);
            if ($method === 'POST') {
                $body = $request->get_json_params();
                $body = is_array($body) ? $body : [];
                if (($body['forkToNewChat'] ?? false) === true) {
                    $result = (new \PixflowDesign\WordPress\Chat\ConversationFork())->create($project_id, (string) ($body['seedFromConversationId'] ?? ''), $body);
                    if (is_wp_error($result)) return $this->json_response(['error' => ['code' => $result->get_error_code(), 'message' => $result->get_error_message()]], (int) ($result->get_error_data()['status'] ?? 500));
                    return $this->json_response($result, 200);
                }
                $conversation = $this->od_normalize_conversation([
                    'id' => wp_generate_uuid4(),
                    'title' => sanitize_text_field((string) ($body['title'] ?? 'New chat')),
                    'sessionMode' => sanitize_key((string) ($body['sessionMode'] ?? 'design')) ?: 'design',
                    'createdAt' => (int) round(microtime(true) * 1000),
                    'updatedAt' => (int) round(microtime(true) * 1000),
                ], $project_id);
                $state['conversations'] = array_values(array_filter(
                    is_array($state['conversations'] ?? null) ? $state['conversations'] : [],
                    static fn($item): bool => is_array($item) && (string) ($item['id'] ?? '') !== (string) $conversation['id']
                ));
                array_unshift($state['conversations'], $conversation);
                $state['messages'][(string) $conversation['id']] = [];
                $this->od_save_project_state($project_id, $state);
                return $this->json_response(['conversation' => $conversation], 200);
            }

            $conversations = is_array($state['conversations'] ?? null) ? $state['conversations'] : [];
            if ($conversations === []) {
                $state['messages'] = is_array($state['messages'] ?? null) ? $state['messages'] : [];
                foreach ($state['messages'] as $message_conversation_id => $messages) {
                    if (!is_array($messages)) {
                        continue;
                    }
                    $conversations[] = $this->od_conversation_payload(
                        $project_id,
                        $this->od_conversation_title_from_messages($messages),
                        'design',
                        sanitize_text_field((string) $message_conversation_id),
                        count($messages)
                    );
                }
                if ($conversations === []) {
                    $conversations = [$this->od_default_conversation($project_id)];
                    $state['messages'][(string) $conversations[0]['id']] = [];
                }
                $state['conversations'] = $conversations;
                $this->od_save_project_state($project_id, $state);
            }
            $conversations = (new \PixflowDesign\WordPress\Chat\HistoryService())->merge_conversations($project_id, $conversations);
            return $this->json_response(['conversations' => array_map(
                fn($item): array => $this->od_normalize_conversation(is_array($item) ? $item : [], $project_id),
                $conversations
            )]);
        }

        if (preg_match('#^projects/([^/]+)/conversations/([^/]+)$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            $conversation_id = sanitize_text_field((string) $match[2]);
            $state = $this->od_project_state($project_id);
            if ($method === 'DELETE') {
                $deleted = (new \PixflowDesign\WordPress\Chat\HistoryService())->remove_conversation($project_id, $conversation_id, false);
                if (is_wp_error($deleted)) return $this->project_file_response($deleted);
                $state['conversations'] = array_values(array_filter(
                    is_array($state['conversations'] ?? null) ? $state['conversations'] : [],
                    static fn($item): bool => is_array($item) && (string) ($item['id'] ?? '') !== $conversation_id
                ));
                if (is_array($state['messages'] ?? null)) {
                    unset($state['messages'][$conversation_id]);
                }
                if (is_array($state['comments'] ?? null)) {
                    unset($state['comments'][$conversation_id]);
                }
                $this->od_save_project_state($project_id, $state);
                return $this->json_response(['ok' => true]);
            }

            $body = $request->get_json_params();
            $body = is_array($body) ? $body : [];
            $existing = null;
            foreach (is_array($state['conversations'] ?? null) ? $state['conversations'] : [] as $item) {
                if (is_array($item) && (string) ($item['id'] ?? '') === $conversation_id) {
                    $existing = $item;
                    break;
                }
            }
            $conversation = $this->od_normalize_conversation(array_replace($existing ?? [
                'id' => $conversation_id,
                'createdAt' => (int) round(microtime(true) * 1000),
            ], [
                'id' => $conversation_id,
                'title' => sanitize_text_field((string) ($body['title'] ?? ($existing['title'] ?? 'New chat'))),
                'sessionMode' => sanitize_key((string) ($body['sessionMode'] ?? ($existing['sessionMode'] ?? 'design'))) ?: 'design',
                'updatedAt' => (int) round(microtime(true) * 1000),
            ]), $project_id);
            $state['conversations'] = array_values(array_filter(
                is_array($state['conversations'] ?? null) ? $state['conversations'] : [],
                static fn($item): bool => is_array($item) && (string) ($item['id'] ?? '') !== $conversation_id
            ));
            array_unshift($state['conversations'], $conversation);
            $state['messages'][$conversation_id] = is_array($state['messages'][$conversation_id] ?? null) ? $state['messages'][$conversation_id] : [];
            $renamed = (new \PixflowDesign\WordPress\Chat\HistoryService())->rename($project_id, $conversation_id, (string) $conversation['title'], false);
            if (is_wp_error($renamed)) return $this->project_file_response($renamed);
            $this->od_save_project_state($project_id, $state);
            return $this->json_response([
                'conversation' => $conversation,
            ]);
        }

        if (preg_match('#^projects/([^/]+)/conversations/([^/]+)/messages$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            $conversation_id = sanitize_text_field((string) $match[2]);
            if ($method !== 'GET') return $this->json_response(['message' => 'Use GET to read messages.'], 405);
            $result = (new \PixflowDesign\WordPress\Chat\HistoryService())->page($project_id, $conversation_id,
                $request->get_param('limit') === null ? null : (int) $request->get_param('limit'), (string) $request->get_param('before'), false);
            return is_wp_error($result) ? $this->project_file_response($result) : $this->json_response($result);
        }

        if (preg_match('#^projects/([^/]+)/conversations/([^/]+)/messages/([^/]+)$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            $conversation_id = sanitize_text_field((string) $match[2]);
            $message_id = sanitize_text_field((string) $match[3]);
            $body = $request->get_json_params();
            if ($method === 'DELETE') {
                $result = (new \PixflowDesign\WordPress\Chat\HistoryService())->remove($project_id, $conversation_id, $message_id, false);
                return is_wp_error($result) ? $this->project_file_response($result) : $this->json_response($result);
            }
            if (!in_array($method, ['PUT', 'POST', 'PATCH'], true)) return $this->json_response(['message' => 'Use PUT to save a message.'], 405);
            $message = is_array($body) ? $body : [];
            $message['id'] = $message_id;
            $result = (new \PixflowDesign\WordPress\Chat\HistoryService())->write($project_id, $conversation_id, $message, false);
            return is_wp_error($result) ? $this->project_file_response($result) : $this->json_response($result);
        }

        if (preg_match('#^projects/([^/]+)/conversations/([^/]+)/comments$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            $conversation_id = sanitize_text_field((string) $match[2]);
            $state = $this->od_project_state($project_id);
            if ($method === 'POST') {
                $body = $request->get_json_params();
                $body = is_array($body) ? $body : [];
                $comment = array_replace([
                    'id' => wp_generate_uuid4(),
                    'status' => 'saved',
                    'createdAt' => (int) round(microtime(true) * 1000),
                    'updatedAt' => (int) round(microtime(true) * 1000),
                ], $body);
                $state['comments'][$conversation_id] = is_array($state['comments'][$conversation_id] ?? null) ? $state['comments'][$conversation_id] : [];
                $state['comments'][$conversation_id][] = $comment;
                $this->od_save_project_state($project_id, $state);
                return $this->json_response(['comment' => $comment], 200);
            }

            return $this->json_response(['comments' => array_values(is_array($state['comments'][$conversation_id] ?? null) ? $state['comments'][$conversation_id] : [])]);
        }

        if (preg_match('#^projects/([^/]+)/conversations/([^/]+)/comments/([^/]+)$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            $conversation_id = sanitize_text_field((string) $match[2]);
            $comment_id = sanitize_text_field((string) $match[3]);
            $state = $this->od_project_state($project_id);
            if ($method === 'DELETE') {
                $state['comments'][$conversation_id] = array_values(array_filter(
                    is_array($state['comments'][$conversation_id] ?? null) ? $state['comments'][$conversation_id] : [],
                    static fn($item): bool => is_array($item) && (string) ($item['id'] ?? '') !== $comment_id
                ));
                $this->od_save_project_state($project_id, $state);
                return $this->json_response(['ok' => true]);
            }

            $body = $request->get_json_params();
            $body = is_array($body) ? $body : [];
            $comment = array_replace([
                'id' => $comment_id,
                'status' => sanitize_key((string) ($body['status'] ?? 'saved')) ?: 'saved',
                'updatedAt' => (int) round(microtime(true) * 1000),
            ], $body);
            $state['comments'][$conversation_id] = array_values(array_filter(
                is_array($state['comments'][$conversation_id] ?? null) ? $state['comments'][$conversation_id] : [],
                static fn($item): bool => is_array($item) && (string) ($item['id'] ?? '') !== $comment_id
            ));
            $state['comments'][$conversation_id][] = $comment;
            $this->od_save_project_state($project_id, $state);
            return $this->json_response(['comment' => $comment], 200);
        }

        if (preg_match('#^projects/([^/]+)/tabs$#', $path, $match)) {
            $project_id = sanitize_text_field((string) $match[1]);
            $state = $this->od_project_state($project_id);
            if ($method === 'PUT') {
                $body = $request->get_json_params();
                $tabs = is_array($body) ? $body : ['tabs' => [], 'active' => null];
                $state['tabs'] = $tabs;
                $this->od_save_project_state($project_id, $state);
                return $this->json_response($tabs);
            }

            return $this->json_response(is_array($state['tabs'] ?? null) ? $state['tabs'] : ['tabs' => [], 'active' => null]);
        }

        if (preg_match('#^projects/[^/]+/events$#', $path)) {
            return $this->json_response(['ok' => true]);
        }

        if ($path === 'editors') {
            return $this->json_response(['editors' => []]);
        }

        if (str_starts_with($path, 'live-artifacts')) {
            return $this->json_response(['liveArtifacts' => [], 'artifacts' => []]);
        }

        if ($path === 'recent-dirs') {
            return $this->json_response(['dirs' => []]);
        }

        if ($path === 'active') {
            return $this->json_response(['ok' => true, 'active' => false]);
        }

        if ($path === 'plugins') {
            $view = sanitize_key((string) $request->get_param('view'));
            return $this->json_response([
                'plugins' => $view === 'summary'
                    ? $this->od_registry->plugin_summaries()
                    : $this->od_registry->discoverable_plugins(),
            ]);
        }

        if ($method === 'POST' && preg_match('#^plugins/([^/]+)/apply$#', $path, $match)) {
            $body = $request->get_json_params();
            $body = is_array($body) ? $body : [];
            $inputs = is_array($body['inputs'] ?? null) ? $body['inputs'] : [];
            $locale = is_string($body['locale'] ?? null) ? (string) $body['locale'] : get_locale();
            $result = $this->od_plugin_apply->apply((string) $match[1], $inputs, $locale);
            if (is_wp_error($result)) {
                $error_data = $result->get_error_data();
                $error_data = is_array($error_data) ? $error_data : [];
                return $this->json_response([
                    'error' => $result->get_error_code(),
                    'message' => $result->get_error_message(),
                    'data' => $error_data,
                ], (int) ($error_data['status'] ?? 500));
            }

            return $this->json_response($result);
        }

        if (preg_match('#^plugins/([^/]+)$#', $path, $match)) {
            $plugin = $this->od_registry->plugin((string) $match[1]);
            if ($plugin === null) {
                return $this->json_response(['message' => 'Plugin not found.'], 404);
            }

            return $this->json_response($plugin);
        }

        if (preg_match('#^plugins/([^/]+)/asset-bundle$#', $path, $match)) {
            $bundle = $this->od_plugin_asset_bundle((string) $match[1]);
            if (is_wp_error($bundle)) {
                return $this->json_response([
                    'message' => $bundle->get_error_message(),
                    'code' => $bundle->get_error_code(),
                ], (int) ($bundle->get_error_data()['status'] ?? 400));
            }

            return $this->json_response($bundle);
        }

        if (preg_match('#^plugins/([^/]+)/preview$#', $path, $match)) {
            $asset = $this->od_registry->plugin_preview((string) $match[1]);
            if ($asset === null) {
                return $this->json_response(['message' => 'Plugin preview not found.'], 404);
            }

            return $this->text_response((string) $asset['body'], (string) $asset['mime']);
        }

        if (preg_match('#^plugins/([^/]+)/example/([^/]+)$#', $path, $match)) {
            $asset = $this->od_registry->plugin_example((string) $match[1], (string) $match[2]);
            if ($asset === null) {
                return $this->json_response(['message' => 'Plugin example not found.'], 404);
            }

            return $this->text_response((string) $asset['body'], (string) $asset['mime']);
        }

        if (preg_match('#^plugins/([^/]+)/asset/(.+)$#', $path, $match)) {
            $asset = $this->od_registry->plugin_asset((string) $match[1], (string) $match[2]);
            if ($asset === null) {
                return $this->json_response(['message' => 'Plugin asset not found.'], 404);
            }

            return $this->text_response((string) $asset['body'], (string) $asset['mime']);
        }

        if ($path === 'marketplaces') {
            return $this->json_response(['marketplaces' => $this->od_registry->marketplaces()]);
        }

        if ($path === 'mcp/servers') {
            return $this->json_response(['servers' => []]);
        }

        if ($path === 'connectors') {
            return $this->json_response(['connectors' => []]);
        }

        if ($path === 'connectors/status') {
            return $this->json_response(['statuses' => (object) []]);
        }

        if (str_starts_with($path, 'connectors/discovery')) {
            return $this->json_response(['connectors' => []]);
        }

        if ($path === 'connectors/composio/config') {
            return $this->json_response([
                'enabled' => false,
                'apiKeyConfigured' => false,
                'projectId' => '',
            ]);
        }

        if ($path === 'automation-templates') {
            return $this->json_response(['templates' => []]);
        }

        if (str_starts_with($path, 'automation-proposals')) {
            return $this->json_response(['proposals' => []]);
        }

        if ($path === 'routines') {
            return $this->json_response(['routines' => []]);
        }

        if ($path === 'templates') {
            return $this->json_response(['templates' => []]);
        }

        if ($path === 'memory' && $method === 'GET') {
            $requested_limit = (int) $request->get_param('limit');
            $limit = $requested_limit > 0 ? max(1, min(100, $requested_limit)) : 50;
            $cursor = sanitize_text_field((string) $request->get_param('cursor'));
            $response = $this->json_response($this->od_memory->list($limit, $cursor));
            $response->header('ETag', (string) $response->get_data()['etag']);
            return $response;
        }

        if ($path === 'memory' && $method === 'POST') {
            $body = $this->request_payload($request);
            try {
                $entry = $this->od_memory->upsert($body);
            } catch (\Throwable $exception) {
                return $this->json_response(['error' => $exception->getMessage()], $exception->getMessage() === 'memory_version_conflict' ? 409 : 400);
            }

            return $this->json_response(['entry' => $entry]);
        }

        if ($path === 'memory/tree' && $method === 'GET') {
            return $this->json_response($this->od_memory->tree());
        }

        if (preg_match('#^memory/tree/([^/]+)$#', $path, $match) && $method === 'PATCH') {
            $body = $this->request_payload($request);
            try {
                return $this->json_response($this->od_memory->update_tree_node((string) $match[1], $body));
            } catch (\Throwable $exception) {
                return $this->json_response(['error' => $exception->getMessage()], $exception->getMessage() === 'memory not found' ? 404 : 400);
            }
        }

        if ($path === 'memory/index' && $method === 'PUT') {
            $body = $this->request_payload($request);
            $index = is_string($body['index'] ?? null) ? (string) $body['index'] : '';

            return $this->json_response(['index' => $this->od_memory->save_index($index)]);
        }

        if ($path === 'memory/config' && $method === 'PATCH') {
            $body = $this->request_payload($request);

            return $this->json_response($this->od_memory->update_config($body));
        }

        if ($path === 'memory/events') {
            return $this->json_response(['ok' => true, 'events' => []]);
        }

        if ($path === 'memory/extractions' && $method === 'GET') {
            return $this->json_response(['extractions' => $this->od_memory->extractions()]);
        }

        if ($path === 'memory/extractions' && $method === 'DELETE') {
            return $this->json_response(['removed' => $this->od_memory->clear_extractions()]);
        }

        if (preg_match('#^memory/extractions/([^/]+)$#', $path, $match) && $method === 'DELETE') {
            return $this->json_response(['removed' => $this->od_memory->delete_extraction((string) $match[1])]);
        }

        if ($path === 'memory/extract' && $method === 'POST') {
            $body = $this->request_payload($request);

            return $this->json_response($this->od_memory->extract($body));
        }

        if ($path === 'memory/system-prompt' && $method === 'GET') {
            return $this->json_response(['body' => $this->od_memory->system_prompt()]);
        }

        if (preg_match('#^memory/([^/]+)$#', $path, $match)) {
            $id = (string) $match[1];
            if ($method === 'GET') {
                $entry = $this->od_memory->get($id);

                return $entry === null
                    ? $this->json_response(['error' => 'memory not found'], 404)
                    : $this->json_response(['entry' => $entry]);
            }
            if ($method === 'PUT') {
                $body = $this->request_payload($request);
                try {
                    $entry = $this->od_memory->upsert($body, $id);
                } catch (\Throwable $exception) {
                    return $this->json_response(['error' => $exception->getMessage()], $exception->getMessage() === 'memory_version_conflict' ? 409 : 400);
                }

                return $this->json_response(['entry' => $entry]);
            }
            if ($method === 'DELETE') {
                try {
                    $expected = isset($request->get_params()['expectedVersion']) ? (int) $request->get_param('expectedVersion') : null;
                    $this->od_memory->delete($id, $expected);
                } catch (\Throwable $exception) {
                    return $this->json_response(['error' => $exception->getMessage()], $exception->getMessage() === 'memory_version_conflict' ? 409 : 400);
                }

                return $this->json_response(['ok' => true]);
            }
        }

        if (preg_match('#^media/providers/aihubmix/models$#', $path)) {
            $type = sanitize_key((string) $request->get_param('type'));
            if (!in_array($type, self::AIHUBMIX_MEDIA_GENERATION_TYPES, true)) {
                return $this->json_response(['models' => []]);
            }

            return $this->json_response([
                'models' => $this->fetch_aihubmix_media_models($type),
            ]);
        }

        if (str_starts_with($path, 'media/providers/')) {
            return $this->json_response(['models' => [], 'voices' => []]);
        }

        if ($path === 'media/stock/test' && $method === 'POST') {
            $body = $request->get_json_params();
            return $this->json_response((new \PixflowDesign\WordPress\Media\UnsplashConnectionService())->test(is_array($body) ? $body : []));
        }

        if ($path === 'media/config') {
            if ($method === 'PUT' || $method === 'POST' || $method === 'PATCH') {
                $body = $request->get_json_params();
                $body = is_array($body) ? $body : [];
                $settings = $this->provider_settings->save([
                    'mediaProviders' => is_array($body['providers'] ?? null) ? $body['providers'] : [],
                ]);
                $providers = is_array($settings['mediaProviders'] ?? null) ? $settings['mediaProviders'] : [];
                return $this->json_response([
                    'ok' => true,
                    'providers' => $providers,
                    'configured' => $this->has_configured_media_providers($providers),
                ]);
            }
            $settings = $this->provider_settings->get();
            $providers = is_array($settings['mediaProviders'] ?? null) ? $settings['mediaProviders'] : [];
            return $this->json_response([
                'providers' => $providers,
                'configured' => $this->has_configured_media_providers($providers),
            ]);
        }

        if ($path === 'media/generate' && ($method === 'POST' || $method === 'PUT')) {
            // MediaGenerationService permits a longer upstream image request;
            // leave headroom so WordPress can return its structured error.
            if (function_exists('set_time_limit')) @set_time_limit(240);
            $body = $request->get_json_params();
            $result = $this->media_generation->generate(is_array($body) ? $body : []);
            if (is_wp_error($result)) {
                $data = $result->get_error_data();
                $status = is_array($data) && isset($data['status']) ? (int) $data['status'] : 500;
                return $this->json_response([
                    'ok' => false,
                    'code' => $result->get_error_code(),
                    'message' => $result->get_error_message(),
                ], $status);
            }

            return $this->json_response($result);
        }

        if (preg_match('#^media/tasks/([^/]+)$#', $path, $match) && ($method === 'POST' || $method === 'PUT')) {
            if (function_exists('set_time_limit')) @set_time_limit(240);
            $body = $request->get_json_params();
            $body = is_array($body) ? $body : [];
            $body['taskId'] = sanitize_text_field((string) $match[1]);
            $result = $this->media_generation->poll($body);
            if (is_wp_error($result)) {
                $data = $result->get_error_data();
                $status = is_array($data) && isset($data['status']) ? (int) $data['status'] : 500;
                return $this->json_response([
                    'ok' => false,
                    'code' => $result->get_error_code(),
                    'message' => $result->get_error_message(),
                ], $status);
            }

            return $this->json_response($result);
        }

        if ($path === 'pixflow/license-entitlement') {
            return $this->json_response(['ok' => true, 'bridge' => 'optional']);
        }

        if ($path === 'pixflow/site-context/switch') {
            return $this->json_response([
                'ok' => true,
                'runtime' => 'wordpress',
                'bridge' => 'optional',
                'switched' => false,
            ]);
        }

        return $this->json_response([
            'error' => 'not_implemented',
            'message' => 'This Pixflow Design WordPress-local OD endpoint is not implemented yet.',
            'path' => $path,
            'method' => $method,
        ], 501);
    }

    protected function handle_app_config_request(string $method, \WP_REST_Request $request): \WP_REST_Response
    {
        $handler = \PixflowDesign\WordPress\Modules\BuilderIntegrations::get('bricks', 'appConfig');
        if ($handler) return $handler($method, $request);
        if (in_array($method, ['PUT', 'PATCH', 'POST'], true)) {
            $incoming = $this->request_payload($request);
            foreach (array_keys($incoming) as $key) if (str_starts_with($key, 'bricks') || str_starts_with($key, 'disableBricks')) unset($incoming[$key]);
            $stored = get_option(self::OPTION_APP_CONFIG, []);
            $config = array_replace_recursive(is_array($stored) ? $stored : [], $incoming);
            update_option(self::OPTION_APP_CONFIG, $config, false);
            $settings = $this->provider_settings->extract_from_app_config($incoming);
            if ($settings !== []) $this->provider_settings->save($settings);
            return $this->json_response(['ok' => true, 'config' => $this->wordpress_runtime_config($request)]);
        }
        return $this->json_response(['config' => $this->wordpress_runtime_config($request)]);
    }

    /**
     * @return array<string, mixed>
     */
    protected function request_payload(\WP_REST_Request $request): array
    {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            $body = $request->get_body_params();
        }

        return is_array($body) ? $body : [];
    }

    protected function wordpress_runtime_config(?\WP_REST_Request $request = null): array
    {
        $stored = get_option(self::OPTION_APP_CONFIG, []);
        $stored = is_array($stored) ? $stored : [];

        $config = $this->provider_settings->merge_into_app_config($stored);
        $runtime = \PixflowDesign\WordPress\Modules\BuilderIntegrations::get('bricks', 'runtimeConfig');
        if ($runtime) $config = $runtime($config, $request);
        else { foreach (array_keys($config) as $key) if (str_starts_with($key, 'bricks')) unset($config[$key]); }
        $onboarding_profile = (new UserOnboardingProfile())->get(get_current_user_id());
        $config['onboardingCompleted'] = ($onboarding_profile['completed'] ?? false) === true;
        $config['onboardingRoute'] = ($onboarding_profile['runtimeMode'] ?? '') === 'none' ? 'none' : (($onboarding_profile['runtimeMode'] ?? '') === 'byok' ? 'byok' : 'local');
        // BYOK credentials belong to the browser config. Older plugin builds
        // could leave a redacted marker (or a legacy secret) in the WordPress
        // option; never return that value because it would overwrite the live
        // browser key when the floating panel hydrates its execution config.
        unset($config['apiKey']);
        if (is_array($config['apiProtocolConfigs'] ?? null)) {
            foreach ($config['apiProtocolConfigs'] as $protocol => $protocol_config) {
                if (!is_array($protocol_config)) {
                    continue;
                }
                unset($protocol_config['apiKey']);
                $config['apiProtocolConfigs'][$protocol] = $protocol_config;
            }
        }

        return array_replace_recursive($config, [
            'runtime' => 'wordpress',
            'runtimeMode' => 'wordpress',
            // Availability is request-local, never a saved preference. Returning
            // explicit false also clears capabilities cached before Pro removal.
            'bricksIntegrationActive' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks'),
            'etchIntegrationActive' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('etch'),
            'elementorIntegrationActive' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('elementor'),
            'providerSettings' => $this->provider_settings->get(),
            'wordpress' => [
                'version' => PIXFLOW_DESIGN_VERSION,
                'restBaseUrl' => esc_url_raw(rest_url('pixflow-design/v1')),
                'ajaxUrl' => esc_url_raw(admin_url('admin-ajax.php')),
                'odBaseUrl' => esc_url_raw(rest_url('pixflow-design/v1/od')),
                'siteUrl' => esc_url_raw(home_url()),
                'siteOrigin' => esc_url_raw($this->site_origin()),
                'siteHash' => hash('sha256', untrailingslashit(home_url())),
                'siteLabel' => sanitize_text_field((string) get_bloginfo('name')),
            ],
            'bridge' => $this->od_runtime->bridge_payload(),
            'capabilities' => $this->od_runtime->capabilities(),
        ]);
    }

    protected function od_project_state(string $project_id): array
    {
        $project = $this->project_repository->find_by_uuid($project_id);
        if (!is_array($project) || !$this->project_permissions->can_view($project)) return $this->od_normalize_project_state([]);
        $metadata = is_array($project['metadata'] ?? null) ? $project['metadata'] : [];
        $state = is_array($metadata['odState'] ?? null) ? $metadata['odState'] : [];

        return $this->od_normalize_project_state($state);
    }

    protected function od_save_project_state(string $project_id, array $state): void
    {
        $project = $this->project_repository->find_by_uuid($project_id);

        if (!is_array($project) || !$this->project_permissions->can_edit($project)) {
            return;
        }

        $metadata = is_array($project['metadata'] ?? null) ? $project['metadata'] : [];
        $metadata['odState'] = $this->od_normalize_project_state($state);
        $this->project_repository->update_metadata((int) ($project['id'] ?? 0), $metadata);
    }

    protected function od_normalize_project_state(array $state): array
    {
        return [
            'conversations' => is_array($state['conversations'] ?? null) ? $state['conversations'] : [],
            'messages' => is_array($state['messages'] ?? null) ? $state['messages'] : [],
            'comments' => is_array($state['comments'] ?? null) ? $state['comments'] : [],
            'tabs' => is_array($state['tabs'] ?? null) ? $state['tabs'] : ['tabs' => [], 'active' => null],
        ];
    }

    protected function od_default_conversation(string $project_id): array
    {
        return $this->od_conversation_payload($project_id, 'New chat', 'design', 'wp-conversation-' . $project_id);
    }

    protected function od_normalize_conversation(array $conversation, string $project_id): array
    {
        $now_ms = (int) round(microtime(true) * 1000);
        $id = sanitize_text_field((string) ($conversation['id'] ?? ''));
        if ($id === '') {
            $id = wp_generate_uuid4();
        }
        $title = trim(sanitize_text_field((string) ($conversation['title'] ?? '')));
        $session_mode = (string) ($conversation['sessionMode'] ?? 'design');
        $created = is_numeric($conversation['createdAt'] ?? null) ? (int) $conversation['createdAt'] : $now_ms;
        $updated = is_numeric($conversation['updatedAt'] ?? null) ? (int) $conversation['updatedAt'] : $created;

        return [
            'id' => $id,
            'projectId' => $project_id,
            'title' => $title !== '' ? $title : 'New chat',
            'sessionMode' => $this->od_normalize_session_mode($session_mode),
            'messageCount' => is_numeric($conversation['messageCount'] ?? null) ? (int) $conversation['messageCount'] : 0,
            'createdAt' => $created,
            'updatedAt' => $updated,
        ];
    }

    protected function od_touch_conversation(array &$state, string $conversation_id): void
    {
        $now_ms = (int) round(microtime(true) * 1000);
        $messages = is_array($state['messages'][$conversation_id] ?? null) ? $state['messages'][$conversation_id] : [];
        $conversations = [];
        foreach (is_array($state['conversations'] ?? null) ? $state['conversations'] : [] as $conversation) {
            if (!is_array($conversation)) {
                continue;
            }
            if ((string) ($conversation['id'] ?? '') === $conversation_id) {
                $conversation['updatedAt'] = $now_ms;
                $conversation['messageCount'] = count($messages);
            }
            $conversations[] = $conversation;
        }
        $state['conversations'] = $conversations;
    }

    protected function od_ensure_conversation(array &$state, string $project_id, string $conversation_id, array $message = []): void
    {
        $state['conversations'] = is_array($state['conversations'] ?? null) ? $state['conversations'] : [];
        $state['messages'] = is_array($state['messages'] ?? null) ? $state['messages'] : [];
        $state['messages'][$conversation_id] = is_array($state['messages'][$conversation_id] ?? null) ? $state['messages'][$conversation_id] : [];

        foreach ($state['conversations'] as $conversation) {
            if (is_array($conversation) && (string) ($conversation['id'] ?? '') === $conversation_id) {
                return;
            }
        }

        $title = 'New chat';
        if (($message['role'] ?? '') === 'user' && is_string($message['content'] ?? null)) {
            $candidate = trim(wp_strip_all_tags((string) $message['content']));
            if ($candidate !== '') {
                $title = wp_trim_words($candidate, 8, '...');
            }
        }

        array_unshift($state['conversations'], $this->od_conversation_payload(
            $project_id,
            $title,
            'design',
            $conversation_id
        ));
    }

    protected function od_conversation_title_from_messages(array $messages): string
    {
        foreach ($messages as $message) {
            if (!is_array($message)) {
                continue;
            }
            if (($message['role'] ?? '') !== 'user' || !is_string($message['content'] ?? null)) {
                continue;
            }
            $candidate = trim(wp_strip_all_tags((string) $message['content']));
            if ($candidate !== '') {
                return wp_trim_words($candidate, 8, '...');
            }
        }

        return 'New chat';
    }

    protected function od_conversation_payload(string $project_id, string $title, string $session_mode, string $conversation_id, int $message_count = 0): array
    {
        $now_ms = (int) round(microtime(true) * 1000);
        $title = trim($title) !== '' ? $title : 'New chat';

        return [
            'id' => $conversation_id,
            'projectId' => $project_id,
            'title' => $title,
            'sessionMode' => $this->od_normalize_session_mode($session_mode),
            'messageCount' => max(0, $message_count),
            'createdAt' => $now_ms,
            'updatedAt' => $now_ms,
        ];
    }

    protected function od_normalize_session_mode(string $session_mode): string
    {
        $session_mode = sanitize_key($session_mode);
        if (in_array($session_mode, ['ask', 'chat'], true)) {
            return 'chat';
        }
        if ($session_mode === 'plan') {
            return 'plan';
        }

        return 'design';
    }

    protected function od_plugin_asset_bundle(string $plugin_id): array|\WP_Error
    {
        $plugin = $this->od_registry->plugin($plugin_id);
        if (!is_array($plugin)) {
            return new \WP_Error('plugin_not_found', 'Plugin not found.', ['status' => 404]);
        }

        $manifest = is_array($plugin['manifest'] ?? null) ? $plugin['manifest'] : [];
        $paths = [];
        $add_path = static function (mixed $path) use (&$paths): void {
            if (!is_string($path) || trim($path) === '') {
                return;
            }
            $normalized = ltrim(str_replace('\\', '/', trim($path)), '/');
            while (str_starts_with($normalized, './')) {
                $normalized = substr($normalized, 2);
            }
            if ($normalized === '' || str_contains($normalized, '..')) {
                return;
            }
            $paths[$normalized] = true;
        };

        foreach ((array) ($manifest['od']['context']['assets'] ?? []) as $path) {
            $add_path($path);
        }
        $add_path($manifest['od']['preview']['entry'] ?? null);
        foreach ((array) ($manifest['od']['useCase']['exampleOutputs'] ?? []) as $output) {
            if (is_array($output)) {
                $add_path($output['path'] ?? null);
            }
        }

        $files = [];
        foreach (array_keys($paths) as $relative_path) {
            $asset = $this->od_registry->plugin_asset($plugin_id, $relative_path);
            if ($asset === null) {
                continue;
            }
            $files[] = [
                'path' => 'plugin-assets/' . sanitize_key($plugin_id) . '/' . $relative_path,
                'sourcePath' => $relative_path,
                'mime' => (string) ($asset['mime'] ?? 'application/octet-stream'),
                'encoding' => 'base64',
                'content' => base64_encode((string) ($asset['body'] ?? '')),
            ];
        }

        $files[] = [
            'path' => 'plugin-assets/' . sanitize_key($plugin_id) . '/plugin-manifest.json',
            'sourcePath' => 'plugin-manifest.json',
            'mime' => 'application/json',
            'encoding' => 'base64',
            'content' => base64_encode(wp_json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}'),
        ];

        return [
            'ok' => true,
            'pluginId' => $plugin_id,
            'pluginTitle' => (string) ($plugin['title'] ?? $plugin_id),
            'files' => $files,
        ];
    }

    public function handle_license_status(): \WP_REST_Response
    {
        return $this->json_response($this->license_service->status());
    }

    public function handle_license_validate(\WP_REST_Request $request): \WP_REST_Response
    {
        $body = $request->get_json_params();
        $license_key = is_array($body) ? (string) ($body['license_key'] ?? '') : '';
        $result = $this->license_service->validate($license_key);

        return $this->json_response($result, !empty($result['valid']) ? 200 : 403);
    }

    public function handle_license_reset(): \WP_REST_Response
    {
        return $this->json_response($this->license_service->reset());
    }

    public function handle_bridge_release(): \WP_REST_Response
    {
        $manifest_url = 'https://pixflow.dev/downloads/pixflow-design-bridge/latest.json';
        $response = wp_remote_get($manifest_url, [
            'timeout' => 12,
            'redirection' => 2,
            'headers' => [
                'Accept' => 'application/json',
            ],
        ]);

        if (is_wp_error($response)) {
            // Pixflow-owned: a failed outbound PHP request must not strand the
            // bridge gate on "Checking..." when the plugin already knows its
            // required bridge version. Return a minimal installer manifest and
            // include the fetch error for diagnostics.
            return $this->json_response($this->fallback_bridge_release_manifest($manifest_url, $response->get_error_message()));
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = (string) wp_remote_retrieve_body($response);
        $payload = json_decode($body, true);

        if ($status < 200 || $status >= 300 || !is_array($payload)) {
            // Pixflow-owned: keep update checks non-blocking if pixflow.dev
            // returns malformed release metadata.
            return $this->json_response($this->fallback_bridge_release_manifest(
                $manifest_url,
                'Could not load Pixflow Design Bridge release manifest.',
                $status
            ));
        }

        return $this->json_response($payload);
    }

    /**
     * Pixflow-owned: minimal release manifest used when hosted metadata is
     * unavailable. Compatibility still uses the plugin's bridge requirement.
     *
     * @return array<string, mixed>
     */
    protected function fallback_bridge_release_manifest(string $manifest_url, string $message, int $status = 0): array
    {
        return [
            'schemaVersion' => 1,
            'product' => 'pixflow-design-bridge',
            'version' => defined('PIXFLOW_DESIGN_BRIDGE_VERSION') ? PIXFLOW_DESIGN_BRIDGE_VERSION : '0.0.0',
            'channel' => 'fallback',
            'releasedAt' => gmdate('c'),
            'minimumPluginVersion' => defined('PIXFLOW_DESIGN_VERSION') ? PIXFLOW_DESIGN_VERSION : '',
            'assets' => [],
            'installers' => [
                'windows' => 'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-win-x64-setup.exe',
                'macos' => 'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-mac-arm64.dmg',
                'macosArm64' => 'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-mac-arm64.dmg',
                'linux' => 'https://pixflow.dev/downloads/pixflow-design-bridge/install.sh',
            ],
            'manifestUrl' => $manifest_url,
            'fetchError' => $message,
            'status' => $status,
            'fallback' => true,
        ];
    }

    public function handle_pixflow_mcp_prompt_skills(): \WP_REST_Response
    {
        // Pixflow-owned: the Bricks Agent composer reads slash/mention command
        // metadata from the same PromptSkillCatalog that resolves model prompts.
        $response = $this->pixflow_prompt_skills->response();
        $public_skills = array_column($response['skills'], null, 'id');
        foreach (\PixflowDesign\WordPress\Modules\PersonalSkills::all() as $skill) {
            $public_skills[$skill['id']] = ['id' => $skill['id'], 'label' => $skill['name'], 'command' => '/' . $skill['id'],
                'instruction' => $skill['description'], 'source' => 'user'];
        }
        $response['skills'] = array_values($public_skills);
        return $this->json_response($response);
    }

    protected function site_origin(): string
    {
        $home = home_url();
        $scheme = wp_parse_url($home, PHP_URL_SCHEME);
        $host = wp_parse_url($home, PHP_URL_HOST);
        $port = wp_parse_url($home, PHP_URL_PORT);

        if (!is_string($scheme) || $scheme === '' || !is_string($host) || $host === '') {
            return $home;
        }

        return $scheme . '://' . $host . (is_int($port) ? ':' . $port : '');
    }

    protected function json_response(array $data, int $status = 200): \WP_REST_Response
    {
        return new \WP_REST_Response($data, $status);
    }

    protected function project_file_response(array|\WP_Error $result): \WP_REST_Response
    {
        if (is_wp_error($result)) {
            $data = $result->get_error_data();
            $status = is_array($data) && isset($data['status']) ? (int) $data['status'] : 500;
            return $this->json_response([
                'ok' => false,
                'code' => $result->get_error_code(),
                'message' => $result->get_error_message(),
            ], $status);
        }

        return $this->json_response($result, (int) ($result['status'] ?? 200));
    }

    protected function project_raw_file_response(array|\WP_Error $result): \WP_REST_Response
    {
        if (is_wp_error($result)) return $this->project_file_response($result);
        $path = (string) ($result['path'] ?? '');
        if ($path === '' || !is_readable($path)) return $this->json_response(['message' => 'Project file was not found.'], 404);
        $mime = (string) ($result['mime'] ?? 'application/octet-stream');
        if (str_starts_with($mime, 'image/') || str_starts_with($mime, 'video/') || str_starts_with($mime, 'audio/')) {
            $preview_url = $this->media_library->generated_attachment_url_for_path($path);
            if ($preview_url !== '') {
                $response = new \WP_REST_Response(null, 302);
                $response->header('Location', $preview_url);
                return $response;
            }
        }
        $content = file_get_contents($path);
        if (!is_string($content)) return $this->json_response(['message' => 'Could not read project file.'], 500);

        return $this->text_response($content, $mime);
    }

    protected function project_preview_kind(string $mime): string
    {
        if (str_starts_with($mime, 'image/')) return 'image';
        if (str_starts_with($mime, 'video/')) return 'video';
        if (str_starts_with($mime, 'audio/')) return 'audio';
        if (in_array($mime, ['text/html', 'application/xhtml+xml'], true)) return 'html';
        if (str_starts_with($mime, 'text/')) return 'text';
        return match ($mime) {
            'application/pdf' => 'pdf',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'document',
            'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'presentation',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'spreadsheet',
            default => 'document',
        };
    }

    protected function has_configured_media_providers(array $providers): bool
    {
        foreach ($providers as $provider) {
            if (is_array($provider) && (($provider['apiKeyConfigured'] ?? false) || !empty($provider['baseUrl']))) {
                return true;
            }
        }

        return false;
    }

    protected function normalize_multiple_uploads(array $files): array
    {
        $normalized = [];
        $names = is_array($files['name'] ?? null) ? $files['name'] : [];
        foreach ($names as $index => $name) {
            $normalized[] = [
                'name' => (string) $name,
                'type' => is_array($files['type'] ?? null) ? (string) ($files['type'][$index] ?? '') : '',
                'tmp_name' => is_array($files['tmp_name'] ?? null) ? (string) ($files['tmp_name'][$index] ?? '') : '',
                'error' => is_array($files['error'] ?? null) ? (int) ($files['error'][$index] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE,
                'size' => is_array($files['size'] ?? null) ? (int) ($files['size'][$index] ?? 0) : 0,
            ];
        }

        return $normalized;
    }

    protected function text_response(string $body, string $content_type = 'text/plain; charset=utf-8', int $status = 200): \WP_REST_Response
    {
        $response = new \WP_REST_Response($body, $status);
        $response->header('X-Pixflow-Raw-Text', '1');
        $response->header('Content-Type', $content_type);
        // Generated HTML/SVG and community previews are untrusted documents.
        // Scripts can render the preview, but must never acquire WordPress origin
        // access even when the raw URL is opened outside the workspace iframe.
        $response->header('Content-Security-Policy', 'sandbox allow-scripts');
        $response->header('X-Content-Type-Options', 'nosniff');
        $response->header('Referrer-Policy', 'no-referrer');
        $response->header('Cache-Control', 'private, no-store');

        return $response;
    }

    protected function fetch_aihubmix_media_models(string $type): array
    {
        $remote = wp_remote_get('https://aihubmix.com/api/v1/models?type=' . rawurlencode($type), [
            'timeout' => 12,
            'redirection' => 0,
        ]);
        if (is_wp_error($remote) || (int) wp_remote_retrieve_response_code($remote) < 200 || (int) wp_remote_retrieve_response_code($remote) >= 300) {
            return [];
        }

        $data = json_decode((string) wp_remote_retrieve_body($remote), true);
        $rows = is_array($data['data'] ?? null) ? $data['data'] : [];
        $seen = [];
        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row) || !is_string($row['model_id'] ?? null) || $row['model_id'] === '') {
                continue;
            }
            $wire_id = trim($row['model_id']);
            $id = 'aihubmix-' . preg_replace('/^aihubmix-/', '', $wire_id);
            if ($id === 'aihubmix-' || isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $label = is_string($row['model_name'] ?? null) && trim($row['model_name']) !== ''
                ? trim($row['model_name'])
                : $wire_id;
            $out[] = ['id' => $id, 'label' => $label];
        }
        usort($out, static fn(array $a, array $b): int => strcmp($a['id'], $b['id']));

        return $out;
    }

    public function serve_raw_text_response(bool $served, mixed $result, \WP_REST_Request $request, \WP_REST_Server $server): bool
    {
        if ($served || !$result instanceof \WP_REST_Response) {
            return $served;
        }

        $headers = $result->get_headers();
        $binary_header = $headers['X-Pixflow-Raw-Binary'] ?? '';
        if ($binary_header === '1') {
            status_header($result->get_status());
            foreach (['Content-Type', 'Content-Disposition', 'Content-Length', 'Cache-Control', 'X-Content-Type-Options'] as $name) {
                if (isset($headers[$name])) $server->send_header($name, (string) $headers[$name]);
            }
            echo (string) $result->get_data();
            return true;
        }

        $raw_header = $headers['X-Pixflow-Raw-Text'] ?? '';
        if ($raw_header !== '1') {
            return false;
        }

        $content_type = (string) ($headers['Content-Type'] ?? 'text/plain; charset=utf-8');
        status_header($result->get_status());
        $server->send_header('Content-Type', $content_type);
        $server->send_header('X-Pixflow-Raw-Text', '1');
        foreach (['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Cache-Control'] as $name) {
            if (isset($headers[$name])) $server->send_header($name, (string) $headers[$name]);
        }
        echo (string) $result->get_data();

        return true;
    }
}
