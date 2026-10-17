<?php
declare(strict_types=1);

// Explicit opt-in real WordPress fixture. Never point this at customer tables.
$root = getenv('PIXFLOW_QA_WP_ROOT');
$prefix = getenv('PIXFLOW_QA_EXPECTED_PREFIX');
$pro = getenv('PIXFLOW_QA_PRO_ROOT');
if (!$root) { echo "Set PIXFLOW_QA_WP_ROOT, PIXFLOW_QA_EXPECTED_PREFIX and PIXFLOW_QA_PRO_ROOT for the isolated WordPress matrix.\n"; exit(0); }
if (!$root || !$prefix || !str_starts_with($prefix, 'qa_') || !$pro) throw new RuntimeException('Supply isolated WordPress root, qa_ table prefix and Pro artifact root.');
$config = file_get_contents(rtrim($root, '/\\') . '/wp-config.php');
if (!is_string($config) || !preg_match('/\$table_prefix\s*=\s*([\'"])([^\'"]+)\1\s*;/', $config, $match) || $match[2] !== $prefix) throw new RuntimeException('Refusing to bootstrap a WordPress config outside the requested qa_ table prefix.');
unset($config, $match);
define('WP_DISABLE_FATAL_ERROR_HANDLER', true);
if ($source = getenv('PIXFLOW_QA_CORE_SOURCE')) {
    // Optional source diagnostic; final artifact acceptance omits this variable.
    define('ABSPATH', rtrim($root, '/\\') . '/');
    require rtrim($source, '/\\') . '/src/autoload.php';
}
require rtrim($root, '/\\') . '/wp-load.php';
global $wpdb;
if ($wpdb->prefix !== $prefix) throw new RuntimeException('Refusing a WordPress table prefix outside the requested isolated fixture.');
require_once ABSPATH . 'wp-admin/includes/user.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once rtrim($pro, '/\\') . '/src/autoload.php';

use PixflowDesign\WordPress\Modules\FeatureContributions;

$checks = 0;
$states = [];
$authorization = [];
$posts = [];
$terms = [];
$media = [];
$sessions = [];
$canvases = [];
$commands = [];
$settingsBefore = get_option('blogdescription');
$suffix = bin2hex(random_bytes(5));
$sentinel = 'qa_admin_tools_' . $suffix;
$fileRelative = 'wp-content/uploads/' . $sentinel . '.txt';
$fileAbsolute = ABSPATH . $fileRelative;
$user = wp_insert_user(['user_login' => $sentinel, 'user_pass' => bin2hex(random_bytes(24)), 'role' => 'administrator', 'user_email' => $sentinel . '@example.invalid']);
if (is_wp_error($user)) throw new RuntimeException($user->get_error_message());
wp_set_current_user($user);
update_option($sentinel, 'original', false);
$allowed = false;
FeatureContributions::authorize_using(static function () use (&$allowed): bool { return $allowed; });

function qa_check(bool $ok, string $message): void {
    ++$GLOBALS['checks'];
    if (!$ok) throw new RuntimeException($message);
}
function qa_request(string $path, string $method = 'POST', ?array $body = null, ?string $token = null): WP_REST_Response {
    $request = new WP_REST_Request($method, '/pixflow-design/v1/wp-admin/direct/' . $path);
    if ($token !== null) $request->set_header('Authorization', 'Bearer ' . $token);
    if ($body !== null) { $request->set_header('Content-Type', 'application/json'); $request->set_body(wp_json_encode($body)); }
    return rest_do_request($request);
}
function qa_session(array $body = []): string {
    wp_set_current_user($GLOBALS['user']);
    $before = ['user'=>get_current_user_id(),'edit'=>current_user_can('edit_posts'),'manage'=>current_user_can('manage_options'),'roles'=>wp_get_current_user()->roles]; $response = qa_request('sessions', 'POST', $body);
    qa_check($response->get_status() === 200 && is_string($response->get_data()['token'] ?? null), 'Could not issue direct session: ' . $response->get_status() . ' ' . wp_json_encode($response->get_data()) . ' before=' . wp_json_encode($before));
    $token = $response->get_data()['token']; $GLOBALS['sessions'][] = $token;
    return $token;
}
function qa_tool(string $token, string $tool, array $args = [], bool $success = true): array {
    $response = qa_request('tools', 'POST', ['tool' => $tool, 'arguments' => $args], $token);
    $data = $response->get_data();
    qa_check($success ? $response->get_status() < 400 : $response->get_status() >= 400, $tool . ' unexpected HTTP ' . $response->get_status() . ': ' . wp_json_encode($data));
    if (isset($data['commandId'])) $GLOBALS['commands'][] = $data['commandId'];
    return $data;
}
function qa_upgrade(string $token, string $tool, array $args = []): array {
    $response = qa_request('tools', 'POST', ['tool' => $tool, 'arguments' => $args], $token);
    $data = $response->get_data();
    qa_check($response->get_status() === 200 && ($data['allowed'] ?? null) === false && ($data['code'] ?? '') === 'pro_required', $tool . ' must return an ordinary HTTP 200 Pro explanation: ' . wp_json_encode($data));
    qa_check(is_string($data['message'] ?? null) && $data['message'] !== '', 'Pro explanation has no user-facing message.');
    qa_check(($data['ok'] ?? null) !== false && is_string($data['guidance'] ?? null) && $data['guidance'] !== '', 'Unavailable Pro tools must remain a normal result with response guidance.');
    return $data;
}
function qa_typed_upgrade(string $id): void {
    foreach (['execute','approvals'] as $action) foreach (['capabilityId','capability_id'] as $field) {
        $request = new WP_REST_Request('POST', '/pixflow-design/v1/wp-admin/' . $action);
        $request->set_header('Content-Type', 'application/json');
        $request->set_body(wp_json_encode([$field => $id, 'surface' => 'wp_admin', 'sessionId' => 'cached-qa-session', 'mode' => 'design', 'arguments' => []]));
        $response = rest_do_request($request); $data = $response->get_data();
        qa_check($response->get_status() === 200 && ($data['allowed'] ?? null) === false && ($data['code'] ?? '') === 'pro_required', 'Cached typed capability must explain current Pro requirement: ' . $action . ' ' . $id . ' ' . wp_json_encode($data));
    }
}
function qa_typed_read(string $id): void {
    $request = new WP_REST_Request('POST', '/pixflow-design/v1/wp-admin/execute');
    $request->set_header('Content-Type', 'application/json');
    $request->set_body(wp_json_encode(['capabilityId'=>$id,'surface'=>'wp_admin','sessionId'=>'qa-typed-read','mode'=>'ask','arguments'=>[]]));
    $response = rest_do_request($request); $data = $response->get_data();
    qa_check($response->get_status() === 200 && ($data['operation']['status'] ?? '') === 'committed' && isset($data['result']), 'Active Pro typed read did not dispatch: ' . $id);
}
function qa_gutenberg(string $token, int $postId, bool $active): void {
    $response = qa_request('canvas', 'POST', ['builder'=>'gutenberg', 'action'=>'register', 'postId'=>$postId, 'hasCompletion'=>true]);
    $canvas = $response->get_data()['canvasId'] ?? '';
    qa_check($response->get_status() === 200 && $canvas !== '', 'Native Gutenberg test canvas registration failed.');
    $GLOBALS['canvases'][] = $canvas;
    $before = get_post_field('post_content', $postId);
    $base = ['canvasId'=>$canvas, 'expectedPostId'=>$postId];
    if (!$active) {
        foreach (['<script>window.qaMarker = true;</script>', '<?php echo "qa"; ?>', '<img src=x onerror="window.qaMarker=true">', '<a href="javascript:void(0)">QA</a>'] as $html) {
            qa_upgrade($token, 'gutenberg.insert', $base + ['blocks'=>[['name'=>'core/html','attributes'=>['content'=>$html]]]]);
            qa_upgrade($token, 'gutenberg.update', $base + ['clientId'=>'qa-not-a-real-block', 'attributes'=>['content'=>$html]]);
            qa_check(get_option('pixflow_gutenberg_canvas_' . $canvas . '_command') === false && get_post_field('post_content', $postId) === $before, 'Unavailable executable authoring queued or altered the document.');
        }
    } else {
        $pending = qa_tool($token, 'gutenberg.insert', $base + ['blocks'=>[['name'=>'core/html','attributes'=>['content'=>'<script>window.qaMarker = true;</script>']]]]);
        qa_check(($pending['pending'] ?? false) === true, 'Active Pro executable authoring was not admitted.');
        $GLOBALS['allowed'] = false;
        $poll = qa_request('canvas', 'POST', ['builder'=>'gutenberg','action'=>'poll','canvasId'=>$canvas,'postId'=>$postId]);
        qa_check(($poll->get_data()['command'] ?? null) === null, 'A queued executable command was claimed after Pro expiry.');
        qa_upgrade($token, 'gutenberg.result', ['commandId'=>$pending['commandId']]);
        qa_check(get_post_field('post_content', $postId) === $before, 'Queued expired authoring changed saved content.');
        $GLOBALS['allowed'] = true;
        qa_request('canvas', 'POST', ['builder'=>'gutenberg','action'=>'close','canvasId'=>$canvas]);
        $response = qa_request('canvas', 'POST', ['builder'=>'gutenberg', 'action'=>'register', 'postId'=>$postId]);
        $canvas = $response->get_data()['canvasId']; $GLOBALS['canvases'][] = $canvas; $base['canvasId'] = $canvas;
    }
    $safe = qa_tool($token, 'gutenberg.insert', $base + ['blocks'=>[['name'=>'core/paragraph','attributes'=>['content'=>'Native Gutenberg remains available.']]]]);
    qa_check(($safe['pending'] ?? false) === true, 'Safe native Gutenberg authoring was not admitted.');
    qa_request('canvas', 'POST', ['builder'=>'gutenberg','action'=>'close','canvasId'=>$canvas]);
    qa_check(get_post_field('post_content', $postId) === $before, 'Admission-only fixture unexpectedly changed saved content.');
}
function qa_native_roundtrip(string $token, string $state): void {
    global $suffix, $posts, $terms, $media;
    $created = qa_tool($token, 'wordpress.posts.create', ['postType' => $state === 'pro-unlicensed' ? 'page' : 'post', 'title' => 'QA ' . $state . ' ' . $suffix, 'content' => '<p>Native content remains available.</p>']);
    $id = (int) ($created['post']['id'] ?? $created['postId'] ?? $created['id'] ?? 0);
    qa_check($id > 0, 'Native post creation returned no post ID: ' . wp_json_encode($created)); $posts[] = $id;
    $read = qa_tool($token, 'wordpress.posts.get', ['postId' => $id]); $record = $read['post'] ?? $read;
    qa_check(get_post_status($id) === 'draft', 'Native create did not default to draft.');
    qa_tool($token, 'wordpress.posts.update', ['postId' => $id, 'expectedModifiedGmt' => $record['modifiedGmt'], 'fields' => ['title' => 'Updated ' . $state]]);
    qa_check(get_the_title($id) === 'Updated ' . $state, 'Native post update was not persisted.');
    qa_tool($token, 'wordpress.posts.update', ['postId' => $id, 'expectedModifiedGmt' => '1900-01-01 00:00:00', 'fields' => ['title' => 'stale write']], false);
    $read = qa_tool($token, 'wordpress.posts.get', ['postId' => $id]); $record = $read['post'] ?? $read;
    qa_tool($token, 'wordpress.posts.trash', ['postId' => $id, 'expectedModifiedGmt' => $record['modifiedGmt']]); qa_check(get_post_status($id) === 'trash', 'Native trash failed.');
    $read = qa_tool($token, 'wordpress.posts.get', ['postId' => $id]); $record = $read['post'] ?? $read;
    qa_tool($token, 'wordpress.posts.restore', ['postId' => $id, 'expectedModifiedGmt' => $record['modifiedGmt']]); qa_check(get_post_status($id) !== 'trash', 'Native restore failed.');
    $term = qa_tool($token, 'wordpress.terms.create', ['taxonomy' => 'category', 'name' => 'QA ' . $state . ' ' . $suffix]);
    $tid = (int) ($term['term']['termId'] ?? $term['term']['id'] ?? $term['termId'] ?? $term['id'] ?? 0); qa_check($tid > 0, 'Category creation returned no ID: ' . wp_json_encode($term)); $terms[] = $tid;
    $term = qa_tool($token, 'wordpress.terms.get', ['taxonomy' => 'category', 'termId' => $tid]);
    qa_tool($token, 'wordpress.terms.update', ['taxonomy' => 'category', 'termId' => $tid, 'expectedFingerprint' => $term['fingerprint'], 'fields' => ['description' => 'Native category edit']]);
    qa_check(get_term($tid, 'category')->description === 'Native category edit', 'Native category update failed.');
    qa_tool($token, 'wordpress.terms.list', ['taxonomy' => 'category']);
    $term = qa_tool($token, 'wordpress.terms.get', ['taxonomy' => 'category', 'termId' => $tid]);
    qa_tool($token, 'wordpress.terms.delete', ['taxonomy' => 'category', 'termId' => $tid, 'expectedFingerprint' => $term['fingerprint']]);
    qa_check(get_term($tid, 'category') === null, 'Native category deletion failed.');
    qa_tool($token, 'wordpress.media.list');
    // Fixture creation uses native WordPress media primitives; agent mutations
    // below still pass through the same production REST dispatcher as the UI.
    $upload = wp_upload_bits('qa-' . $state . '-' . $suffix . '.png', null, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='));
    qa_check(empty($upload['error']), 'Could not create isolated media fixture.');
    $attachment = wp_insert_attachment(['post_title' => 'QA media ' . $state, 'post_mime_type' => 'image/png', 'post_status' => 'inherit'], $upload['file']);
    qa_check(!is_wp_error($attachment) && $attachment > 0, 'Could not register media fixture.'); $media[] = $attachment;
    $item = qa_tool($token, 'wordpress.media.get', ['attachmentId' => $attachment]);
    qa_tool($token, 'wordpress.media.update', ['attachmentId' => $attachment, 'expectedFingerprint' => $item['fingerprint'], 'fields' => ['altText' => 'QA accessible image ' . $state]]);
    qa_check(get_post_meta($attachment, '_wp_attachment_image_alt', true) === 'QA accessible image ' . $state, 'Native media alt text was not saved.');
    qa_tool($token, 'wordpress.media.update', ['attachmentId' => $attachment, 'expectedFingerprint' => 'stale', 'fields' => ['altText' => 'stale overwrite']], false);
    $item = qa_tool($token, 'wordpress.media.get', ['attachmentId' => $attachment]);
    qa_tool($token, 'wordpress.media.delete', ['attachmentId' => $attachment, 'expectedFingerprint' => $item['fingerprint']]);
    qa_check(get_post($attachment) === null, 'Native media deletion failed.');
    $settings = qa_tool($token, 'wordpress.settings.get');
    qa_tool($token, 'wordpress.settings.update', ['expectedFingerprint' => $settings['fingerprint'], 'settings' => ['blogdescription' => 'QA ' . $state . ' ' . $suffix]]);
    qa_check(get_option('blogdescription') === 'QA ' . $state . ' ' . $suffix, 'Basic settings update failed.');
    qa_tool($token, 'wordpress.settings.update', ['expectedFingerprint' => $settings['fingerprint'], 'settings' => ['admin_email' => 'unsafe@example.invalid']], false);
    qa_tool($token, 'wordpress.posts.create', ['title' => 'No executable snippets', 'content' => '<?php update_option("' . $GLOBALS['sentinel'] . '","unsafe"); ?>'], false);
    qa_tool($token, 'wordpress.posts.create', ['postType' => 'wpcode', 'title' => 'No executable post type'], false);
    qa_gutenberg($token, $id, $GLOBALS['allowed']);
}

try {
    $session = qa_session();
    foreach (['free', 'pro-unlicensed', 'pro-active', 'pro-expired', 'pro-reactivated'] as $state) {
        if ($state === 'pro-unlicensed') (new \PixflowDesign\WordPress\AdvancedSiteTools\AdvancedSiteToolsModule())->register();
        $allowed = in_array($state, ['pro-active', 'pro-reactivated'], true);
        $help = qa_tool($session, 'help');
        qa_check(isset($help['tools']['wordpress.posts.create']), 'Everyday operations missing in ' . $state);
        qa_check(isset($help['tools']['wordpress.run']) === $allowed, 'Raw discoverability does not follow current grant in ' . $state);
        qa_native_roundtrip($session, $state);
        if ($allowed) {
            qa_typed_read('pixflow/wp-admin/code/list-projects');
            qa_typed_read('pixflow/wp-admin/plugin-source/list');
            qa_tool($session, 'wordpress.run', ['code' => 'return ["qa"=>true];']);
            qa_tool($session, 'files.write', ['path' => $fileRelative, 'content' => $state]);
            qa_check(is_file($fileAbsolute) && file_get_contents($fileAbsolute) === $state, 'Authorized raw file write failed.');
            qa_tool($session, 'database.update', ['table' => $wpdb->options, 'data' => ['option_value' => $state], 'where' => ['option_name' => $sentinel]]);
        } else {
            $before = get_option($sentinel); $fileBefore = is_file($fileAbsolute) ? file_get_contents($fileAbsolute) : null;
            qa_upgrade($session, 'wordpress.run', ['code' => 'update_option("' . $sentinel . '","unsafe"); return true;']);
            qa_upgrade($session, 'help', ['topic' => 'wordpress.run']);
            qa_upgrade($session, 'files.read', ['path' => $fileRelative]);
            qa_upgrade($session, 'files.write', ['path' => $fileRelative, 'content' => 'unsafe']);
            qa_upgrade($session, 'database.select', ['table' => $wpdb->options, 'where' => ['option_name' => $sentinel]]);
            qa_upgrade($session, 'database.update', ['table' => $wpdb->options, 'data' => ['option_value' => 'unsafe'], 'where' => ['option_name' => $sentinel]]);
            foreach (['pixflow/wp-admin/code/list-projects', 'pixflow/wp-admin/code/write-plugin-file', 'pixflow/wp-admin/plugin-source/read-file'] as $id) qa_typed_upgrade($id);
            wp_cache_delete($sentinel, 'options');
            qa_check(get_option($sentinel) === $before && (is_file($fileAbsolute) ? file_get_contents($fileAbsolute) : null) === $fileBefore, 'Denied raw call had a side effect in ' . $state);
        }
        $states[] = $state;
    }
    $readonly = qa_session(['purpose' => 'external-mcp']);
    qa_tool($readonly, 'wordpress.posts.list');
    qa_tool($readonly, 'wordpress.posts.create', ['title' => 'Read-only denial'], false);
    qa_tool($readonly, 'wordpress.run', ['code' => 'return true;'], false);
    $authorization[] = 'read-only';
    (new WP_User($user))->add_cap('edit_plugins', false); wp_set_current_user(0); wp_set_current_user($user);
    qa_tool($session, 'wordpress.posts.list');
    qa_tool($session, 'wordpress.run', ['code' => 'return true;'], false);
    qa_tool($session, 'files.read', ['path' => $fileRelative], false);
    $registration = qa_request('canvas', 'POST', ['builder'=>'gutenberg','action'=>'register','postId'=>$posts[0]]);
    $restrictedCanvas = $registration->get_data()['canvasId']; $canvases[] = $restrictedCanvas;
    $restrictedArgs = ['canvasId'=>$restrictedCanvas, 'expectedPostId'=>$posts[0]];
    $forbidden = qa_tool($session, 'gutenberg.insert', $restrictedArgs + ['blocks'=>[['name'=>'core/html','attributes'=>['content'=>'<script>window.qaMarker = true;</script>']]]], false);
    qa_check(($forbidden['code'] ?? '') === 'gutenberg_executable_content_forbidden', 'Missing executable authority was converted into a Pro upsell.');
    $ordinary = qa_tool($session, 'gutenberg.insert', $restrictedArgs + ['blocks'=>[['name'=>'core/paragraph','attributes'=>['content'=>'Ordinary native edit']]]]);
    qa_check(($ordinary['pending'] ?? false) === true, 'Missing executable authority blocked ordinary Gutenberg authoring.');
    qa_request('canvas', 'POST', ['builder'=>'gutenberg','action'=>'close','canvasId'=>$restrictedCanvas]);
    (new WP_User($user))->remove_cap('edit_plugins'); wp_set_current_user(0); wp_set_current_user($user);
    $authorization[] = 'code-authority';
    qa_tool('pfdirect_' . str_repeat('a', 64), 'wordpress.posts.list', [], false); $authorization[] = 'forged-session';
    wp_set_current_user(0); $anon = qa_request('tools', 'POST', ['tool' => 'help', 'arguments' => []]); qa_check($anon->get_status() >= 400, 'Anonymous request authenticated.'); $authorization[] = 'anonymous';
    (new WP_User($user))->set_role('subscriber');
    qa_tool($session, 'wordpress.posts.list', [], false); $authorization[] = 'revoked-role';
    (new WP_User($user))->set_role('administrator'); wp_set_current_user(0); wp_set_current_user($user);
    qa_request('session', 'DELETE', null, $session); qa_tool($session, 'help', [], false); $authorization[] = 'closed-session';
    $expired = qa_session(); $key = 'pixflow_direct_' . hash('sha256', $expired); $record = get_transient($key); $record['expiresAt'] = time() - 1; set_transient($key, $record, 60); qa_tool($expired, 'help', [], false); $authorization[] = 'expired-session';
    echo wp_json_encode(['passed' => true, 'wordpress' => get_bloginfo('version'), 'php' => PHP_VERSION, 'states' => $states, 'checks' => $checks, 'authorization' => $authorization, 'sourceDiagnostic' => (bool) $source], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
} finally {
    wp_set_current_user($user);
    foreach ($sessions as $token) delete_transient('pixflow_direct_' . hash('sha256', $token));
    foreach ($canvases as $canvas) { try { (new \PixflowDesign\WordPress\Admin\DirectCanvasRelay('gutenberg'))->close($canvas); } catch (Throwable) {} }
    foreach ($commands as $command) delete_transient('pixflow_canvas_result_' . $command);
    foreach ($posts as $id) wp_delete_post($id, true);
    foreach ($terms as $id) wp_delete_term($id, 'category');
    foreach ($media as $id) wp_delete_attachment($id, true);
    if (is_file($fileAbsolute)) unlink($fileAbsolute);
    update_option('blogdescription', $settingsBefore); delete_option($sentinel);
    wp_delete_user($user);
}


