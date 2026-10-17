<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require __DIR__ . '/../src/Modules/FeatureContributions.php';
require __DIR__ . '/../src/Modules/WorkspaceAccess.php';
require __DIR__ . '/../src/Http/Routes/WorkspaceOrganizationRoutes.php';
use PixflowDesign\WordPress\Http\Routes\WorkspaceOrganizationRoutes as Organization;
use PixflowDesign\WordPress\Modules\FeatureContributions;
class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} }
class WP_REST_Response { public function __construct(public mixed $data, public int $status = 200, public array $headers = []) {} }
class WP_REST_Request { public function __construct(private array $body) {} public function get_json_params(): array { return $this->body; } }
function get_current_user_id(): int { return $GLOBALS['user'] ?? 1; }
function current_user_can(string $cap): bool { return $GLOBALS['can_edit'] ?? true; }
function get_option(string $key, mixed $fallback = false): mixed { return $GLOBALS['options'][$key] ?? $fallback; }
function add_option(string $key, mixed $value, mixed $unused = '', bool $autoload = false): bool {
    if (isset($GLOBALS['options'][$key])) return false;
    $GLOBALS['options'][$key] = $value; return true;
}
function maybe_serialize(mixed $value): string { return serialize($value); }
function wp_cache_delete(string $key, string $group): void {}
$GLOBALS['wpdb'] = new class {
    public string $options = 'wp_options';
    public function update(string $table, array $values, array $where, array $formats, array $where_formats): int {
        $key = $where['option_name'];
        if (serialize($GLOBALS['options'][$key] ?? null) !== $where['option_value']) return 0;
        $GLOBALS['options'][$key] = unserialize($values['option_value']); return 1;
    }
};
$checks = 0;
function check(bool $value, string $message): void { global $checks; $checks++; if (!$value) throw new RuntimeException($message); }
$routes = new Organization();
check(!$routes->allowed(), 'Free cannot access organization');
FeatureContributions::add('workspace', static fn(): string => 'pixflow-workspace');
check($routes->allowed(), 'Pro can access organization');
$GLOBALS['can_edit'] = false;
check(!$routes->allowed(), 'Restricted accounts cannot access organization');
$GLOBALS['can_edit'] = true; $GLOBALS['user'] = 0;
check(!$routes->allowed(), 'Anonymous accounts cannot access organization');
$GLOBALS['user'] = 1;
FeatureContributions::authorize_using(static fn(): bool => false);
check(!$routes->allowed(), 'Expired Pro denied');
FeatureContributions::authorize_using(static fn(): bool => true);

$state = Organization::empty_state();
$source_chat = ['id' => 'chat-1', 'messages' => ['Preserve'], 'files' => ['index.html'], 'settings' => ['agent' => 'codex']];
$before = $source_chat;
$can_view = static fn(string $id): bool => $id === 'chat-1';
$actions = [
    ['type' => 'create-project', 'id' => 'client', 'name' => 'Client'],
    ['type' => 'move-chat', 'chatId' => 'chat-1', 'projectId' => 'client'],
    ['type' => 'pin-chat', 'chatId' => 'chat-1', 'pinned' => true],
    ['type' => 'pin-project', 'id' => 'client', 'pinned' => true],
    ['type' => 'collapse-project', 'id' => 'client', 'collapsed' => true],
    ['type' => 'rename-project', 'id' => 'client', 'name' => 'Updated'],
    ['type' => 'collapse-sidebar', 'collapsed' => true],
    ['type' => 'collapse-section', 'section' => 'projects', 'collapsed' => true],
];
foreach ($actions as $action) { $state = Organization::apply($state, $action, $can_view); check(is_array($state), 'Valid action accepted'); }
check($state['projects'][0] === ['id' => 'client', 'name' => 'Updated', 'pinned' => true, 'collapsed' => true], 'Group properties retained');
$state = Organization::apply($state, ['type' => 'delete-project', 'id' => 'client'], $can_view);
check($state['projects'] === [] && $state['chats']['chat-1'] === ['projectId' => null, 'pinned' => true], 'Delete only releases membership, preserving pin');
check($before === $source_chat, 'Original chat, settings, messages and files unchanged');
check($state['collapsedSections'] === ['projects' => true], 'Section collapse persists independently');
foreach ([
    ['type' => 'create-project', 'id' => '__proto__', 'name' => 'Bad'],
    ['type' => 'create-project', 'id' => 'x', 'name' => ' '],
    ['type' => 'create-project', 'id' => 'x', 'name' => str_repeat('a', 101)],
    ['type' => 'pin-chat', 'chatId' => 'private', 'pinned' => true],
    ['type' => 'pin-chat', 'chatId' => 'chat-1', 'pinned' => 'true'],
    ['type' => 'move-chat', 'chatId' => 'chat-1', 'projectId' => 'missing'],
    ['type' => 'move-chat', 'chatId' => 'chat-1'],
    ['type' => 'collapse-sidebar', 'collapsed' => 1],
    ['type' => 'collapse-section', 'section' => '__proto__', 'collapsed' => true],
] as $action) check(Organization::apply($state, $action, $can_view) instanceof WP_Error, 'Malformed or inaccessible mutation rejected');

check($routes->read()->data['revision'] === 0, 'First load does not migrate or change content');
$first = $routes->mutate(new WP_REST_Request(['revision' => 0, 'action' => ['type' => 'create-project', 'id' => 'personal', 'name' => 'Personal']]));
check($first instanceof WP_REST_Response && $first->data['revision'] === 1, 'First write stored');
check($routes->read()->data['projects'][0]['name'] === 'Personal', 'Reload preserves organization');
$stale = $routes->mutate(new WP_REST_Request(['revision' => 0, 'action' => ['type' => 'collapse-sidebar', 'collapsed' => true]]));
check($stale instanceof WP_Error && $stale->data['status'] === 409, 'Stale tab cannot overwrite state');
$second = $routes->mutate(new WP_REST_Request(['revision' => 1, 'action' => ['type' => 'collapse-sidebar', 'collapsed' => true]]));
check($second instanceof WP_REST_Response && $second->data['sidebarCollapsed'], 'Compare and swap persists updated preference');
$GLOBALS['user'] = 2;
check($routes->read()->data['projects'] === [], 'Other user cannot see first user groups');
$routes->mutate(new WP_REST_Request(['revision' => 0, 'action' => ['type' => 'create-project', 'id' => 'personal', 'name' => 'Other user']]));
$GLOBALS['user'] = 1;
check($routes->read()->data['projects'][0]['name'] === 'Personal', 'Other user writes cannot change first user organization');
check($routes->read()->headers['Cache-Control'] === 'no-store', 'Private state not cached by proxies');
echo "workspace-organization: $checks checks passed\n";
