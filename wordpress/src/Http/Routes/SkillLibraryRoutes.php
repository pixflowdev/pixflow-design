<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Http\Routes;
if (!defined('ABSPATH')) exit;

/** Site administration only; deliberately absent from the agent tool catalogue. */
final class SkillLibraryRoutes
{
    public function register(): void
    {
        register_rest_route('pixflow-design/v1', '/skill-library', [
            'methods'=>['GET', 'POST'], 'permission_callback'=>[$this, 'allowed'], 'callback'=>[$this, 'handle'],
        ]);
    }
    public function allowed(\WP_REST_Request $request): bool
    {
        return current_user_can('manage_options') && current_user_can('install_plugins')
            && ((defined('WP_CLI') && WP_CLI) || (is_user_logged_in() && wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')));
    }
    public function handle(\WP_REST_Request $request): \WP_REST_Response
    {
        if (!$this->allowed($request)) return new \WP_REST_Response(['error'=>'You cannot manage the skill library.'], 403);
        if (!class_exists(\PixflowDesign\WordPress\CreativeSkills\SkillLibrary::class)) {
            if ($request->get_method() === 'GET' && $request->get_param('action') !== 'preview') return new \WP_REST_Response(['skills'=>[], 'pro'=>false, 'error'=>null], 200, ['Cache-Control'=>'no-store']);
            return new \WP_REST_Response(['error'=>'Install Pixflow Design Pro to manage optional library skills.'], 403);
        }
        try {
            $library = new \PixflowDesign\WordPress\CreativeSkills\SkillLibrary();
            if ($request->get_method() === 'GET' && $request->get_param('action') === 'preview') {
                return new \WP_REST_Response($library->preview((string) $request->get_param('id'), (string) $request->get_param('digest')), 200, ['Cache-Control'=>'no-store']);
            }
            if ($request->get_method() === 'GET') return new \WP_REST_Response($library->overview((string) $request->get_param('refresh') === '1'), 200, ['Cache-Control'=>'no-store']);
            $body = (array) $request->get_json_params();
            $id = (string) ($body['id'] ?? ''); $action = (string) ($body['action'] ?? '');
            if (!preg_match('/^[a-z][a-z0-9-]{2,59}$/D', $id)) throw new \RuntimeException('Invalid library skill.');
            $result = $action === 'install' ? $library->install($id, (string) ($body['digest'] ?? '')) : $library->change($id, $action);
            return new \WP_REST_Response($result, 200, ['Cache-Control'=>'no-store']);
        } catch (\Throwable $e) {
            return new \WP_REST_Response(['error'=>$e->getMessage()], 400, ['Cache-Control'=>'no-store']);
        }
    }
    public static function register_cli(): void
    {
        if (!defined('WP_CLI') || !WP_CLI) return;
        \WP_CLI::add_command('pixflow skills', static function (array $args, array $options): void {
            $action = $args[0] ?? 'list';
            $request = new \WP_REST_Request(in_array($action, ['list', 'preview'], true) ? 'GET' : 'POST', '/pixflow-design/v1/skill-library');
            if ($action === 'preview') { $request->set_param('action', 'preview'); $request->set_param('id', $args[1] ?? ''); $request->set_param('digest', $options['digest'] ?? ''); }
            if ($action === 'list' && isset($options['refresh'])) $request->set_param('refresh', '1');
            if (!in_array($action, ['list', 'preview'], true)) {
                $request->set_header('Content-Type', 'application/json');
                $request->set_body(wp_json_encode(['action'=>$action, 'id'=>$args[1] ?? '', 'digest'=>$options['digest'] ?? '']));
            }
            $response = rest_do_request($request);
            \WP_CLI::line(wp_json_encode($response->get_data(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            if ($response->get_status() >= 400) \WP_CLI::halt(1);
        }, ['shortdesc'=>'Manage the site-owned Pro skill library (--user=<administrator>, --url=<site>, --json).']);
    }
}
