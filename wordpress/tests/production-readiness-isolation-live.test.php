<?php
/** Self-contained local WP integration smoke. Run through wp eval-file. */
if (!defined('ABSPATH')) throw new RuntimeException('Run through WP-CLI.');
function readiness_expect(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
$admin = get_user_by('login', 'pixflow');
readiness_expect($admin instanceof WP_User, 'Local QA administrator required.');
$previous_user = get_current_user_id();
$posts = [];
$subscriber = 0;
try {
    wp_set_current_user($admin->ID);
    $small = '<!-- wp:heading --><h2>Readiness fixture</h2><!-- /wp:heading -->' . "\n" . '<!-- wp:paragraph --><p>Exact UTF-8: café — clay.</p><!-- /wp:paragraph -->';
    $large = str_repeat('<!-- wp:paragraph --><p>' . str_repeat('Readiness clay. ', 100) . '</p><!-- /wp:paragraph -->' . "\n", 100);
    foreach ([$small, $large] as $content) {
        $id = wp_insert_post(['post_title'=>'Disposable readiness fixture', 'post_type'=>'post', 'post_status'=>'draft', 'post_author'=>$admin->ID, 'post_content'=>wp_slash($content)], true);
        readiness_expect(!is_wp_error($id), 'Fixture creation failed.');
        $posts[] = $id;
    }
    $repo = new \PixflowDesign\WordPress\Admin\Gutenberg\GutenbergDocumentRepository();
    $binding = ['sessionId'=>'readiness', 'tabId'=>'readiness-tab', 'conversationId'=>'readiness-conversation', 'sourceMessageId'=>'readiness-message'];
    $inline = $repo->read($posts[0], [], $binding);
    readiness_expect(is_array($inline) && ($inline['contentRaw'] ?? '') === $small && !empty($inline['contentComplete']), 'Exact inline read failed.');
    $index = $repo->read($posts[1], [], $binding);
    readiness_expect(is_array($index) && ($index['readMode'] ?? '') === 'chunked', 'Large document was not chunked.');
    $reassembled = '';
    for ($cursor=0; $cursor<$index['chunkCount']; $cursor++) {
        $chunk = $repo->read($posts[1], ['snapshotId'=>$index['snapshotId'], 'cursor'=>$cursor], $binding);
        readiness_expect(is_array($chunk), 'Chunk read failed.');
        readiness_expect($chunk['chunkSha256'] === 'sha256:' . hash('sha256', $chunk['contentFragment']), 'Chunk integrity failed.');
        $reassembled .= $chunk['contentFragment'];
    }
    readiness_expect($reassembled === $large, 'Chunk reconstruction changed content.');
    $wrong = $binding;
    $wrong['tabId'] = 'different-tab';
    readiness_expect(is_wp_error($repo->read($posts[1], ['snapshotId'=>$index['snapshotId'], 'cursor'=>0], $wrong)), 'Cross-tab snapshot was accepted.');
    $wrong = $binding;
    $wrong['conversationId'] = 'different-conversation';
    readiness_expect(is_wp_error($repo->read($posts[1], ['snapshotId'=>$index['snapshotId'], 'cursor'=>0], $wrong)), 'Cross-conversation snapshot was accepted.');
    readiness_expect(get_post($posts[0])->post_content === $small && get_post($posts[1])->post_content === $large, 'Read mutated persisted content.');
    foreach ([
        '<!-- wp:etch/element {"tag":"section"} /-->',
        '<!-- wp:group --><div class="wp-block-group"><!-- wp:paragraph {"metadata":{"name":"Etch paragraph","etch":{"type":"text"}}} --><p>Managed text</p><!-- /wp:paragraph --></div><!-- /wp:group -->',
    ] as $managed_content) {
        $id = wp_insert_post(['post_title'=>'Disposable builder ownership fixture', 'post_type'=>'post', 'post_status'=>'draft', 'post_content'=>wp_slash($managed_content)], true);
        readiness_expect(!is_wp_error($id), 'Ownership fixture creation failed.');
        $posts[] = $id;
        $status = $repo->target_status($id);
        readiness_expect(is_wp_error($status) && $status->get_error_code() === 'gutenberg_builder_owned_target', 'Etch-managed blocks must not enter the Gutenberg connection.');
    }
    $created = wp_insert_user(['user_login'=>'pf_readiness_' . wp_generate_uuid4(), 'user_pass'=>wp_generate_password(40), 'role'=>'subscriber']);
    readiness_expect(!is_wp_error($created), 'QA subscriber creation failed.');
    $subscriber = (int)$created;
    foreach ([0, $subscriber] as $user_id) {
        wp_set_current_user($user_id);
        foreach (['/od/app-config', '/od/design-systems/etch', '/wp-admin/context', '/diagnostics/snapshot'] as $path) {
            $response = rest_do_request(new WP_REST_Request('GET', '/pixflow-design/v1' . $path));
            readiness_expect(in_array($response->get_status(), [401,403], true), 'Protected route exposed: ' . $path . ' status=' . $response->get_status());
        }
        readiness_expect(is_wp_error($repo->read($posts[0], [], $binding)), 'Private draft exposed to unauthorized user.');
    }
    echo "PASS: inline/chunked UTF-8 integrity, no read mutation, tab/conversation isolation, anonymous/subscriber denial.\n";
} finally {
    wp_set_current_user($admin->ID);
    foreach ($posts as $id) wp_delete_post($id, true);
    if ($subscriber) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user($subscriber);
    }
    wp_set_current_user($previous_user);
}
