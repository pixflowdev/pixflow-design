<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Projects {
    final class ProjectRepository { public function find_by_uuid(string $id): ?array { return $GLOBALS['projects'][$id] ?? null; } }
    final class ProjectPermission { public function can_edit(array $project): bool { return ($project['ownerUserId'] ?? 0) === get_current_user_id() && empty($GLOBALS['deny_project']); } }
    final class ProjectFileService { public function list(string $id): array|\WP_Error { return isset($GLOBALS['files'][$id]) ? ['files' => $GLOBALS['files'][$id]] : new \WP_Error('forbidden', 'Denied', ['status' => 403]); } }
}
namespace PixflowDesign\WordPress\Modules { final class WorkspaceAccess { public static function available(): bool { return $GLOBALS['pro']; } } }
namespace PixflowDesign\WordPress\Admin\Gutenberg { final class GutenbergEntity { public static function validate(array $entity): array { if ($entity !== ['type' => 'page', 'id' => '42']) throw new \RuntimeException('Wrong entity'); return $entity; } } }
namespace PixflowDesign\WordPress\Pages {
    final class BuilderDestinations {
        public function destination(string $builder, int $id): array|\WP_Error { if ($id !== 42 || !empty($GLOBALS['deny_page']) || ($builder !== 'gutenberg' && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active($builder))) return new \WP_Error('forbidden', 'Unavailable', ['status' => 403]); return ['postId' => $id, 'title' => 'Existing draft', 'status' => 'draft', 'builder' => $builder, 'editorUrl' => 'https://example.test/?page_id=42&builder=' . $builder]; }
        public function listing(mixed $builder = null, mixed $search = null): array|\WP_Error { $destination = $this->destination($builder ?? 'gutenberg', 42); return $destination instanceof \WP_Error ? $destination : ['builders' => [['id' => 'gutenberg', 'available' => true]], 'pages' => [$destination], 'hasMore' => false]; }
        public function mutate(array $body): array|\WP_Error { $GLOBALS['destination_calls'][] = $body; if (!empty($GLOBALS['destination_failure'])) return new \WP_Error('failed', 'Destination failed', ['status' => $GLOBALS['destination_failure']]); return ['destination' => $this->destination($body['builder'], $body['postId'] ?? 42), 'created' => $body['action'] === 'create', 'reused' => false]; }
    }
}
namespace {
    define('ABSPATH', __DIR__);
    require __DIR__ . '/../src/Modules/BuilderIntegrations.php';
    require __DIR__ . '/../src/Pages/AtomicDestinationStore.php';
    require __DIR__ . '/../src/Pages/BuilderHandoffs.php';
    require __DIR__ . '/../src/Admin/DirectCanvasRelay.php';
    require __DIR__ . '/../src/Assets/AssetRegistrar.php';
    use PixflowDesign\WordPress\Pages\BuilderHandoffs;
    use PixflowDesign\WordPress\Modules\BuilderIntegrations;
    class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} public function get_error_data(): array { return $this->data; } }
    $GLOBALS['user'] = 1; $GLOBALS['blog'] = 1; $GLOBALS['pro'] = true; $GLOBALS['options'] = []; $GLOBALS['deny_page'] = false;
    $GLOBALS['projects'] = ['project-1' => ['ownerUserId' => 1, 'status' => 'draft', 'metadata' => ['odState' => ['conversations' => [['id' => 'chat-1']], 'messages' => ['chat-1' => [['role' => 'user', 'text' => 'Keep this']]]]]]];
    $GLOBALS['files'] = ['project-1' => [['name' => 'reference.png']], 'project-2' => [['name' => 'shared.png']]];
    $GLOBALS['wpdb'] = new class {
        public string $options = 'wp_options';
        public function prepare(string $sql, mixed ...$args): array { return [$sql, $args]; }
        public function esc_like(string $value): string { return addcslashes($value, '_%\\'); }
        public function query(array $query): int { [$sql, [$key, $value]] = $query; if (str_starts_with($sql, 'DELETE')) { if (serialize($GLOBALS['options'][$key] ?? null) !== $value) return 0; unset($GLOBALS['options'][$key]); return 1; } if (isset($GLOBALS['options'][$key])) return 0; $GLOBALS['options'][$key] = unserialize($value); return 1; }
        public function update(string $table, array $data, array $where, array $formats, array $where_formats): int {
            if (isset($GLOBALS['before_cas'])) { $callback = $GLOBALS['before_cas']; unset($GLOBALS['before_cas']); $callback(); }
            $key = $where['option_name']; if (serialize($GLOBALS['options'][$key] ?? null) !== $where['option_value']) return 0;
            $GLOBALS['options'][$key] = unserialize($data['option_value']); return 1;
        }
        public function get_var(array $query): ?string { $prefix = rtrim(stripslashes($query[1][0]), '%'); foreach (array_reverse(array_keys($GLOBALS['options'])) as $key) if (str_starts_with($key, $prefix)) return $key; return null; }
    };
    function get_current_user_id(): int { return $GLOBALS['user']; }
    function get_current_blog_id(): int { return $GLOBALS['blog']; }
    function current_user_can(string $cap, int $id = 0): bool { return !$GLOBALS['deny_page']; }
    function get_option(string $key, mixed $fallback = false): mixed { return $GLOBALS['options'][$key] ?? $fallback; }
    function maybe_serialize(mixed $value): string { return serialize($value); }
    function wp_cache_delete(string $key, string $group): void {}
    function wp_json_encode(mixed $value): string { return json_encode($value); }
    function sanitize_text_field(string $value): string { return trim(strip_tags($value)); }
    function add_query_arg(array $args, string $url): string { return $url . '&' . http_build_query($args); }
    $checks = 0;
    function check(bool $value, string $message): void { global $checks; $checks++; if (!$value) throw new \RuntimeException($message); }
    function rejected(mixed $value, int $status): bool { return $value instanceof WP_Error && $value->data['status'] === $status; }
    function seed_canvas(string $builder, string $id, int $post = 42, int $seen = 0): void { $key = $builder === 'bricks' ? 'pixflow_canvas_' : 'pixflow_' . $builder . '_canvas_'; $GLOBALS['options'][$key . $id] = ['userId' => 1, 'blogId' => 1, 'postId' => $post, 'seenAt' => $seen ?: time()] + ($builder === 'gutenberg' ? ['entity' => ['type' => 'page', 'id' => (string) $post]] : []); }
    BuilderIntegrations::add('bricks', ['active' => static fn(): bool => $GLOBALS['pro']]);
    foreach (['etch', 'elementor'] as $builder) BuilderIntegrations::add($builder, ['active' => static fn(): bool => $GLOBALS['pro'] && empty($GLOBALS['inactive'][$builder])]);
    $service = new BuilderHandoffs();
    $source_before = serialize([$GLOBALS['projects'], $GLOBALS['files']]);
    $body = ['action' => 'prepare', 'requestId' => 'handoff-request-0001', 'projectId' => 'project-1', 'conversationId' => 'chat-1', 'builder' => 'gutenberg', 'postId' => 42, 'targetTabId' => 'launch-tab-1', 'brief' => "Build the approved page.\nKeep the existing content.", 'assets' => [['projectId' => 'project-1', 'path' => 'reference.png', 'name' => 'Approved reference', 'mime' => 'image/png']]];
    check($service->lookup(null, 'project-1', 'chat-1') === ['handoff' => null], 'No receipt is explicit null');
    $prepared = $service->mutate($body); check(is_array($prepared) && !$prepared['reused'], 'Prepare durable brief'); $receipt = $prepared['handoff']; $id = $receipt['id'];
    check($receipt['status'] === 'ready' && $receipt['createdAt'] > 1000000000000, 'Ready status and millisecond times');
    check(str_contains($receipt['editorUrl'], 'pixflow_handoff=' . $id) && str_contains($receipt['editorUrl'], 'pixflow_handoff_tab=launch-tab-1'), 'Trusted editor URL carries receipt and launch identity');
    check(!isset($receipt['ownerUserId'], $receipt['fingerprint']), 'Internal ownership and digest not exposed');
    $launch_query = ['pixflow_handoff' => $id, 'pixflow_handoff_tab' => 'launch-tab-1'];
    $bootstrap_before = serialize($GLOBALS['options']);
    check($service->bootstrap_identity($launch_query, 'gutenberg', 42) === ['id' => $id, 'tabId' => 'launch-tab-1', 'postId' => 42], 'Bootstrap retains only receipt identity and exact page before Gutenberg strips URL');
    $assets = (new \ReflectionClass(\PixflowDesign\WordPress\Assets\AssetRegistrar::class))->newInstanceWithoutConstructor();
    $bootstrap = new \ReflectionMethod($assets, 'builder_handoff_bootstrap');
    $gutenberg_context = ['screen' => ['verified' => true, 'base' => 'post'], 'object' => ['verified' => true, 'kind' => 'post', 'type' => 'page', 'id' => 42]];
    $_GET = [...$launch_query, 'action' => 'edit'];
    check($bootstrap->invoke($assets, $gutenberg_context) === ['id' => $id, 'tabId' => 'launch-tab-1', 'postId' => 42], 'Gutenberg verified page bootstrap remains supported');
    $_GET = $launch_query;
    check($bootstrap->invoke($assets, $gutenberg_context) === null, 'Gutenberg bootstrap requires native edit action');
    $_GET = [];
    check($service->bootstrap_identity([], 'gutenberg', 42) === null, 'A subsequent ordinary page load cannot replay a stored handoff');
    check($service->bootstrap_identity($launch_query, 'gutenberg', 43) === null, 'Different page cannot inherit launch identity');
    check($service->bootstrap_identity($launch_query, 'bricks', 42) === null, 'Different builder cannot inherit launch identity');
    check($service->bootstrap_identity([...$launch_query, 'pixflow_handoff_tab' => 'other-tab'], 'gutenberg', 42) === null, 'Bootstrap rejects mismatched launch token');
    check($service->bootstrap_identity([...$launch_query, 'pixflow_handoff' => [$id]], 'gutenberg', 42) === null, 'Malformed receipt query is ignored safely');
    $GLOBALS['user'] = 2; check($service->bootstrap_identity($launch_query, 'gutenberg', 42) === null, 'Bootstrap rejects other user'); $GLOBALS['user'] = 1;
    $GLOBALS['blog'] = 2; check($service->bootstrap_identity($launch_query, 'gutenberg', 42) === null, 'Bootstrap rejects other site'); $GLOBALS['blog'] = 1;
    $GLOBALS['deny_page'] = true; check($service->bootstrap_identity($launch_query, 'gutenberg', 42) === null, 'Bootstrap requires edit permission'); $GLOBALS['deny_page'] = false;
    check(serialize($GLOBALS['options']) === $bootstrap_before, 'Bootstrap does not claim, mutate, or expose brief/assets');
    check($service->mutate($body)['reused'], 'Lost prepare response safely retries');
    check(rejected($service->mutate([...$body, 'brief' => 'Changed']), 409), 'Same request cannot change approved brief');
    check($service->lookup(null, 'project-1', 'chat-1')['handoff']['id'] === $id, 'Latest lookup recovers after reload');
    foreach ([['brief' => ''], ['brief' => str_repeat('a', 65537)], ['targetTabId' => 'bad/token'], ['assets' => array_fill(0, 21, $body['assets'][0])], ['assets' => [['projectId' => 'project-1', 'path' => '../../secret', 'name' => 'secret']]], ['assets' => [['projectId' => 'private-project', 'path' => 'secret', 'name' => 'secret']]], ['conversationId' => 'missing']] as $invalid) check($service->mutate([...$body, 'requestId' => 'validation-request-0001', ...$invalid]) instanceof WP_Error, 'Invalid/missing/unauthorized brief input rejected');
    $shared_body = [...$body, 'requestId' => 'shared-assets-request-01', 'assets' => [['projectId' => 'project-2', 'path' => 'shared.png', 'name' => 'Shared reference']]];
    check(rejected($service->mutate($shared_body), 409), 'A different request cannot prepare a second active handoff');
    check($service->lookup(null, 'project-1', 'chat-1')['handoff']['id'] === $id, 'Competing prepare preserves original discoverable receipt');
    $GLOBALS['user'] = 2; check(rejected($service->lookup($id), 404), 'Other user cannot read receipt'); $GLOBALS['user'] = 1;
    $GLOBALS['blog'] = 2; check(rejected($service->lookup($id), 404), 'Other site cannot read receipt'); $GLOBALS['blog'] = 1;
    $canvas = str_repeat('a', 32); seed_canvas('gutenberg', $canvas);
    $claim = ['action' => 'claim', 'id' => $id, 'tabId' => 'launch-tab-1', 'editorTarget' => ['builder' => 'gutenberg', 'canvasId' => $canvas, 'postId' => 42, 'entity' => ['type' => 'page', 'id' => '42']]];
    check(rejected($service->mutate([...$claim, 'tabId' => 'other-tab']), 409), 'Wrong launch tab cannot claim');
    check(rejected($service->mutate([...$claim, 'editorTarget' => [...$claim['editorTarget'], 'postId' => 43]]), 409), 'Wrong destination cannot claim');
    check(rejected($service->mutate([...$claim, 'editorTarget' => [...$claim['editorTarget'], 'entity' => ['type' => 'wp_template', 'id' => 'theme//home']]]), 409), 'Site Editor entity cannot substitute for page');
    seed_canvas('gutenberg', $canvas, 42, time() - 60); check(rejected($service->mutate($claim), 409), 'Disconnected canvas cannot claim'); seed_canvas('gutenberg', $canvas);
    $GLOBALS['pro'] = false; check(rejected($service->mutate($claim), 403), 'Expired Pro cannot claim Gutenberg handoff'); check(rejected($service->mutate([...$body, 'requestId' => 'expired-prepare-0001']), 403), 'Expired Pro cannot prepare'); check(is_array($service->lookup($id)), 'Existing receipt remains readable after expiry'); $GLOBALS['pro'] = true;
    $GLOBALS['deny_page'] = true; check(rejected($service->mutate($claim), 403), 'Revoked page access prevents claim'); $GLOBALS['deny_page'] = false;
    unset($GLOBALS['files']['project-1']); check(rejected($service->mutate($claim), 403), 'Revoked asset access prevents claim'); $GLOBALS['files']['project-1'] = [['name' => 'reference.png']];
    $first = $service->mutate($claim); check($first['shouldStart'] && $first['handoff']['status'] === 'claimed', 'Exactly first claim permits send');
    check($service->mutate($claim)['shouldStart'] === false, 'Reload or duplicate claim never resends');
    seed_canvas('gutenberg', $canvas, 42, time() - 60);
    $reconciled = $service->mutate($claim);
    check(is_array($reconciled) && $reconciled['shouldStart'] === false, 'Claimed receipt is reconciled without requiring a fresh heartbeat');
    seed_canvas('gutenberg', $canvas);
    $other_canvas = str_repeat('b', 32); seed_canvas('gutenberg', $other_canvas); check(rejected($service->mutate([...$claim, 'editorTarget' => [...$claim['editorTarget'], 'canvasId' => $other_canvas]]), 409), 'Another canvas cannot take over claimed launch');
    check(rejected($service->mutate(['action' => 'cancel', 'id' => $id]), 409), 'Claim cannot be cancelled into a resend');
    check(rejected($service->mutate(['action' => 'fail', 'id' => $id, 'error' => 'Uncertain']), 409), 'Uncertain claim cannot be reset');
    $ack = ['action' => 'ack', 'id' => $id, 'tabId' => 'launch-tab-1', 'messageId' => $receipt['messageId'], 'runId' => 'run-123'];
    check(rejected($service->mutate([...$ack, 'messageId' => 'wrong']), 409), 'Acknowledgement requires exact message');
    $GLOBALS['pro'] = false; check($service->mutate($ack)['handoff']['status'] === 'accepted', 'Already-dispatched acceptance can be recorded after expiry'); $GLOBALS['pro'] = true;
    check($service->mutate($ack)['handoff']['runId'] === 'run-123', 'Repeated acknowledgement idempotent');
    check(rejected($service->mutate([...$ack, 'runId' => 'different-run']), 409), 'Cannot replace accepted run');
    $finish = [...$ack, 'action' => 'finish', 'outcome' => 'completed'];
    check($service->mutate($finish)['handoff']['status'] === 'completed', 'Completion persisted');
    check($service->mutate($claim)['shouldStart'] === false, 'Completed handoff never resends');
    $GLOBALS['pro'] = false;
    check($service->mutate([...$claim, 'editorTarget' => [...$claim['editorTarget'], 'canvasId' => str_repeat('c', 32)]])['shouldStart'] === false, 'Completed receipt reopens without an old live canvas or active entitlement');
    check(rejected($service->mutate([...$claim, 'tabId' => 'wrong-launch-tab']), 409), 'Terminal receipt still requires its matching launch identity');
    $GLOBALS['pro'] = true;
    check(rejected($service->mutate([...$finish, 'outcome' => 'failed']), 409), 'Terminal outcome immutable');
    $shared = $service->mutate($shared_body); check(is_array($shared), 'Read-accessible assets from another project are supported after prior handoff finishes');
    check($service->mutate($body)['reused'], 'Old prepare remains idempotent after new handoff');
    check($service->lookup(null, 'project-1', 'chat-1')['handoff']['id'] === $shared['handoff']['id'], 'Old retry cannot replace active pointer');
    $service->mutate(['action' => 'cancel', 'id' => $shared['handoff']['id']]);
    $expired = $service->mutate([...$body, 'requestId' => 'expired-ready-request-01'])['handoff']; $GLOBALS['options']['_pixflow_handoff_' . $expired['id']]['expiresAt'] = 1;
    check(rejected($service->mutate([...$claim, 'id' => $expired['id']]), 410), 'Expired unsent brief cannot execute');
    $expired_status = $service->lookup($expired['id'])['handoff'];
    check($expired_status['status'] === 'failed' && str_contains($expired_status['error'], 'expired before it started'), 'Reading expired ready receipt records actionable terminal failure');
    check($service->lookup(null, 'project-1', 'chat-1')['handoff']['status'] === 'failed', 'Latest lookup also returns terminal expiry');
    check($service->mutate([...$claim, 'id' => $expired['id']])['shouldStart'] === false, 'Failed expiry cannot dispatch');
    $expiry_race = $service->mutate([...$body, 'requestId' => 'expiry-race-request-01'])['handoff']; $expiry_key = '_pixflow_handoff_' . $expiry_race['id']; $GLOBALS['options'][$expiry_key]['expiresAt'] = 1;
    $GLOBALS['before_cas'] = static function () use ($expiry_key, $claim): void { $GLOBALS['options'][$expiry_key]['status'] = 'claimed'; $GLOBALS['options'][$expiry_key]['editorTarget'] = $claim['editorTarget']; };
    check($service->lookup($expiry_race['id'])['handoff']['status'] === 'claimed', 'Expiry CAS cannot overwrite a racing accepted claim');
    check($service->lookup($expiry_race['id'])['handoff']['status'] === 'claimed', 'Claimed receipt remains sticky after expiry');
    $GLOBALS['options'][$expiry_key]['status'] = 'accepted';
    check($service->lookup($expiry_race['id'])['handoff']['status'] === 'accepted', 'Accepted receipt never expires back to retry');
    check(rejected($service->mutate([...$body, 'requestId' => 'blocked-by-accepted-01']), 409), 'Expired accepted receipt still blocks another dispatch');
    $service->mutate([...$finish, 'id' => $expiry_race['id'], 'messageId' => $expiry_race['messageId']]);
    $cancel = $service->mutate([...$body, 'requestId' => 'cancel-ready-request-01'])['handoff']; check($service->mutate(['action' => 'cancel', 'id' => $cancel['id']])['handoff']['status'] === 'cancelled', 'Unsent brief can cancel');
    check($service->mutate([...$claim, 'id' => $cancel['id']])['shouldStart'] === false, 'Cancelled brief cannot start');
    $race = $service->mutate([...$body, 'requestId' => 'race-request-0001'])['handoff']; $race_claim = [...$claim, 'id' => $race['id']];
    $GLOBALS['before_cas'] = static function () use ($service, $race_claim): void { check($service->mutate($race_claim)['shouldStart'], 'Racing first CAS wins'); };
    check(rejected($service->mutate($race_claim), 409), 'Concurrent loser cannot also start');
    check($service->mutate($race_claim)['shouldStart'] === false, 'Concurrent loser observes sticky claim');
    $service->mutate([...$finish, 'id' => $race['id'], 'messageId' => $race['messageId']]);
    seed_canvas('bricks', $canvas); $bricks = $service->mutate([...$body, 'builder' => 'bricks', 'requestId' => 'bricks-request-0001'])['handoff'];
    check($service->mutate([...$claim, 'id' => $bricks['id'], 'editorTarget' => ['builder' => 'bricks', 'postId' => 42, 'canvasId' => $canvas]])['shouldStart'], 'Bricks uses same guarded claim protocol');
    $awaiting = [...$finish, 'id' => $bricks['id'], 'messageId' => $bricks['messageId'], 'outcome' => 'awaiting_input'];
    check($service->mutate($awaiting)['handoff']['status'] === 'awaiting_input', 'Agent question persists as awaiting input, not completed');
    check($service->mutate([...$claim, 'id' => $bricks['id'], 'editorTarget' => ['builder' => 'bricks', 'postId' => 42, 'canvasId' => $canvas]])['shouldStart'] === false, 'Awaiting input never repeats initial send');
    $new_body = [...$body, 'requestId' => 'new-after-awaiting-01'];
    $new = $service->mutate($new_body)['handoff'];
    check($new['status'] === 'ready', 'Explicit new handoff after terminal initial turn is permitted');
    check($service->mutate([...$awaiting, 'outcome' => 'completed'])['handoff']['status'] === 'completed', 'Late follow-up may complete awaiting handoff');
    check($service->lookup(null, 'project-1', 'chat-1')['handoff']['id'] === $new['id'], 'Late completion cannot release or replace new active slot');
    $service->mutate(['action' => 'cancel', 'id' => $new['id']]);
    $competitor_body = [...$body, 'requestId' => 'competing-slot-winner-01'];
    $GLOBALS['before_cas'] = static function () use ($service, $competitor_body): void { $GLOBALS['slot_winner'] = $service->mutate($competitor_body)['handoff']; };
    check(rejected($service->mutate([...$body, 'requestId' => 'competing-slot-loser-01']), 409), 'Simultaneous different requests cannot acquire the same terminal slot');
    check($service->lookup(null, 'project-1', 'chat-1')['handoff']['id'] === $GLOBALS['slot_winner']['id'], 'Latest status remains the CAS winner');
    $service->mutate(['action' => 'cancel', 'id' => $GLOBALS['slot_winner']['id']]);
    foreach (['etch', 'elementor'] as $builder) {
        $prepared_native = $service->mutate([...$body, 'builder' => $builder, 'requestId' => $builder . '-handoff-request-01']);
        check(is_array($prepared_native), "$builder can prepare its immutable handoff");
        $native = $prepared_native['handoff'];
        $query = ['pixflow_handoff' => $native['id'], 'pixflow_handoff_tab' => 'launch-tab-1'];
        $identity = ['id' => $native['id'], 'tabId' => 'launch-tab-1', 'postId' => 42];
        check($service->bootstrap_identity($query, $builder, 42) === $identity, "$builder preserves request-only launch identity");
        check($service->bootstrap_identity($query, $builder, 43) === null, "$builder bootstrap rejects another page");
        check($service->bootstrap_identity($query, 'gutenberg', 42) === null, "$builder bootstrap cannot cross editor boundaries");
        $assets = (new \ReflectionClass(\PixflowDesign\WordPress\Assets\AssetRegistrar::class))->newInstanceWithoutConstructor();
        $bootstrap = new \ReflectionMethod($assets, 'builder_handoff_bootstrap');
        $context = ['editor' => $builder, 'screen' => ['verified' => true, 'isBuilder' => true, 'base' => $builder], 'object' => ['verified' => true, 'kind' => 'post', 'type' => 'page', 'id' => 42]];
        $_GET = $query;
        check($bootstrap->invoke($assets, $context) === $identity, "$builder uses native verified context even without Gutenberg action query");
        if ($builder === 'elementor') {
            $_GET = [...$query, 'action' => 'elementor'];
            check($bootstrap->invoke($assets, [...$context, 'screen' => [...$context['screen'], 'base' => 'post']]) === $identity, 'Elementor native enqueue may retain the underlying WordPress post screen');
            $_GET = $query;
            check($bootstrap->invoke($assets, [...$context, 'screen' => [...$context['screen'], 'base' => 'post']]) === null, 'Generic post screen without Elementor action cannot bootstrap native launch');
        }
        check($bootstrap->invoke($assets, [...$context, 'editor' => 'gutenberg']) === null, "$builder mismatched native editor is rejected");
        check($bootstrap->invoke($assets, [...$context, 'screen' => [...$context['screen'], 'verified' => false]]) === null, "$builder unverified screen is rejected");
        check($bootstrap->invoke($assets, [...$context, 'screen' => [...$context['screen'], 'isBuilder' => false]]) === null, "$builder ordinary admin screen is rejected");
        check($bootstrap->invoke($assets, [...$context, 'object' => [...$context['object'], 'verified' => false]]) === null, "$builder unverified object is rejected");
        check($bootstrap->invoke($assets, [...$context, 'object' => [...$context['object'], 'id' => 43]]) === null, "$builder wrong context page is rejected");
        check($bootstrap->invoke($assets, [...$context, 'object' => [...$context['object'], 'type' => 'post']]) === null, "$builder non-page document is rejected");
        $_GET = []; check($bootstrap->invoke($assets, $context) === null, "$builder ordinary reload cannot recover launch identity from settings"); $_GET = $query;
        $GLOBALS['inactive'][$builder] = true;
        check($bootstrap->invoke($assets, $context) === null, "$builder disabled integration cannot bootstrap");
        $GLOBALS['inactive'][$builder] = false;
        $native_target = ['builder' => $builder, 'postId' => 42, 'canvasId' => $canvas];
        $native_claim = [...$claim, 'id' => $native['id'], 'editorTarget' => $native_target];
        seed_canvas($builder, $canvas, 42, time() - 60);
        check(rejected($service->mutate($native_claim), 409), "$builder disconnected editor cannot claim");
        seed_canvas($builder, $canvas);
        check(rejected($service->mutate([...$native_claim, 'editorTarget' => [...$native_target, 'entity' => ['type' => 'page', 'id' => '42']]]), 409), "$builder cannot substitute a Gutenberg entity");
        $GLOBALS['pro'] = false; check(rejected($service->mutate($native_claim), 403), "$builder requires Pro at dispatch"); $GLOBALS['pro'] = true;
        $GLOBALS['user'] = 2; check(rejected($service->mutate($native_claim), 404), "$builder receipt remains owner-only"); $GLOBALS['user'] = 1;
        $GLOBALS['blog'] = 2; check(rejected($service->mutate($native_claim), 404), "$builder receipt remains site-scoped"); $GLOBALS['blog'] = 1;
        $GLOBALS['deny_page'] = true; check(rejected($service->mutate($native_claim), 403), "$builder revoked page permission prevents dispatch"); $GLOBALS['deny_page'] = false;
        check(rejected($service->mutate([...$native_claim, 'tabId' => 'another-tab']), 409), "$builder launch identity stays pinned");
        check($service->mutate($native_claim)['shouldStart'], "$builder first claim starts exactly once");
        check($service->mutate($native_claim)['shouldStart'] === false, "$builder duplicate or reload does not repeat dispatch");
        seed_canvas($builder, $other_canvas);
        check(rejected($service->mutate([...$native_claim, 'editorTarget' => [...$native_target, 'canvasId' => $other_canvas]]), 409), "$builder competing tab cannot take over");
        $native_ack = [...$ack, 'id' => $native['id'], 'messageId' => $native['messageId']];
        check($service->mutate($native_ack)['handoff']['status'] === 'accepted', "$builder acceptance persists");
        check($service->mutate([...$native_ack, 'action' => 'finish', 'outcome' => 'completed'])['handoff']['status'] === 'completed', "$builder completion persists");
        check($service->mutate($native_claim)['shouldStart'] === false, "$builder completed receipt never restarts");
    }
    foreach (['text/markdown; charset=utf-8' => 'text/markdown', 'Text/Plain; charset="UTF-8"' => 'text/plain', 'image/svg+xml; profile="a;b"' => 'image/svg+xml'] as $mime => $normalized) {
        $mime_request = [...$body, 'requestId' => 'mime-request-' . substr(hash('sha256', $mime), 0, 16), 'assets' => [[...$body['assets'][0], 'mime' => $mime]]];
        $prepared_mime = $service->mutate($mime_request);
        check(is_array($prepared_mime), 'Legitimate MIME parameters must not block automatic handoff');
        check($prepared_mime['handoff']['assets'][0]['mime'] === $normalized, 'Asset receipt stores normalized bare MIME');
        check($service->mutate([...$mime_request, 'assets' => [[...$body['assets'][0], 'mime' => $normalized]]])['reused'], 'Equivalent MIME retries retain the same immutable receipt');
        $service->mutate(['action' => 'cancel', 'id' => $prepared_mime['handoff']['id']]);
    }
    foreach (["text/markdown\r\nX-Test: injected", 'text/markdown; broken', 'text/markdown; charset=', 'text/markdown; charset="unfinished', 'text/markdown; charset="ok" trailing', 'text/<script>; charset=utf-8', 'text/plain/extra', ['text/plain'], str_repeat('a', 151)] as $mime) {
        check(rejected($service->mutate([...$body, 'requestId' => 'invalid-mime-request-01', 'assets' => [[...$body['assets'][0], 'mime' => $mime]]]), 400), 'Malformed MIME and header injection remain rejected');
    }
    check([$GLOBALS['projects'], $GLOBALS['files']] == unserialize($source_before), 'Original chats, messages, assets and settings preserved');

    $source = ['projectId' => 'project-1', 'conversationId' => 'chat-1', 'requestId' => 'user-message-00000001'];
    $agent_body = ['action' => 'create', 'builder' => 'gutenberg', 'title' => 'Fern courtyard', 'brief' => 'Build a garden page using the approved brief.', 'assets' => $body['assets']];
    $unknown = $service->agent_prepare($source, [...$agent_body, 'status' => 'draft']);
    check($unknown instanceof WP_Error && str_contains($unknown->message, 'Unsupported handoff arguments: status') && str_contains($unknown->message, 'Allowed arguments:'), 'Rejected model arguments identify the invalid fields and accepted shape');
    check($service->workspace_source($source) === $source, 'Source validated without changing its identity');
    foreach ([['conversationId' => 'unknown-chat'], ['requestId' => 'short'], ['extra' => 'model override']] as $invalid) check(rejected($service->workspace_source([...$source, ...$invalid]), isset($invalid['conversationId']) ? 404 : 400), 'Invalid source identity refused');
    $GLOBALS['pro'] = false; check(rejected($service->agent_prepare($source, $agent_body), 403), 'Free cannot invoke Workspace handoff tool'); $GLOBALS['pro'] = true;
    $GLOBALS['user'] = 2; check(rejected($service->agent_prepare($source, $agent_body), 404), 'Foreign user cannot prepare source'); $GLOBALS['user'] = 1;
    foreach ([['projectId' => 'project-2'], ['targetTabId' => 'arbitrary'], ['requestId' => 'model-generated-0001'], ['brief' => ''], ['title' => '']] as $invalid) check(rejected($service->agent_prepare($source, [...$agent_body, ...$invalid]), 400), 'Tool cannot replace trusted source or prepare incomplete brief');
    $GLOBALS['destination_calls'] = [];
    $agent = $service->agent_prepare($source, $agent_body);
    check(is_array($agent) && $agent['handoff']['origin'] === 'agent' && $agent['handoff']['sourceRequestId'] === $source['requestId'], 'Agent receipt records trusted source message');
    check(str_contains($agent['handoff']['brief'], 'Build in the selected live editor.') && str_contains($agent['handoff']['brief'], 'do not publish'), 'Host appends live-editor and publication preservation rules');
    check(str_contains($agent['handoff']['brief'], 'Save completed edits through the native editor') && str_contains($agent['handoff']['brief'], 'verify the save succeeded'), 'Automatic handoff requires persisted completion rather than an unsaved canvas');
    check(str_starts_with($agent['handoff']['brief'], 'The handoff has already opened the destination page ' . $agent['handoff']['destination']['postId']) && str_contains($agent['handoff']['brief'], 'do not create another page'), 'Destination identity precedes the brief and prevents interpreting it as another creation request');
    check(count($GLOBALS['destination_calls']) === 1 && $GLOBALS['destination_calls'][0]['action'] === 'create' && !isset($GLOBALS['destination_calls'][0]['content']), 'Agent path creates only empty draft through existing service');
    check($service->agent_prepare($source, $agent_body)['reused'] === true && count($GLOBALS['destination_calls']) === 1, 'Repeated tool response cannot create another draft or receipt');
    require_once __DIR__ . '/../src/autoload.php';
    require __DIR__ . '/../src/Admin/DirectSiteWorkspace.php';
    $agent_tool_result = (new \PixflowDesign\WordPress\Admin\DirectSiteWorkspace($source))->call('builder.handoff', $agent_body, true);
    check(str_contains($agent_tool_result['reportingGuidance'] ?? '', 'No page layout has been built by this operation'), 'Agent tool explicitly distinguishes draft preparation from a built page');
    check(rejected($service->agent_prepare($source, [...$agent_body, 'brief' => 'Different brief']), 409), 'Changed same-message request cannot replace immutable intent');
    check(rejected($service->agent_prepare([...$source, 'requestId' => 'user-message-00000002'], $agent_body), 409) && count($GLOBALS['destination_calls']) === 1, 'Competing source request cannot create an orphan draft');
    $service->mutate(['action' => 'cancel', 'id' => $agent['handoff']['id']]);
    check($service->agent_prepare($source, $agent_body)['handoff']['status'] === 'cancelled', 'Terminal retry does not restart the handoff');
    $opened_agent = $service->agent_prepare([...$source, 'requestId' => 'user-message-00000003'], ['action' => 'open', 'builder' => 'etch', 'postId' => 42, 'brief' => 'Change only the headline.']);
    check(is_array($opened_agent) && end($GLOBALS['destination_calls']) === ['action' => 'open', 'builder' => 'etch', 'postId' => 42], 'Existing-page handoff delegates read-only destination opening');

    $bound_tools = new \PixflowDesign\WordPress\Admin\DirectSiteWorkspace($source);
    check($bound_tools->call('builder.handoff.status', [], true)['handoff']['id'] === $opened_agent['handoff']['id'], 'Tool status uses its bound source chat');
    check(count($bound_tools->call('builder.destinations', ['builder' => 'gutenberg', 'search' => 'Fern'], false)['pages']) === 1, 'Destination discovery remains read-only');
    foreach ([fn() => (new \PixflowDesign\WordPress\Admin\DirectSiteWorkspace())->call('builder.handoff', $agent_body, true), fn() => $bound_tools->call('builder.handoff', $agent_body, false), fn() => $bound_tools->call('builder.handoff.status', ['projectId' => 'other'], true)] as $call) {
        $failed = false; try { $call(); } catch (\RuntimeException) { $failed = true; } check($failed, 'Tool source and writable boundaries enforced');
    }
    check([$GLOBALS['projects'], $GLOBALS['files']] == unserialize($source_before), 'Agent handoff preserves chats and project assets');
    $service->mutate(['action' => 'cancel', 'id' => $opened_agent['handoff']['id']]);
    $GLOBALS['destination_failure'] = 403;
    check(rejected($service->agent_prepare([...$source, 'requestId' => 'user-message-00000004'], $agent_body), 403), 'Definite creation denial returned');
    check($service->lookup(null, 'project-1', 'chat-1')['handoff']['id'] === $opened_agent['handoff']['id'], 'Definite failure restores previous chat receipt instead of stranding reservation');
    $GLOBALS['destination_failure'] = 0;
    $recovered = $service->agent_prepare([...$source, 'requestId' => 'user-message-00000005'], $agent_body);
    check(is_array($recovered), 'New source message can handoff after definite failure');
    $service->mutate(['action' => 'cancel', 'id' => $recovered['handoff']['id']]);
    $GLOBALS['destination_failure'] = 409;
    check(rejected($service->agent_prepare([...$source, 'requestId' => 'user-message-00000006'], $agent_body), 409), 'Uncertain creation remains reserved');
    check(rejected($service->agent_prepare([...$source, 'requestId' => 'user-message-00000007'], $agent_body), 409), 'New source cannot bypass uncertain creation');
    $GLOBALS['destination_failure'] = 0;
    check(is_array($service->agent_prepare([...$source, 'requestId' => 'user-message-00000006'], $agent_body)), 'Same uncertain source can recover original draft identity');
    $GLOBALS['projects']['project-1']['metadata']['odState']['conversations'][] = ['id' => 'fresh-chat'];
    $fresh_source = [...$source, 'conversationId' => 'fresh-chat', 'requestId' => 'fresh-user-message-001'];
    $GLOBALS['destination_failure'] = 403;
    check(rejected($service->agent_prepare($fresh_source, $agent_body), 403), 'First-ever denied handoff returns failure');
    check($service->lookup(null, 'project-1', 'fresh-chat') === ['handoff' => null], 'First-ever definite failure releases empty slot');
    $GLOBALS['destination_failure'] = 0;
    check(is_array($service->agent_prepare([...$fresh_source, 'requestId' => 'fresh-user-message-002'], $agent_body)), 'Fresh chat remains usable after creation denial');
    array_pop($GLOBALS['projects']['project-1']['metadata']['odState']['conversations']);
    echo "Builder handoffs: {$checks} checks passed.\n";
}
