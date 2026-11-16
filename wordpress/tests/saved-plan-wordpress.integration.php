<?php
declare(strict_types=1);

// Explicit local WordPress fixture only. Never run against a customer install.
$root = getenv('PIXFLOW_PLAN_TEST_WORDPRESS');
if (!$root) throw new RuntimeException('Set PIXFLOW_PLAN_TEST_WORDPRESS to the isolated local fixture.');
require $root . '/wp-load.php';
if (wp_get_environment_type() !== 'local' || home_url() !== 'http://127.0.0.1:18374') throw new RuntimeException('Wrong test site.');
wp_set_current_user(get_user_by('login', 'designqa')->ID);

use PixflowDesign\WordPress\Chat\HistoryService;
use PixflowDesign\WordPress\Chat\SavedPlan;
use PixflowDesign\WordPress\Http\DirectSiteRestController;

function plan_check(bool $value, string $message): void {
    if (!$value) throw new RuntimeException($message);
    echo "PASS: $message\n";
}
function plan_request(array $body): WP_REST_Request {
    $request = new WP_REST_Request('POST', '/pixflow-design/v1/wp-admin/direct/tools');
    $request->set_header('content-type', 'application/json');
    $request->set_body(wp_json_encode($body));
    return $request;
}
$history = new HistoryService();
$binding = $history->resolve(['sessionKey' => 'saved-plan-integration-' . wp_generate_uuid4(), 'title' => 'Saved plan integration fixture']);
plan_check(!is_wp_error($binding), 'Create isolated owned chat');
$project = $binding['projectId']; $chat = $binding['conversationId'];
$controller = new DirectSiteRestController();
$session = $controller->sessions(plan_request(['historyBinding' => $binding]));
$call = static function(string $tool, array $args = []) use ($controller, $session): mixed {
    $request = plan_request(['tool' => $tool, 'arguments' => $args]);
    $request->set_header('authorization', 'Bearer ' . $session['token']);
    if (!$controller->session_permission($request)) throw new RuntimeException('Session rejected');
    return $controller->tools($request);
};
try {
    plan_check($call('plan.read')['plan'] === null, 'A new chat has no inherited plan');
    $plan = ['id' => 'page', 'title' => 'Build a service page', 'summary' => 'Approved outline', 'revision' => 0,
        'steps' => [['id' => 'build', 'content' => 'Build page', 'status' => 'in_progress'], ['id' => 'verify', 'content' => 'Check result', 'status' => 'pending']]];
    $saved = $call('plan.update', $plan);
    plan_check(($saved['plan']['revision'] ?? null) === 1, 'Authenticated tool persists the plan');
    $stale = $call('plan.update', $plan);
    plan_check(is_wp_error($stale) && $stale->get_error_data()['status'] === 409, 'Stale tool update conflicts');
    $bad = $call('plan.read', ['conversationId' => 'another-chat']);
    plan_check(is_wp_error($bad), 'Tool cannot select a different chat');
    $ordinary = $history->write($project, $chat, ['id' => SavedPlan::MESSAGE_ID, 'role' => 'assistant', 'content' => 'stale browser snapshot']);
    plan_check(($ordinary['message']['savedPlan']['title'] ?? '') === $plan['title'], 'Browser transcript save cannot overwrite the plan');
    for ($i = 0; $i < 55; ++$i) $history->write($project, $chat, ['id' => 'message-' . $i, 'role' => 'user', 'content' => 'History fixture ' . $i, 'createdAt' => time() * 1000 + $i]);
    $page = (new HistoryService())->page($project, $chat, 50);
    plan_check(count(array_filter($page['messages'], static fn(array $m): bool => $m['id'] === SavedPlan::MESSAGE_ID)) === 1, 'First history window restores one plan beyond 50 messages');
    plan_check($history->page($project, $chat, 1)['messages'][0]['id'] === 'message-54', 'Latest-message probe still returns the actual latest message');
    $readOnly = $controller->sessions(plan_request(['purpose' => 'external-mcp', 'historyBinding' => $binding]));
    $request = plan_request(['tool' => 'plan.update', 'arguments' => $saved['plan']]);
    $request->set_header('authorization', 'Bearer ' . $readOnly['token']);
    plan_check($controller->session_permission($request), 'Read-only session authenticates');
    $denied = $controller->tools($request);
    plan_check(is_wp_error($denied) && $denied->get_error_data()['status'] === 403, 'Read-only session cannot mutate progress');
    wp_set_current_user(0);
    plan_check(is_wp_error($history->plan($project, $chat)), 'Anonymous user cannot read the saved plan');
} finally {
    wp_set_current_user(get_user_by('login', 'designqa')->ID);
    $history->remove_conversation($project, $chat);
}
