<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Http\Routes;
use PixflowDesign\WordPress\Languages\LanguagePackService;
if (!defined('ABSPATH')) exit;

/** Free language administration; no licence, Bridge, remote URL or agent-code execution. */
final class LanguagePackRoutes
{
    public function __construct(private readonly LanguagePackService $service = new LanguagePackService()) {}
    public function register(): void
    {
        register_rest_route('pixflow-design/v1', '/language-packs', ['methods'=>'GET', 'permission_callback'=>[$this, 'allowed'], 'callback'=>[$this, 'handle']]);
        register_rest_route('pixflow-design/v1', '/language-packs/(?P<locale>[a-z]{2}(?:-[A-Z]{2})?)', ['methods'=>['GET', 'POST'], 'permission_callback'=>[$this, 'allowed'], 'callback'=>[$this, 'handle']]);
    }
    public function allowed(\WP_REST_Request $request): bool
    {
        return current_user_can($request->get_method() === 'POST' ? 'manage_options' : 'edit_posts')
            && ((defined('WP_CLI') && WP_CLI) || (is_user_logged_in() && wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')));
    }
    public function handle(\WP_REST_Request $request): \WP_REST_Response
    {
        $headers = ['Cache-Control'=>'no-store'];
        if (!$this->allowed($request)) return new \WP_REST_Response(['error'=>'You cannot manage these language files.'], 403, $headers);
        try {
            $locale = (string) $request->get_param('locale');
            $data = $locale === '' ? $this->service->overview() : ($request->get_method() === 'POST' ? $this->service->install($locale) : $this->service->read($locale));
            return new \WP_REST_Response($data, 200, $headers);
        } catch (\OutOfBoundsException $e) {
            return new \WP_REST_Response(['error'=>$e->getMessage()], 404, $headers);
        } catch (\Throwable $e) {
            return new \WP_REST_Response(['error'=>$e->getMessage()], 400, $headers);
        }
    }
    public static function register_cli(): void
    {
        if (!defined('WP_CLI') || !WP_CLI) return;
        \WP_CLI::add_command('pixflow languages', static function (array $args): void {
            $action = $args[0] ?? 'list';
            if (!in_array($action, ['list', 'get', 'install'], true)) { \WP_CLI::error('Use list, get <locale>, or install <locale>.'); return; }
            $request = new \WP_REST_Request($action === 'install' ? 'POST' : 'GET', '/pixflow-design/v1/language-packs' . ($action === 'list' ? '' : '/' . rawurlencode($args[1] ?? '')));
            $response = rest_do_request($request);
            \WP_CLI::line(wp_json_encode($response->get_data(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            if ($response->get_status() >= 400) \WP_CLI::halt(1);
        }, ['shortdesc'=>'List or install Free language packs (--user=<administrator>, --url=<site>, --json).']);
    }
}
