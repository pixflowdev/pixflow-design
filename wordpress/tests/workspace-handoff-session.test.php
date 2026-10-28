<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Pages {
    final class BuilderHandoffs {
        public function workspace_source(mixed $source): array|\WP_Error {
            $GLOBALS['validated_source'] = $source;
            return $source === $GLOBALS['expected_source'] ? $source : new \WP_Error('invalid', 'Source denied', ['status' => 403]);
        }
    }
}
namespace PixflowDesign\WordPress\Admin {
    final class DirectSiteWorkspace {
        public function __construct(private readonly ?array $source = null) {}
        public function call(string $tool, array $args, bool $writable): array { return ['source' => $this->source, 'tool' => $tool, 'args' => $args, 'writable' => $writable]; }
    }
}
namespace PixflowDesign\WordPress\Modules {
    final class FeatureContributions { public static function available(string $feature): bool { return true; } }
    final class ImageGenerationAccess { public static function available(): bool { return true; } }
    final class BuilderIntegrations {
        public static function active(string $builder): bool { return false; }
        public static function present(string $builder): bool { return !empty($GLOBALS['builder_present']); }
    }
    final class ComposioAccess { public static function configured(): bool { return false; } }
}
namespace {
    define('ABSPATH', __DIR__);
    final class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} }
    final class WP_REST_Request {
        public function __construct(private array $body = [], private string $authorization = '') {}
        public function get_json_params(): array { return $this->body; }
        public function get_body(): string { return json_encode($this->body, JSON_THROW_ON_ERROR); }
        public function get_header(string $name): string { return $this->authorization; }
        public function get_method(): string { return 'POST'; }
    }
    $GLOBALS['transients'] = [];
    $GLOBALS['expected_source'] = ['projectId' => 'project-1', 'conversationId' => 'chat-1', 'requestId' => 'source-message-0001'];
    function apply_filters($name,$value) { return $GLOBALS['run_guidance'] ?? $value; }
    function get_current_user_id(): int { return 1; }
    function get_current_blog_id(): int { return 1; }
    function wp_set_current_user(int $id): void {}
    function current_user_can(string $cap): bool { return true; }
    function update_user_meta(int $id, string $key, mixed $value): void { $GLOBALS['settings_writes'] = ($GLOBALS['settings_writes'] ?? 0) + 1; }
    function set_transient(string $key, mixed $value, int $ttl): void { $GLOBALS['transients'][$key] = $value; }
    function get_transient(string $key): mixed { return $GLOBALS['transients'][$key] ?? false; }
    function home_url(string $path): string { return 'https://example.test' . $path; }
    function add_query_arg(string $key, string $value, string $url): string { return $url . '?' . http_build_query([$key => $value]); }
    function check(bool $condition, string $message): void { if (!$condition) throw new \RuntimeException($message); }
    require __DIR__ . '/../src/Http/DirectSiteRestController.php';
    $controller = new \PixflowDesign\WordPress\Http\DirectSiteRestController();
    $source = $GLOBALS['expected_source'];
    $session = $controller->sessions(new WP_REST_Request(['workspaceSource' => $source]));
    check(is_array($session) && $session['workspaceSource'] === $source, 'Validated source returned to host');
    check($GLOBALS['transients']['pixflow_direct_' . hash('sha256', $session['token'])]['workspaceSource'] === $source, 'Source stored server-side with token');
    $request = new WP_REST_Request(['tool' => 'builder.handoff', 'arguments' => ['projectId' => 'forged-project']], 'Bearer ' . $session['token']);
    check($controller->session_permission($request), 'Source session authenticates');
    check($controller->tools($request)['source'] === $source, 'Model arguments do not replace credential source');
    $described = $controller->session($request);
    check($described['workspaceSource'] === $source && !isset($described['token']), 'Session verification exposes source without credentials');
    foreach ([['workspaceSource' => ['projectId' => 'another']], ['workspaceSource' => $source, 'editorTarget' => ['builder' => 'etch']], ['workspaceSource' => $source, 'purpose' => 'audio']] as $body) {
        check($controller->sessions(new WP_REST_Request($body)) instanceof WP_Error, 'Invalid/mixed session rejected');
    }
    $GLOBALS['run_guidance'] = ['revision'=>3,'product'=>'Server saved facts'];
    $ordinary = $controller->sessions(new WP_REST_Request([]));
    check(is_array($ordinary) && $ordinary['workspaceSource'] === null && $ordinary['writable'], 'Ordinary editor/admin sessions remain unchanged');
    check($ordinary['designGuidance'] === $GLOBALS['run_guidance'], 'Server-owned snapshot included');
    $forged = $controller->sessions(new WP_REST_Request(['designGuidance'=>['product'=>'forged']]));
    check($forged['designGuidance'] === $GLOBALS['run_guidance'], 'Client cannot substitute stored guidance');
    $writes = $GLOBALS['settings_writes'];
    $draft = $controller->sessions(new WP_REST_Request(['purpose' => 'guidance-draft']));
    check($draft['designGuidance'] === null, 'Draft excludes automatic guidance');
    check(is_array($draft) && !$draft['writable'], 'Draft session is read-only on the server');
    check($GLOBALS['settings_writes'] === $writes, 'Drafting leaves saved access preferences unchanged');
    $draftRequest = new WP_REST_Request(['tool' => 'site.write', 'arguments' => ['writable' => true]], 'Bearer ' . $draft['token']);
    check($controller->session_permission($draftRequest), 'Draft authenticates normally');
    check($controller->tools($draftRequest)['writable'] === false, 'Model arguments cannot upgrade a draft session');
    check($controller->sessions(new WP_REST_Request(['purpose' => 'guidance-draft', 'workspaceSource' => $source])) instanceof WP_Error, 'Draft cannot start a builder handoff');
    $GLOBALS['builder_present']=true;
    $error=$controller->canvas(new WP_REST_Request(['builder'=>'bricks','action'=>'poll']));
    check($error instanceof WP_Error && $error->code==='pixflow_pro_required' && $error->data['status']===403,'Present builder with denied Pro access reported a theme change');
    $GLOBALS['builder_present']=false;
    $error=$controller->canvas(new WP_REST_Request(['builder'=>'bricks','action'=>'poll']));
    check($error instanceof WP_Error && $error->code==='builder_unavailable' && $error->data['status']===409,'Missing integration was not distinguished from Pro denial');
    echo "Workspace handoff session and builder availability tests passed.\n";
}
