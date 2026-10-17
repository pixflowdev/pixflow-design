<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Http\Routes;

use PixflowDesign\WordPress\Chat\HistoryService;

if (!defined('ABSPATH')) exit;

final class ChatHistoryRoutes
{
    public function __construct(private readonly HistoryService $history = new HistoryService()) {}

    private function response(callable $callback): \WP_REST_Response|\WP_Error
    {
        try { $result = $callback(); }
        catch (\Throwable $error) { return new \WP_Error('pixflow_history_storage', 'Chat history could not be saved or loaded. Please retry.', ['status' => 503]); }
        return is_wp_error($result) ? $result : new \WP_REST_Response($result, 200, ['Cache-Control' => 'no-store']);
    }

    public function register(): void
    {
        $permission = static fn(): bool => get_current_user_id() > 0 && current_user_can('edit_posts');
        register_rest_route('pixflow-design/v1', '/chat-history/resolve', ['methods' => 'POST', 'permission_callback' => $permission,
            'callback' => fn(\WP_REST_Request $request) => $this->response(fn() => $this->history->resolve((array) $request->get_json_params()))]);
        register_rest_route('pixflow-design/v1', '/chat-history/conversations', ['methods' => 'GET', 'permission_callback' => $permission,
            'callback' => fn(\WP_REST_Request $request) => $this->response(fn() => $this->history->owned_conversations((int) ($request['limit'] ?? 50), (string) ($request['before'] ?? '')))]);
        register_rest_route('pixflow-design/v1', '/chat-history/storage', ['methods' => 'GET', 'permission_callback' => $permission,
            'callback' => fn() => $this->response(fn() => $this->history->storage_usage())]);
        $base = '/chat-history/(?P<projectId>[a-zA-Z0-9-]{36})/(?P<conversationId>[^/]+)';
        register_rest_route('pixflow-design/v1', $base . '/export', ['methods' => 'GET', 'permission_callback' => $permission,
            'callback' => fn(\WP_REST_Request $request) => $this->response(fn() => $this->history->export_page(
                (string) $request['projectId'], rawurldecode((string) $request['conversationId']), (string) ($request['cursor'] ?? ''), (int) ($request['limit'] ?? 100)))]);
        register_rest_route('pixflow-design/v1', $base . '/working-context', ['methods' => 'POST', 'permission_callback' => $permission,
            'callback' => fn(\WP_REST_Request $request) => $this->response(fn() => (new \PixflowDesign\WordPress\Chat\WorkingContextService())->prepare(
                (string) $request['projectId'], rawurldecode((string) $request['conversationId']), (array) $request->get_json_params()))]);
        register_rest_route('pixflow-design/v1', $base . '/working-context/commit', ['methods' => 'POST', 'permission_callback' => $permission,
            'callback' => fn(\WP_REST_Request $request) => $this->response(fn() => (new \PixflowDesign\WordPress\Chat\WorkingContextService())->commit(
                (string) $request['projectId'], rawurldecode((string) $request['conversationId']), (string) (((array) $request->get_json_params())['candidateId'] ?? '')))]);
        register_rest_route('pixflow-design/v1', $base . '/working-context/run', ['methods' => 'POST', 'permission_callback' => $permission,
            'callback' => fn(\WP_REST_Request $request) => $this->response(fn() => (new \PixflowDesign\WordPress\Chat\WorkingContextService())->run(
                (string) $request['projectId'], rawurldecode((string) $request['conversationId']), (array) $request->get_json_params()))]);
        register_rest_route('pixflow-design/v1', $base . '/messages', ['methods' => ['GET', 'POST'], 'permission_callback' => $permission,
            'callback' => function (\WP_REST_Request $request) {
                return $this->response(function () use ($request) {
                    $project = (string) $request['projectId']; $conversation = rawurldecode((string) $request['conversationId']);
                    if ($request->get_method() === 'GET') return $this->history->page($project, $conversation, (int) ($request['limit'] ?? 50), (string) ($request['before'] ?? ''));
                    $body = (array) $request->get_json_params(); $messages = $body['messages'] ?? null;
                    if (!is_array($messages) || count($messages) > 100) return new \WP_Error('pixflow_history_invalid', 'Send at most 100 messages at a time.', ['status' => 400]);
                    $saved = []; $deleted = [];
                    foreach ($messages as $message) {
                        if (!is_array($message)) return new \WP_Error('pixflow_history_invalid', 'Invalid message.', ['status' => 400]);
                        $result = $this->history->write($project, $conversation, $message, true, ($body['importOnly'] ?? false) === true);
                        if (is_wp_error($result) && $result->get_error_code() === 'pixflow_history_deleted' && ($body['importOnly'] ?? false) === true) {
                            // Conversation deletion remains a hard stop; individual message tombstones
                            // must not prevent the remaining browser backup from reaching durable storage.
                            $live = $this->history->page($project, $conversation, 1);
                            if (is_wp_error($live)) return $live;
                            $deleted[] = $message['id'];
                            continue;
                        }
                        if (is_wp_error($result)) return $result;
                        $saved[] = $result['message'];
                    }
                    return ['ok' => true, 'messages' => $saved, 'deletedMessageIds' => $deleted];
                });
            }]);
        register_rest_route('pixflow-design/v1', $base . '/messages/(?P<messageId>[^/]+)', ['methods' => ['PUT', 'DELETE'], 'permission_callback' => $permission,
            'callback' => function (\WP_REST_Request $request) {
                return $this->response(function () use ($request) {
                    // WordPress route captures retain URL escaping. Decode exactly once:
                    // imported payloads, streaming PUTs and DELETEs must share one identity.
                    $project = (string) $request['projectId']; $conversation = rawurldecode((string) $request['conversationId']); $id = rawurldecode((string) $request['messageId']);
                    if ($request->get_method() === 'DELETE') return $this->history->remove($project, $conversation, $id);
                    $message = (array) $request->get_json_params(); $message['id'] = $id;
                    return $this->history->write($project, $conversation, $message);
                });
            }]);
    }

    public static function register_cli(): void
    {
        if (!defined('WP_CLI') || !WP_CLI) return;
        \WP_CLI::add_command('pixflow chat-history', static function (array $args, array $options): void {
            $action = $args[0] ?? 'read';
            if (!in_array($action, ['list', 'resolve', 'read', 'write', 'delete', 'import', 'context', 'context-commit', 'context-run', 'export', 'usage'], true)) \WP_CLI::error('Use list, resolve, read, write, delete, import, context, context-commit, context-run, export or usage.');
            $path = $action === 'list' ? 'conversations' : ($action === 'resolve' ? 'resolve' : rawurlencode($args[1] ?? '') . '/' . rawurlencode($args[2] ?? '') . '/messages');
            if ($action === 'usage') $path = 'storage';
            if ($action === 'export') $path = rawurlencode($args[1] ?? '') . '/' . rawurlencode($args[2] ?? '') . '/export';
            if (in_array($action, ['context', 'context-commit', 'context-run'], true)) $path = rawurlencode($args[1] ?? '') . '/' . rawurlencode($args[2] ?? '') . '/working-context' . ($action === 'context-commit' ? '/commit' : ($action === 'context-run' ? '/run' : ''));
            if (in_array($action, ['write', 'delete'], true)) $path .= '/' . rawurlencode($args[3] ?? '');
            $method = ['list' => 'GET', 'resolve' => 'POST', 'read' => 'GET', 'write' => 'PUT', 'delete' => 'DELETE', 'import' => 'POST', 'context' => 'POST', 'context-commit' => 'POST', 'context-run' => 'POST', 'export' => 'GET', 'usage' => 'GET'][$action];
            $request = new \WP_REST_Request($method, '/pixflow-design/v1/chat-history/' . $path);
            if ($action === 'export') { $request->set_param('limit', (int) ($options['limit'] ?? 100)); $request->set_param('cursor', (string) ($options['cursor'] ?? '')); }
            if (in_array($action, ['list', 'read'], true)) { $request->set_param('limit', (int) ($options['limit'] ?? 50)); $request->set_param('before', (string) ($options['before'] ?? '')); }
            if (in_array($action, ['resolve', 'write', 'import', 'context', 'context-commit', 'context-run'], true)) {
                $file = (string) ($options['prompt-file'] ?? '');
                if ($file === '') \WP_CLI::error('Supply --prompt-file=<JSON file|-> with the request body.');
                $body = file_get_contents($file === '-' ? 'php://stdin' : $file);
                if ($body === false || !is_array(json_decode($body, true))) \WP_CLI::error('The request body must be a JSON object.');
                $request->set_header('Content-Type', 'application/json'); $request->set_body($body);
            }
            $response = rest_do_request($request);
            \WP_CLI::line(wp_json_encode($response->get_data(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            if ($response->get_status() >= 400) \WP_CLI::halt(1);
        }, ['shortdesc' => 'Read and preserve owned chats through the same REST service (--user=<owner>, --json).']);
    }
}
