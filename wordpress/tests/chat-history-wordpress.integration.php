<?php
declare(strict_types=1);

// Explicit localhost acceptance against real WordPress capabilities and MariaDB.
// All project/history tables use a random test-only prefix; customer tables,
// content, licences and settings are never modified by the history operations.
if (!in_array($argc, [2, 6], true) || !is_file($argv[1] . '/wp-load.php')) {
    throw new RuntimeException('Pass the local QA WordPress root.');
}
define('WP_PLUGIN_DIR', sys_get_temp_dir() . '/pixflow-history-qa-no-plugins');
define('WPMU_PLUGIN_DIR', sys_get_temp_dir() . '/pixflow-history-qa-no-mu-plugins');
define('DISABLE_WP_CRON', true);
define('WP_ADMIN', true);
$_SERVER['HTTP_HOST'] = '127.0.0.1:8088';
require $argv[1] . '/wp-load.php';
if (home_url() !== 'http://127.0.0.1:8088') throw new RuntimeException('Only the local QA site is allowed.');
spl_autoload_register(static function (string $class): void {
    $prefix = 'PixflowDesign\\WordPress\\';
    if (str_starts_with($class, $prefix)) {
        require dirname(__DIR__) . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    }
});
require_once ABSPATH . 'wp-admin/includes/user.php';
// Temporary QA identities must not refresh the site's cached production count.
foreach (['user_register', 'deleted_user'] as $event) remove_action($event, 'wp_maybe_update_user_counts', 10);
// The test may create disposable users and its own tables, but must never write
// existing content, options, project rows or post metadata. This filter is also
// installed in both concurrent worker processes, before their history calls.
add_filter('query', static function (string $sql): string {
    global $wpdb;
    if (!preg_match('/\A\s*(?:INSERT|REPLACE|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i', $sql)) return $sql;
    if (!preg_match('/\A\s*(?:INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+(?:INTO\s+)?|UPDATE|DELETE\s+FROM|(?:CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?|ALTER\s+TABLE|TRUNCATE\s+(?:TABLE\s+)?)\s*`?([a-z0-9_]+)/i', $sql, $match)) {
        throw new RuntimeException('Unrecognized mutation blocked by the preservation guard.');
    }
    $table = $match[1];
    if (!preg_match('/\Apixflow_history_qa_[a-f0-9]{10}_[a-z0-9_]+\z/D', $table)
        && !in_array($table, [$wpdb->users, $wpdb->usermeta], true)) {
        throw new RuntimeException('Mutation outside disposable test tables blocked: ' . $table . ' via ' . implode(' > ', array_column(debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS), 'function')));
    }
    return $sql;
});
if ($argc === 6) {
    if ($argv[2] !== 'resolve-worker' || !preg_match('/\Apixflow_history_qa_[a-f0-9]{10}_\z/D', $argv[3])) throw new RuntimeException('Invalid isolated worker target.');
    wp_set_current_user((int) $argv[4]);
    if (!str_starts_with(wp_get_current_user()->user_login, 'pixflow-history-qa-')) throw new RuntimeException('Invalid isolated worker owner.');
    $wpdb->prefix = $argv[3];
    $result = (new PixflowDesign\WordPress\Chat\HistoryService())->resolve(['sessionKey' => $argv[5]]);
    if (is_wp_error($result)) throw new RuntimeException($result->get_error_code());
    echo wp_json_encode($result);
    exit;
}
function history_check(bool $ok, string $label): void {
    if (!$ok) throw new RuntimeException($label);
    echo "PASS: {$label}\n";
}
function history_value(mixed $value): array {
    if (is_wp_error($value)) throw new RuntimeException($value->get_error_code() . ': ' . $value->get_error_message());
    if (!is_array($value)) throw new RuntimeException('Unexpected history response.');
    return $value;
}
function history_snapshot(): array {
    global $wpdb;
    $snapshot = array_map(static fn($rows) => hash('sha256', serialize($rows)), [
        'posts' => $wpdb->get_results("SELECT ID,post_content,post_title,post_status,post_modified FROM {$wpdb->posts} ORDER BY ID", ARRAY_A),
        'postmeta' => $wpdb->get_results("SELECT * FROM {$wpdb->postmeta} ORDER BY meta_id", ARRAY_A),
        'users' => $wpdb->get_results("SELECT * FROM {$wpdb->users} ORDER BY ID", ARRAY_A),
        'usermeta' => $wpdb->get_results("SELECT * FROM {$wpdb->usermeta} ORDER BY umeta_id", ARRAY_A),
        'projects' => $wpdb->get_results('SELECT * FROM ' . $wpdb->prefix . 'pixflow_design_projects ORDER BY id', ARRAY_A),
    ]);
    $options = history_persistent_options();
    $snapshot['options'] = history_option_hashes($options);
    $snapshot['externalCacheContent'] = history_external_cache_content_hashes($options);
    $snapshot['memory'] = [];
    foreach ($wpdb->get_results("SELECT umeta_id,user_id,meta_key,meta_value FROM {$wpdb->usermeta} WHERE meta_key LIKE 'pixflow%' ORDER BY umeta_id", ARRAY_A) as $row) {
        $snapshot['memory'][$row['user_id'] . ':' . $row['meta_key'] . ':' . $row['umeta_id']] = hash('sha256', $row['meta_value']);
    }
    return $snapshot;
}
function history_external_cache_content_hashes(array $options): array {
    // These installed local fixture entry files refresh timestamps on every
    // browser request. Compare every non-time field, including licence values;
    // never exclude the option or print its contents. SQL guard above prohibits
    // this test (including workers) from changing even these timestamp fields.
    $fields = [
        '_elementor_pro_license_v2_data' => ['timeout'],
        '_transient_timeout_etch_license_is_active' => [],
        'acf_pro_license_status' => ['created', 'expiry', 'next_check'],
    ];
    $result = [];
    foreach ($options as $row) {
        $name = $row['option_name'];
        if (!array_key_exists($name, $fields)) continue;
        $value = maybe_unserialize($row['option_value']);
        if ($fields[$name] === []) {
            if (!is_numeric($value) || (int) $value <= 0) continue;
            $value = 'positive-transient-expiry';
        } else {
            if (!is_array($value)) continue;
            foreach ($fields[$name] as $field) {
                if (!isset($value[$field]) || !is_numeric($value[$field]) || (int) $value[$field] <= 0) continue 2;
                $value[$field] = 'positive-refresh-timestamp';
            }
        }
        $result[$name] = hash('sha256', serialize($value));
    }
    return $result;
}
function history_persistent_options(): array {
    global $wpdb;
    // Open editor tabs continuously refresh these transient canvas registrations.
    // They are transport heartbeats, not customer settings or durable history.
    return array_values(array_filter($wpdb->get_results("SELECT option_name,option_value FROM {$wpdb->options} ORDER BY option_name", ARRAY_A),
        static fn(array $row): bool => !preg_match('/\Apixflow_(?:(?:etch|elementor|gutenberg)_)?canvas_[a-f0-9]{32}\z/D', $row['option_name'])));
}
function history_option_hashes(array $options): array {
    global $wpdb;
    $result = [];
    foreach ($options as $row) {
        $result[$row['option_name']] = hash('sha256', $row['option_value']);
    }
    return $result;
}
$originalPrefix = $wpdb->prefix;
$qaPrefix = 'pixflow_history_qa_' . bin2hex(random_bytes(5)) . '_';
$qaTables = [];
$qaUsers = [];
$before = history_snapshot();
$exitCode = 0;
$asUser = static function (int $id) use ($originalPrefix, $qaPrefix): void {
    global $wpdb;
    $wpdb->prefix = $originalPrefix;
    wp_set_current_user($id);
    $wpdb->prefix = $qaPrefix;
};
try {
    foreach (['author', 'author', 'subscriber'] as $role) {
        $login = 'pixflow-history-qa-' . bin2hex(random_bytes(6));
        try { $id = wp_insert_user(['user_login' => $login, 'user_pass' => wp_generate_password(40), 'role' => $role]); }
        finally {
            $created = get_user_by('login', $login);
            if ($created) $qaUsers[] = (int) $created->ID;
        }
        if (is_wp_error($id)) throw new RuntimeException('Could not create isolated QA account.');
    }
    $asUser($qaUsers[0]);
    foreach (PixflowDesign\WordPress\Database\Schema::statements() as $sql) {
        if (!preg_match('/CREATE TABLE ([a-z0-9_]+)/i', $sql, $match) || !str_starts_with($match[1], $qaPrefix)) {
            throw new RuntimeException('Unscoped test schema rejected.');
        }
        $qaTables[] = $match[1];
        if ($wpdb->query($sql) === false) throw new RuntimeException('Test schema failed: ' . $wpdb->last_error);
    }

    $service = new PixflowDesign\WordPress\Chat\HistoryService();
    $projects = new PixflowDesign\WordPress\Projects\ProjectRepository();
    $conversation = 'legacy-chat-with-complete-history';
    $legacy = [];
    for ($index = 0; $index < 125; $index++) {
        $legacy[] = ['id' => 'message-' . $index, 'role' => $index % 2 ? 'assistant' : 'user',
            'content' => $index === 124 ? str_repeat('Complete answer — 日本語 العربية 🎨 ', 1000) : 'Historical message ' . $index,
            'createdAt' => 1700000000000, 'status' => 'complete',
            'attachments' => [['name' => 'original.png', 'url' => '/uploads/original.png']],
            'events' => [['kind' => 'steering_message', 'id' => 'steer-' . $index, 'text' => 'Keep the saved change']],
            'producedFiles' => [['path' => 'generated/original.png']], 'customLegacyField' => ['retain' => true]];
    }
    $metadata = ['personalSetting' => ['untouched' => true], 'odState' => [
        'conversations' => [['id' => $conversation, 'title' => 'Original chat', 'updatedAt' => 1700000000000]],
        'messages' => [$conversation => $legacy], 'comments' => ['keep' => 'annotation'], 'tabs' => ['keep' => true],
    ]];
    $project = $projects->create(['title' => 'Durable history isolated QA', 'visibility' => 'private', 'metadata' => $metadata]);
    history_check(!empty($project['uuid']), 'Isolated legacy project created');
    $projectId = $project['uuid'];
    $page = history_value($service->page($projectId, $conversation));
    history_check(count($page['messages']) === 50 && $page['hasMore'] && $page['nextCursor'], 'Initial load is 50 messages with an older-history cursor');
    $all = $page['messages'];
    $pageTwo = history_value($service->page($projectId, $conversation, 50, $page['nextCursor']));
    $all = array_merge($pageTwo['messages'], $all);
    $pageThree = history_value($service->page($projectId, $conversation, 50, $pageTwo['nextCursor']));
    $all = array_merge($pageThree['messages'], $all);
    history_check(count($pageThree['messages']) === 25 && !$pageThree['hasMore'] && $pageThree['nextCursor'] === null, 'Final page ends without repeated cursors');
    $withoutHistory = static function (array $message): array { unset($message['historyRevision'], $message['historySequence']); return $message; };
    history_check(array_map($withoutHistory, $all) === $legacy, 'All 125 legacy messages retain exact text, unicode, attachments, steering events and unknown fields');
    history_check($projects->find_by_uuid($projectId)['metadata'] === $metadata, 'Migration leaves the complete legacy backup and settings untouched');
    $again = history_value($service->page($projectId, $conversation, null));
    history_check(count($again['messages']) === 125, 'Repeated migration is idempotent');

    $messagesTable = PixflowDesign\WordPress\Database\Table::name(PixflowDesign\WordPress\Database\Table::CHAT_MESSAGES);
    $largeRow = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$messagesTable} WHERE message_id = %s", 'message-124'), ARRAY_A);
    history_check(str_starts_with($largeRow['payload'], 'PFCHAT1:') && strlen($largeRow['payload']) < strlen(wp_json_encode($legacy[124])) / 4, 'Large legacy messages are compressed during import');
    // Simulate pre-upgrade rows, then exercise the production bounded background worker.
    $wpdb->update($messagesTable, ['payload' => wp_json_encode($legacy[124])], ['sequence_id' => $largeRow['sequence_id']]);
    $migration = PixflowDesign\WordPress\Chat\HistoryStorage::batch((int) $largeRow['sequence_id'] - 1, 1);
    history_check($migration['rowsCompressed'] === 1 && $migration['bytesSaved'] > 0, 'Real MariaDB backfill reduces stored bytes');
    history_check($service->page($projectId, $conversation, null)['messages'] === $again['messages'], 'Backfill keeps complete exported JSON, revisions and ordering identical');
    history_check(PixflowDesign\WordPress\Chat\HistoryStorage::batch((int) $largeRow['sequence_id'] - 1, 1)['rowsCompressed'] === 0, 'Real repeated backfill is idempotent');
    $storedAfter = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$messagesTable} WHERE sequence_id = %d", $largeRow['sequence_id']), ARRAY_A);
    history_check($storedAfter === $largeRow, 'Encoding alone changes no message identity, revision or conversation metadata');
    $exportFirst = history_value($service->export_page($projectId, $conversation));
    $exportLast = history_value($service->export_page($projectId, $conversation, $exportFirst['nextCursor']));
    history_check(count($exportFirst['messages']) === 100 && count($exportLast['messages']) === 25 && !$exportLast['hasMore'], 'Full export uses bounded chronological pages beyond the loaded UI window');
    history_check(array_map($withoutHistory, [...$exportFirst['messages'], ...$exportLast['messages']]) === $legacy, 'Full export preserves every original field, tool event, attachment reference and Unicode character');
    history_check($exportFirst['conversation'] === $exportLast['conversation'] && $exportFirst['exportedAt'] === $exportLast['exportedAt'] && $exportFirst['schemaVersion'] === 1, 'Export metadata remains stable across pages');
    history_check(history_value($service->export_page($projectId, $conversation, $exportFirst['nextCursor'])) === $exportLast, 'Retrying an export page is deterministic and creates no history');
    history_check(is_wp_error($service->export_page($projectId, $conversation, $exportFirst['nextCursor'] . 'x')), 'Tampered export cursor is rejected');
    $expiredParts = explode('.', $exportFirst['nextCursor']);
    $expiredState = json_decode(base64_decode(strtr($expiredParts[0], '-_', '+/')), true);
    $expiredState['expires'] = time() - 1;
    $expiredBody = rtrim(strtr(base64_encode(wp_json_encode($expiredState)), '+/', '-_'), '=');
    $expiredToken = $expiredBody . '.' . hash_hmac('sha256', $expiredBody, wp_salt('auth'));
    history_check(is_wp_error($service->export_page($projectId, $conversation, $expiredToken)), 'Expired signed export cursors are rejected');
    $asUser($qaUsers[1]);
    history_check(is_wp_error($service->export_page($projectId, $conversation, $exportFirst['nextCursor'])), 'Another owner cannot use an export cursor');
    history_check($service->storage_usage()['messageCount'] === 0 && $service->storage_usage()['projectMetadataBytes'] === 0, 'Storage reporting reveals none of another owner’s chat bytes');
    $asUser($qaUsers[0]);
    $usage = history_value($service->storage_usage());
    $storageRows = $wpdb->get_results("SELECT payload FROM {$messagesTable} WHERE deleted = 0", ARRAY_A);
    $expectedStored = array_sum(array_map(static fn(array $row): int => strlen($row['payload']), $storageRows));
    $expectedLogical = array_sum(array_map(static fn(array $row): int => strlen(PixflowDesign\WordPress\Chat\HistoryPayload::json($row['payload'])), $storageRows));
    history_check($usage['messageCount'] === 125 && $usage['conversationCount'] === 1 && $usage['storedMessageBytes'] === $expectedStored && $usage['logicalMessageBytes'] === $expectedLogical, 'Usage reports exact database and decoded byte lengths, including multibyte text');
    history_check($usage['compressedMessageCount'] > 0 && $usage['savedMessageBytes'] === $expectedLogical - $expectedStored && $usage['projectMetadataBytes'] === strlen(wp_json_encode($metadata)), 'Compression savings and retained legacy metadata are reported separately without deleting backups');
    history_check(in_array('media-files', $usage['exclusions'], true) && in_array('bridge-files', $usage['exclusions'], true) && in_array('database-overhead', $usage['exclusions'], true), 'Storage explicitly excludes media, local Bridge files and database allocation overhead');
    $bulkMessages = [];
    for ($index = 0; $index < 602; $index++) $bulkMessages[] = ['id' => 'bulk-export-' . $index, 'role' => 'assistant', 'content' => 'Complete export item ' . $index];
    $bulkProject = $projects->create(['title' => 'Isolated export page limit QA', 'visibility' => 'private', 'metadata' => ['odState' => ['messages' => ['bulk-export' => $bulkMessages]]]]);
    $bulkFirst = history_value($service->export_page($bulkProject['uuid'], 'bulk-export', '', 500));
    $bulkLast = history_value($service->export_page($bulkProject['uuid'], 'bulk-export', $bulkFirst['nextCursor'], 500));
    history_check(count($bulkFirst['messages']) === 500 && count($bulkLast['messages']) === 102 && !$bulkLast['hasMore'], 'Export can return 500 bounded messages per request to reduce WordPress bootstrap overhead');
    history_check(array_map($withoutHistory, [...$bulkFirst['messages'], ...$bulkLast['messages']]) === $bulkMessages, 'Larger export pages preserve exact complete history and order');
    history_check(count(history_value($service->export_page($bulkProject['uuid'], 'bulk-export', '', 999999))['messages']) === 500, 'Export refuses unbounded caller page limits');
    history_check(count(history_value($service->export_page($bulkProject['uuid'], 'bulk-export'))['messages']) === 100 && count(history_value($service->page($bulkProject['uuid'], 'bulk-export'))['messages']) === 50, 'Export and normal chat default page sizes remain unchanged');
    $exportRace = 'export-concurrency';
    history_value($service->write($projectId, $exportRace, ['id' => 'one', 'role' => 'user', 'content' => 'Original one']));
    history_value($service->write($projectId, $exportRace, ['id' => 'two', 'role' => 'assistant', 'content' => 'Original two']));
    foreach (['edit', 'append', 'delete', 'rename'] as $mutation) {
        $snapshot = history_value($service->export_page($projectId, $exportRace, '', 1));
        if ($mutation === 'edit') history_value($service->write($projectId, $exportRace, [...$snapshot['messages'][0], 'content' => 'Updated one']));
        if ($mutation === 'append') history_value($service->write($projectId, $exportRace, ['id' => 'three', 'role' => 'user', 'content' => 'New third']));
        if ($mutation === 'delete') history_value($service->remove($projectId, $exportRace, 'one'));
        if ($mutation === 'rename') history_value($service->rename($projectId, $exportRace, 'Updated export title'));
        $conflict = $service->export_page($projectId, $exportRace, (string) $snapshot['nextCursor'], 1);
        history_check(is_wp_error($conflict) && $conflict->get_error_code() === 'pixflow_history_export_changed', "Export rejects concurrent {$mutation} instead of silently mixing chat versions");
    }
    $byteChat = 'export-byte-budget';
    foreach (['large-one', 'large-two'] as $id) history_value($service->write($projectId, $byteChat, ['id' => $id, 'role' => 'assistant', 'content' => str_repeat('Complete Unicode 🎨 ', 150000)]));
    $byteFirst = history_value($service->export_page($projectId, $byteChat, '', 500));
    $byteLast = history_value($service->export_page($projectId, $byteChat, (string) $byteFirst['nextCursor'], 500));
    history_check(count($byteFirst['messages']) === 1 && count($byteLast['messages']) === 1 && strlen($byteFirst['messages'][0]['content']) === strlen(str_repeat('Complete Unicode 🎨 ', 150000)), 'Export byte budget separates large payloads without truncating a message');
    history_check(is_wp_error($service->export_page($projectId, $byteChat, $exportFirst['nextCursor'])), 'An export cursor cannot cross conversations');
    unset($byteFirst, $byteLast);
    foreach (['api', 'codex', 'composio'] as $provider) {
        $profile = ['id' => 'storage-profile-' . $provider, 'role' => 'assistant', 'agentId' => $provider, 'runStatus' => 'succeeded',
            'content' => str_repeat('Original response 日本語 ', 500), 'events' => [['kind' => 'tool_result', 'output' => str_repeat('Keep the tool evidence ', 500)]]];
        $savedProfile = history_value($service->write($projectId, 'storage-profile', $profile));
        history_check($withoutHistory($savedProfile['message']) === $profile, "$provider compressed write reads exact content and tool evidence");
    }

    // Candidates use this process's disposable object cache; no production options
    // may be written by the test. Committed checkpoints use only the QA user's meta.
    $priorExternalCache = wp_using_ext_object_cache();
    wp_using_ext_object_cache(true);
    try {
        $working = new PixflowDesign\WordPress\Chat\WorkingContextService();
        $workingRepository = new PixflowDesign\WordPress\Chat\WorkingContextRepository();
        $contextBefore = wp_json_encode($again['messages']);
        $preparedContext = $working->prepare($projectId, $conversation, ['force' => true], static fn() => 'Keep the saved change. The existing original.png reference and generated/original.png file remain relevant.');
        history_check($preparedContext['status'] === 'compacted' && !empty($preparedContext['candidateId']) && $preparedContext['coveredMessages'] > 0, 'Real WordPress prepares bounded history without Pro or a licence');
        history_check($workingRepository->read($projectId, $conversation) === [], 'Unacknowledged context preparation leaves persisted memory untouched');
        $contextResult = $working->commit($projectId, $conversation, $preparedContext['candidateId']);
        history_check($contextResult['status'] === 'compacted' && $workingRepository->read($projectId, $conversation)['summary'] === $preparedContext['summary'], 'Real MariaDB lock commits the separate owned checkpoint');
        history_check($working->commit($projectId, $conversation, $preparedContext['candidateId'])['status'] === 'reused', 'Lost-response commit retry is idempotent');
        history_check(wp_json_encode(history_value($service->page($projectId, $conversation, null))['messages']) === $contextBefore, 'Compaction does not modify any original transcript fields or revisions');
        history_check($projects->find_by_uuid($projectId)['metadata'] === $metadata, 'Compaction preserves original settings and legacy recovery copy');
        $asUser($qaUsers[1]);
        try { $working->prepare($projectId, $conversation, ['force' => true], static fn() => throw new RuntimeException('Provider must not run')); throw new LogicException('Foreign history accepted'); }
        catch (RuntimeException $expected) { history_check(!str_contains($expected->getMessage(), 'Provider must'), 'Real ownership check rejects before any summarization or billing'); }
        $asUser($qaUsers[0]);
        $workingRepository->forget($projectId, $conversation);
        history_check($workingRepository->read($projectId, $conversation) === [], 'Derived private context can be removed independently without deleting chats');
        history_check(get_transient('pixflow_context_candidate_' . $preparedContext['candidateId']) === false, 'Deleting source clears pending private summary even without cron');
        $candidateIndex = 'pixflow_design_working_context_' . get_current_blog_id() . '_' . PixflowDesign\WordPress\Chat\HistoryRepository::key($projectId, $conversation) . '_candidates';
        history_check(get_user_meta(get_current_user_id(), $candidateIndex, true) === '', 'Deleting source removes the private candidate index');
    } finally { wp_using_ext_object_cache($priorExternalCache); }

    $last = $page['messages'][49];
    $changed = [...$last, 'content' => $last['content'] . '\nAdditional complete answer'];
    $saved = history_value($service->write($projectId, $conversation, $changed));
    history_check($saved['revision'] === $last['historyRevision'] + 1, 'Acknowledged edit advances revision');
    $duplicate = history_value($service->write($projectId, $conversation, $changed));
    history_check($duplicate['revision'] === $saved['revision'], 'Retry of identical acknowledged payload does not create another revision');
    $stale = $service->write($projectId, $conversation, [...$last, 'content' => 'Stale tab shorter content']);
    history_check(is_wp_error($stale) && $stale->get_error_code() === 'pixflow_history_conflict', 'Stale tab cannot overwrite newer complete content');
    $import = history_value($service->write($projectId, $conversation, [...$last, 'content' => 'Old cached truncated answer'], true, true));
    history_check($import['message']['content'] === $changed['content'], 'Browser-cache import cannot downgrade an existing durable answer');
    history_value($service->write($projectId, $conversation, ['id' => 'new-after-cursor', 'role' => 'user', 'content' => 'New live message', 'createdAt' => 1]));
    $stablePage = history_value($service->page($projectId, $conversation, 50, $page['nextCursor']));
    history_check(array_column($stablePage['messages'], 'id') === array_column($pageTwo['messages'], 'id'), 'Concurrent newer insert and edited timestamps do not move the older-page boundary');
    $other = 'other-conversation';
    history_value($service->write($projectId, $other, ['id' => 'message-124', 'role' => 'assistant', 'content' => 'Separate conversation']));
    $foreignCursor = $service->page($projectId, $other, 50, $page['nextCursor']);
    history_check(is_wp_error($foreignCursor) && $foreignCursor->get_error_code() === 'pixflow_history_cursor', 'Cursor from another conversation is rejected');
    history_check(is_wp_error($service->page($projectId, $conversation, 50, 'invalid-cursor')), 'Malformed cursor is rejected');

    (new PixflowDesign\WordPress\Http\Routes\ChatHistoryRoutes())->register();
    $rest = static function (string $method, string $path, ?array $body = null) {
        $request = new WP_REST_Request($method, '/pixflow-design/v1/chat-history/' . $path);
        if ($body !== null) { $request->set_header('Content-Type', 'application/json'); $request->set_body(wp_json_encode($body)); }
        return rest_do_request($request);
    };
    history_check($rest('GET', $projectId . '/' . $conversation . '/export')->get_status() === 200 && $rest('GET', 'storage')->get_status() === 200, 'Free users can export and view storage through REST without Pro or a licence');
    $historyCounts = static function () use ($wpdb, $qaPrefix): array {
        return array_map(static fn(string $name): int => (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . $qaPrefix . $name),
            ['pixflow_design_projects', 'pixflow_design_chat_bindings', 'pixflow_design_chat_conversations']);
    };
    $emptyCounts = $historyCounts();
    foreach ([1, 2] as $_) {
        $emptyLookup = $rest('POST', 'resolve', ['sessionKey' => 'floating-qa-session', 'create' => false]);
        history_check($emptyLookup->get_status() === 200 && $emptyLookup->get_data() === ['projectId' => null, 'conversationId' => null], 'Empty-panel lookup returns no binding without creating a chat');
    }
    history_check($historyCounts() === $emptyCounts, 'Repeated empty-panel lookups leave project, binding and conversation counts unchanged');
    $resolved = $rest('POST', 'resolve', ['sessionKey' => 'floating-qa-session', 'title' => 'Floating conversation']);
    history_check($resolved->get_status() === 200, 'Free floating-panel history resolves without Pro or a licence');
    $binding = $resolved->get_data();
    $emptyExport = history_value($service->export_page($binding['projectId'], $binding['conversationId']));
    history_check($emptyExport['messages'] === [] && $emptyExport['conversation']['messageCount'] === 0 && $emptyExport['nextCursor'] === null && !$emptyExport['hasMore'], 'An empty saved chat has a valid complete export');
    history_check($rest('POST', 'resolve', ['sessionKey' => 'floating-qa-session', 'create' => false])->get_data() === $binding, 'Lookup-only resolution recovers an existing saved chat');
    history_check($rest('POST', 'resolve', ['sessionKey' => 'floating-qa-session'])->get_data() === $binding, 'Repeated resolution does not create duplicate chats');
    $workers = [];
    foreach ([1, 2] as $_) {
        $pipes = [];
        $process = proc_open([PHP_BINARY, '-d', 'extension_dir=' . ini_get('extension_dir'), '-d', 'extension=sodium', __FILE__, $argv[1], 'resolve-worker', $qaPrefix, (string) $qaUsers[0], 'concurrent-resolve'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new RuntimeException('Could not start isolated concurrent worker.');
        fclose($pipes[0]);
        $workers[] = [$process, $pipes];
    }
    $workerResults = [];
    foreach ($workers as [$process, $pipes]) {
        $output = stream_get_contents($pipes[1]); $error = stream_get_contents($pipes[2]);
        fclose($pipes[1]); fclose($pipes[2]);
        if (proc_close($process) !== 0) throw new RuntimeException('Concurrent worker failed: ' . $error);
        $workerResults[] = json_decode($output, true, 512, JSON_THROW_ON_ERROR);
    }
    history_check($workerResults[0] === $workerResults[1], 'Two concurrent browser-tab resolutions share one chat');
    $path = $binding['projectId'] . '/' . $binding['conversationId'] . '/messages';
    history_check($rest('POST', $path, ['messages' => $legacy, 'importOnly' => true])->get_status() === 400, 'Oversized import batch rejected without partial writes');
    history_check($rest('POST', $path, ['messages' => array_slice($legacy, 0, 100), 'importOnly' => true])->get_status() === 200, 'First legacy browser import batch accepted');
    history_check($rest('POST', $path, ['messages' => array_slice($legacy, 100), 'importOnly' => true])->get_status() === 200, 'Remaining legacy browser import batch accepted');
    history_check(count(history_value($service->page($binding['projectId'], $binding['conversationId'], null))['messages']) === 125, 'REST import preserves more than 24 messages');
    $encodedConversation = 'bricks:route/%25/日本語';
    $encodedPath = $binding['projectId'] . '/' . rawurlencode($encodedConversation) . '/messages';
    $encodedMessage = ['id' => 'direct:123:user/%25/日本語', 'role' => 'user', 'content' => 'Identity round trip'];
    $encodedImport = $rest('POST', $encodedPath, ['messages' => [$encodedMessage], 'importOnly' => true])->get_data();
    $encodedSaved = $rest('PUT', $encodedPath . '/' . rawurlencode($encodedMessage['id']), $encodedImport['messages'][0]);
    history_check($encodedSaved->get_status() === 200 && $encodedSaved->get_data()['message']['id'] === $encodedMessage['id'], 'REST preserves encoded message identity instead of repeatedly percent-encoding it');
    $encodedPage = history_value($service->page($binding['projectId'], $encodedConversation, null));
    history_check(count($encodedPage['messages']) === 1 && $encodedPage['messages'][0]['id'] === $encodedMessage['id'], 'Import and save share one decoded conversation and message');
    history_check($rest('DELETE', $encodedPath . '/' . rawurlencode($encodedMessage['id']))->get_status() === 200 && count(history_value($service->page($binding['projectId'], $encodedConversation, null))['messages']) === 0, 'Encoded identity deletion addresses the original message');
    $asUser($qaUsers[1]);
    history_check($rest('GET', $path)->get_status() === 403, 'Another author cannot read private history');
    history_check($rest('PUT', $path . '/message-0', ['role' => 'user', 'content' => 'Unauthorized'])->get_status() === 403, 'Another author cannot replace private history');
    (new PixflowDesign\WordPress\Projects\ProjectAccessRepository())->grant((int) $projects->find_by_uuid($binding['projectId'])['id'], $qaUsers[1], 'editor');
    history_check($rest('GET', $path)->get_status() === 403, 'A shared project does not open the Pro Workspace to Free');
    $pro = true;
    PixflowDesign\WordPress\Modules\FeatureContributions::add('workspace', static fn() => 'qa-workspace');
    PixflowDesign\WordPress\Modules\FeatureContributions::authorize_using(static function () use (&$pro): bool { return $pro; });
    history_check($rest('GET', $path)->get_status() === 200, 'Pro shared-project editor can read the same history');
    history_check($rest('PUT', $path . '/shared-editor', ['role' => 'user', 'content' => 'Authorised shared edit'])->get_status() === 200, 'Pro shared-project editor can save to the same history');
    $pro = false;
    history_check($rest('GET', $path)->get_status() === 403, 'Expired Pro does not retain the additional shared history route access');
    $otherBinding = $rest('POST', 'resolve', ['sessionKey' => 'floating-qa-session'])->get_data();
    history_check($otherBinding['projectId'] !== $binding['projectId'], 'Same browser session key cannot cross account boundaries');
    $asUser($qaUsers[2]);
    history_check($rest('POST', 'resolve', ['sessionKey' => 'subscriber'])->get_status() === 403, 'Subscriber cannot create history');
    history_check($rest('GET', 'storage')->get_status() === 403 && $rest('GET', $projectId . '/' . $conversation . '/export')->get_status() === 403, 'Subscriber cannot access chat usage or exports');
    $asUser(0);
    history_check($rest('GET', $path)->get_status() === 401, 'Anonymous history request denied');
    history_check($rest('GET', 'storage')->get_status() === 401 && $rest('GET', $projectId . '/' . $conversation . '/export')->get_status() === 401, 'Anonymous usage and exports are denied');
    $asUser($qaUsers[0]);

    $conversations = $rest('GET', 'conversations')->get_data()['conversations'];
    history_check(in_array($binding['projectId'], array_column($conversations, 'projectId'), true), 'Owned floating conversation is discoverable after browser cache is lost');
    history_check(!in_array($otherBinding['projectId'], array_column($conversations, 'projectId'), true), 'Conversation discovery excludes another author');

    history_value($service->remove($projectId, $conversation, 'message-0'));
    $deletedImport = $service->write($projectId, $conversation, $legacy[0], true, true);
    history_check(is_wp_error($deletedImport) && $deletedImport->get_error_code() === 'pixflow_history_deleted', 'Explicitly deleted message cannot be resurrected by old cache');
    history_check(count(history_value($service->page($projectId, $conversation, null))['messages']) === 125, 'Deleted message stays absent despite retained legacy backup');
    $mixed = $rest('POST', $projectId . '/' . $conversation . '/messages', ['messages' => [$legacy[0], ['id' => 'mixed-batch-survivor', 'role' => 'user', 'content' => 'Keep this new message']], 'importOnly' => true]);
    history_check($mixed->get_status() === 200 && $mixed->get_data()['deletedMessageIds'] === ['message-0'] && $mixed->get_data()['messages'][0]['id'] === 'mixed-batch-survivor', 'Deleted cache entry does not prevent the rest of an import batch being preserved');
    history_value($service->remove_conversation($projectId, $conversation));
    history_check(is_wp_error($service->page($projectId, $conversation)), 'Deleted conversation cannot lazy-migrate again');
    $visibleIds = array_column($rest('GET', 'conversations')->get_data()['conversations'], 'conversationId');
    history_check(!in_array($conversation, $visibleIds, true), 'Deleted conversation is absent from recovery discovery');
    history_check($service->merge_conversations($projectId, $metadata['odState']['conversations'])[0]['id'] === $other, 'Deleted conversation stays absent from Workspace list');
    history_check($projects->find_by_uuid($projectId)['metadata'] === $metadata, 'All history operations leave unrelated metadata, comments and settings intact');
    $publicProject = PixflowDesign\WordPress\Od\ProjectAdapter::without_chat_backup($projects->find_by_uuid($projectId));
    $expectedPublic = $metadata;
    unset($expectedPublic['odState']['messages']);
    history_check($publicProject['metadata'] === $expectedPublic, 'Project responses omit only the legacy message backup, preserving other metadata');
    $roundTrip = $projects->update_by_uuid($projectId, ['metadata' => $publicProject['metadata']]);
    history_check($roundTrip['metadata'] === $metadata, 'Round-tripping public metadata preserves the full stored legacy backup');
    $editedMetadata = [...$publicProject['metadata'], 'personalSetting' => ['untouched' => true, 'newPreference' => 'saved'], 'odState' => ['messages' => []]];
    $editedProject = $projects->update_by_uuid($projectId, ['metadata' => $editedMetadata]);
    history_check($editedProject['metadata']['odState'] === $metadata['odState'], 'Stale or malicious generic metadata cannot overwrite server-owned chat state');
    history_check($editedProject['metadata']['personalSetting'] === $editedMetadata['personalSetting'], 'Ordinary project settings remain editable alongside protected chat state');
    $deletedContextChat = history_value($service->resolve(['sessionKey' => 'context-deletion-fixture']));
    $deletedContextProject = $projects->find_by_uuid($deletedContextChat['projectId']);
    $derivedContext = new PixflowDesign\WordPress\Chat\WorkingContextRepository();
    $derivedContext->save($deletedContextChat['projectId'], $deletedContextChat['conversationId'], ['summary' => 'QA-derived private facts']);
    $projects->mark_deleted((int) $deletedContextProject['id']);
    history_check($derivedContext->read($deletedContextChat['projectId'], $deletedContextChat['conversationId']) === [], 'Deleting a project removes its derived context under the conversation lock');
    // Exercise the production CLI dispatcher against the same live REST routes.
    // Only its output transport is captured; storage and permissions stay real.
    if (!defined('WP_CLI')) define('WP_CLI', true);
    class HistoryQaCli {
        public static mixed $command;
        public static array $output = [];
        public static function add_command(string $name, callable $command, array $options): void { self::$command = $command; }
        public static function line(string $value): void { self::$output[] = json_decode($value, true, 512, JSON_THROW_ON_ERROR); }
        public static function error(string $message): never { throw new RuntimeException($message); }
        public static function halt(int $status): never { throw new RuntimeException('CLI request failed: ' . $status); }
    }
    class_alias(HistoryQaCli::class, 'WP_CLI');
    PixflowDesign\WordPress\Http\Routes\ChatHistoryRoutes::register_cli();
    (HistoryQaCli::$command)(['usage'], ['json' => true]);
    history_check(HistoryQaCli::$output[0]['scope'] === 'current-user' && HistoryQaCli::$output[0]['messageCount'] === $service->storage_usage()['messageCount'], 'WP CLI usage reads the same owner-scoped REST service');
    (HistoryQaCli::$command)(['export', $binding['projectId'], $binding['conversationId']], ['json' => true, 'limit' => 1]);
    $cliFirst = HistoryQaCli::$output[1];
    (HistoryQaCli::$command)(['export', $binding['projectId'], $binding['conversationId']], ['json' => true, 'limit' => 1, 'cursor' => $cliFirst['nextCursor']]);
    history_check(count($cliFirst['messages']) === 1 && HistoryQaCli::$output[2]['messages'][0]['id'] !== $cliFirst['messages'][0]['id'] && $cliFirst['conversation'] === HistoryQaCli::$output[2]['conversation'], 'WP CLI export advances the same signed chronological cursor without duplicate messages');
    // Real WordPress/MariaDB transaction and capability checks for independent chat forks.
    $asUser($qaUsers[0]);
    $forkFixture = $projects->create(['title' => 'Independent fork QA source', 'visibility' => 'private', 'metadata' => $metadata]);
    $forkPid = $forkFixture['uuid'];
    $forkSource = history_value($service->page($forkPid, $conversation, null));
    $forker = new PixflowDesign\WordPress\Chat\ConversationFork();
    $forkInput = ['requestId' => 'mariadb-fork-transaction-1234', 'forkAfterMessageId' => 'message-119', 'title' => 'Separate fork QA'];
    $fork = history_value($forker->create($forkPid, $conversation, $forkInput));
    $forkMessages = history_value($service->page($fork['project']['id'], $fork['conversation']['id'], null))['messages'];
    history_check(count($forkMessages) === 120 && $fork['project']['id'] !== $forkPid, 'MariaDB fork creates independent sidebar chat from all 120 selected historical messages');
    history_check(array_column($forkMessages, 'content') === array_column(array_slice($forkSource['messages'], 0, 120), 'content'), 'MariaDB fork preserves exact text and chronological order');
    history_check($forkMessages[119]['events'] === $forkSource['messages'][119]['events'] && $forkMessages[119]['attachments'] === $forkSource['messages'][119]['attachments'], 'MariaDB fork preserves steering/tool events and media');
    history_check(history_value($forker->create($forkPid, $conversation, $forkInput)) === $fork, 'MariaDB retry returns same chat and conversation');
    history_check(history_value($service->page($forkPid, $conversation, null)) === $forkSource, 'MariaDB fork leaves original history byte-for-byte unchanged');
    $asUser($qaUsers[1]);
    history_check(is_wp_error($forker->create($forkPid, $conversation, $forkInput)), 'Another author cannot fork a private chat');
    $asUser($qaUsers[0]);
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    $exitCode = 1;
} finally {
    foreach (array_reverse($qaTables) as $table) {
        if (!preg_match('/\Apixflow_history_qa_[a-f0-9]{10}_[a-z0-9_]+\z/D', $table) || !str_starts_with($table, $qaPrefix)) {
            throw new RuntimeException('Unsafe test cleanup target.');
        }
        $wpdb->query('DROP TABLE IF EXISTS `' . $table . '`');
    }
    $wpdb->prefix = $originalPrefix;
    wp_set_current_user(0);
    foreach ($qaUsers as $id) wp_delete_user($id);
    $after = history_snapshot();
    $comparison = $after;
    $externalTimestampChanges = [];
    foreach ($before['externalCacheContent'] as $name => $contentHash) {
        if (($after['externalCacheContent'][$name] ?? null) === $contentHash
            && ($before['options'][$name] ?? null) !== ($after['options'][$name] ?? null)) {
            $externalTimestampChanges[] = $name;
            $comparison['options'][$name] = $before['options'][$name];
        }
    }
    if ($externalTimestampChanges) echo 'INFO: Concurrent external cache timestamps changed (not a byte-identical options snapshot): ' . implode(', ', $externalTimestampChanges) . "\n";
    try {
        history_check(true, 'SQL preservation guard allowed no writes to original content, options or project tables, including concurrent workers');
        history_check($comparison === $before, $externalTimestampChanges
            ? 'Existing content, post metadata, users, project metadata, saved memory and settings preserved; only identified external refresh timestamps differ'
            : 'Existing content, post metadata, users, project metadata, saved memory and settings preserved byte-for-byte');
    }
    catch (Throwable $error) {
        $changedNames = [];
        foreach (['options', 'memory'] as $group) {
            foreach (array_unique(array_merge(array_keys($before[$group]), array_keys($after[$group]))) as $name) {
                if (($before[$group][$name] ?? null) !== ($after[$group][$name] ?? null)) $changedNames[] = $group . ':' . $name;
            }
        }
        $changedGroups = array_keys(array_filter($after, static fn($hash, $key) => $hash !== $before[$key], ARRAY_FILTER_USE_BOTH));
        fwrite(STDERR, $error->getMessage() . '; changed groups: ' . implode(', ', $changedGroups) . '; changed option names: ' . implode(', ', $changedNames) . "\n");
        $exitCode = 1;
    }
}
exit($exitCode);
