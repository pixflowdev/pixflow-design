<?php
declare(strict_types=1);
namespace {
    define('ABSPATH', __DIR__);
    $user = 1; $blog = 1; $meta = []; $pending = []; $history = []; $allowed = true;
    function wp_json_encode(mixed $value): string { return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE); }
    function get_current_user_id(): int { return $GLOBALS['user']; }
    function get_current_blog_id(): int { return $GLOBALS['blog']; }
    function get_user_meta($id, $key, $single): mixed { return $GLOBALS['meta'][$id][$key] ?? []; }
    function update_user_meta($id, $key, $value): bool { $GLOBALS['meta'][$id][$key] = $value; return true; }
    function delete_metadata($type, $id, $key, $value, $all): bool { foreach ($GLOBALS['meta'] as &$values) unset($values[$key]); return true; }
    function set_transient($key, $value, $ttl): bool { $GLOBALS['pending'][$key] = $value; return true; }
    function get_transient($key): mixed { return $GLOBALS['pending'][$key] ?? false; }
    function delete_transient($key): bool { unset($GLOBALS['pending'][$key]); return true; }
    function get_users($args): array { return array_keys(array_filter($GLOBALS['meta'], fn($values) => isset($values[$args['meta_key']]))); }
    function is_wp_error($value): bool { return $value instanceof \WP_Error; }
    class WP_Error { public function get_error_message(): string { return 'Forbidden'; } }
    function check(bool $result, string $label): void { if (!$result) throw new \RuntimeException($label); $GLOBALS['checks'] = ($GLOBALS['checks'] ?? 0) + 1; }
    function rejects(callable $fn, string $label): void { try { $fn(); } catch (\RuntimeException|\InvalidArgumentException $error) { check(true, $label); return; } throw new \RuntimeException($label); }
}
namespace PixflowDesign\WordPress\Chat {
    class HistoryService {
        public function page(string $project, string $conversation, ?int $limit): array|\WP_Error {
            return $GLOBALS['allowed'] ? ['messages' => $GLOBALS['history']] : new \WP_Error();
        }
    }
    class HistoryRepository {
        public static function key(string $project, string $conversation): string { return hash('sha256', $project . "\0" . $conversation); }
        public function locked(string $identity, callable $fn): mixed { return $fn(); }
    }
}
namespace {
    require dirname(__DIR__) . '/src/Chat/ContextBudget.php';
    require dirname(__DIR__) . '/src/Chat/WorkingContext.php';
    require dirname(__DIR__) . '/src/Chat/WorkingContextRepository.php';
    require dirname(__DIR__) . '/src/Chat/WorkingContextService.php';
    require dirname(__DIR__) . '/src/Chat/RunWorkingContext.php';
    use PixflowDesign\WordPress\Chat\WorkingContext as Context;
    use PixflowDesign\WordPress\Chat\WorkingContextRepository as Repository;
    use PixflowDesign\WordPress\Chat\WorkingContextService as Service;

    $nativeSteer = [['role' => 'assistant', 'content' => 'Full answer. Next answer.', 'events' => [
        ['kind' => 'assistant_message_boundary', 'phase' => 'started', 'messageId' => 'reply', 'contentOffset' => 0],
        ['kind' => 'steering_message', 'id' => 'one', 'text' => 'Use blue', 'contentOffset' => 5],
        ['kind' => 'assistant_message_boundary', 'phase' => 'completed', 'messageId' => 'reply', 'contentOffset' => 12],
    ]]];
    check(Context::project($nativeSteer) === [['role' => 'assistant', 'content' => 'Full answer.'], ['role' => 'user', 'content' => 'Use blue'], ['role' => 'assistant', 'content' => ' Next answer.']], 'Working context uses the same completed native message boundary as the visible steering timeline');

    $history = [];
    for ($i = 0; $i < 50; $i++) $history[] = ['id' => 'm-' . $i, 'role' => $i % 2 ? 'assistant' : 'user', 'content' => 'Message ' . $i . ' ' . str_repeat('Useful context. ', 150), 'runStatus' => $i % 2 ? 'succeeded' : null, 'settings' => ['untouched' => true]];
    $before = serialize($history);
    $compactCalls = [];
    Context::summarize([['role' => 'user', 'content' => str_repeat('x', 30000)]], '', static function ($system, $text) use (&$compactCalls) {
        $compactCalls[] = $text;
        return 'All relevant facts retained.';
    });
    check(count($compactCalls) === 1, 'Short continuation notes leave room for a larger fragment without another sequential provider request');
    $unicodeSource = [['role' => 'user', 'content' => str_repeat('界🙂', 15000)]];
    $fragments = []; $lengths = [];
    Context::summarize($unicodeSource, str_repeat('n', Context::SUMMARY_BYTES), static function ($system, $text) use (&$fragments, &$lengths) {
        $lengths[] = strlen($text);
        $marker = "Next consecutive transcript fragment (JSON may continue in the next fragment):\n";
        $fragments[] = substr($text, strpos($text, $marker) + strlen($marker));
        return 'Short note';
    });
    check(implode('', $fragments) === wp_json_encode(Context::project($unicodeSource)), 'Adaptive fragments preserve every UTF-8 transcript byte in order');
    check(max($lengths) < 38000 && count(array_filter($fragments, fn($fragment) => preg_match('//u', $fragment) !== 1)) === 0, 'Adaptive fragments retain the existing total input budget and valid UTF-8 boundaries');
    $service = new Service(); $repository = new Repository(); $calls = [];
    $complete = static function (string $system, string $text) use (&$calls): string { $calls[] = [$system, $text]; return 'Preserved goal, corrections, completed work, assets and pending tasks.'; };
    $prepared = $service->prepare('project', 'chat', [], $complete);
    check($prepared['status'] === 'compacted' && $prepared['coveredMessages'] === 38, 'Old completed turns compact; last twelve raw messages remain');
    check(count($prepared['messages']) === 13, 'One note plus complete recent tail');
    check(count($calls) > 1 && max(array_map(fn($call) => strlen($call[1]), $calls)) < 38000, 'Huge histories summarized in bounded chunks');
    check($repository->read('project', 'chat') === [], 'Prepare/cancel cannot replace committed memory');
    check(serialize($history) === $before, 'Prepare preserves full transcript and arbitrary settings byte-for-byte');
    $committed = $service->commit('project', 'chat', $prepared['candidateId']);
    check($committed['status'] === 'compacted', 'Explicit successful acknowledgement commits');
    check($service->commit('project', 'chat', $prepared['candidateId'])['status'] === 'reused', 'Commit retry is idempotent');
    $calls = [];
    check($service->prepare('project', 'chat', [], $complete)['status'] === 'reused' && !$calls, 'Valid checkpoint reused without provider charge');

    $user = 2;
    check($repository->read('project', 'chat') === [], 'Checkpoint is user-scoped');
    rejects(fn() => $service->commit('project', 'chat', $prepared['candidateId']), 'Candidate isolated from other users');
    $user = 1; $blog = 2;
    check($repository->read('project', 'chat') === [], 'Checkpoint is site-scoped in multisite');
    rejects(fn() => $service->commit('project', 'chat', $prepared['candidateId']), 'Candidate isolated from other sites');
    $blog = 1;
    rejects(fn() => $service->commit('other', 'chat', $prepared['candidateId']), 'Candidate isolated from other conversations');
    $allowed = false;
    rejects(fn() => $service->prepare('project', 'chat', [], $complete), 'Lost permission prevents context reads');
    rejects(fn() => $service->commit('project', 'chat', $prepared['candidateId']), 'Lost permission prevents commits');
    $allowed = true;

    $history[0]['content'] = 'Edited old instruction';
    $invalid = $service->prepare('project', 'chat', [], fn() => throw new \RuntimeException('SECRET error'));
    check($invalid['status'] === 'fallback' && $invalid['coveredMessages'] === 0 && count($invalid['messages']) === 50, 'Source mutation invalidates checkpoint; failed summary preserves entire history');
    check(!str_contains(json_encode($invalid), 'SECRET'), 'Upstream errors cannot leak credentials or source data');
    check($service->commit('project', 'chat', $prepared['candidateId'])['reason'] === 'history_changed', 'Stale candidate cannot replace changed source');
    $originalCheckpoint = $repository->read('project', 'chat');
    $empty = $service->prepare('project', 'chat', [], fn() => '');
    check($empty['status'] === 'fallback' && $repository->read('project', 'chat') === $originalCheckpoint, 'Empty response retains prior committed checkpoint');
    $oversized = $service->prepare('project', 'chat', [], fn() => str_repeat('x', Context::SUMMARY_BYTES + 1));
    check($oversized['status'] === 'fallback', 'Oversized response never gets silently truncated');
    $stale = $service->prepare('project', 'chat', [], function () { $GLOBALS['history'][0]['content'] = 'Concurrent source edit'; return 'A summary'; });
    check($stale['status'] === 'fallback' && $stale['reason'] === 'history_changed' && !isset($stale['candidateId']), 'Concurrent mutation during generation rejects candidate');

    $one = $service->prepare('project', 'chat', [], fn() => 'Summary one');
    $two = $service->prepare('project', 'chat', [], fn() => 'Summary two');
    $service->commit('project', 'chat', $two['candidateId']);
    check($service->commit('project', 'chat', $one['candidateId'])['reason'] === 'checkpoint_changed', 'Compare-and-swap prevents late candidate overwriting another tab');
    check($repository->read('project', 'chat')['summary'] === 'Summary two', 'Winning committed note remains');

    $cropped = $service->prepare('project', 'chat', ['throughMessageId' => 'm-19'], $complete);
    check(count($cropped['messages']) === 20 && str_starts_with($cropped['messages'][19]['content'], $history[19]['content']), 'Current prompt and streaming placeholder excluded by authoritative saved boundary');
    check($service->prepare('project', 'chat', ['throughMessageId' => ''], $complete)['messages'] === [], 'First turn has no phantom context');
    rejects(fn() => $service->prepare('project', 'chat', ['throughMessageId' => 'missing'], $complete), 'Missing unsaved boundary cannot silently drop context');
    $barrier = $history; $barrier[5]['runStatus'] = 'running';
    check(Context::cutoff($barrier) === 4, 'Running turn is never split or summarized');
    $barrier[5]['runStatus'] = 'failed';
    check(Context::cutoff($barrier) === 4, 'Failed uncertain execution remains uncompressed');
    $barrier[5]['runStatus'] = 'canceled';
    check(Context::cutoff($barrier) === 4, 'Canceled execution remains uncompressed');
    $barrier[5]['runStatus'] = 'succeeded'; $barrier[5]['resultDeliveryState'] = 'uncertain';
    check(Context::cutoff($barrier) === 4, 'Unknown delivery remains uncompressed');
    unset($barrier[5]['resultDeliveryState']); $barrier[5]['runStatus'] = 'failed'; $barrier[5]['endedAt'] = 123;
    check(Context::cutoff($barrier) === 38 && str_contains(Context::project([$barrier[5]])[0]['content'], 'Recorded execution outcome: failed'), 'Terminal failures can be summarized faithfully without blocking all later history');

    $steering = Context::project([['role' => 'assistant', 'content' => 'Hello 🎨 world', 'events' => [
        ['kind' => 'steering_message', 'id' => 'steer', 'contentOffset' => 8, 'text' => 'Use green', 'attachments' => [['path' => 'leaf.png', 'base64' => 'private-image-bytes']]],
        ['kind' => 'steering_message', 'id' => 'steer', 'contentOffset' => 8, 'text' => 'Use green'],
    ]]]);
    check($steering[0]['content'] === 'Hello 🎨' && $steering[2]['content'] === ' world', 'UTF-16 steering boundary preserves astral Unicode');
    check(count($steering) === 3 && str_contains($steering[1]['content'], 'Use green'), 'Accepted steering is chronological and deduplicated');
    check(str_contains($steering[1]['content'], 'leaf.png') && !str_contains($steering[1]['content'], 'private-image-bytes'), 'Attachment locator retained without binary payload');
    $ascii = Context::project([['role' => 'assistant', 'content' => 'abcdefghij', 'events' => [['kind' => 'steering_message', 'id' => 'x', 'contentOffset' => 8, 'text' => 'Change']]]]);
    check($ascii[0]['content'] === 'abcdefgh' && $ascii[2]['content'] === 'ij', 'ASCII steering offsets match the visible transcript');
    $projected = Context::project([['role' => 'user', 'content' => 'Fix this', 'commentAttachments' => [['elementId' => 'hero', 'filePath' => 'index.html', 'comment' => 'Use green', 'htmlHint' => 'unneeded big HTML']]]]);
    check(str_contains($projected[0]['content'], 'hero') && !str_contains($projected[0]['content'], 'unneeded big HTML'), 'Historical annotation targets remain locatable');
    $toolEvidence = Context::project([['role' => 'assistant', 'content' => 'Inspecting', 'runStatus' => 'failed', 'events' => [
        ['kind' => 'tool_use', 'id' => 'tool-1', 'name' => 'bricks.save', 'input' => ['postId' => 99, 'apiKey' => 'secret-key']],
        ['kind' => 'tool_result', 'toolUseId' => 'tool-1', 'content' => '{"pending":true}'],
    ]]]);
    check(str_contains($toolEvidence[0]['content'], 'bricks.save') && str_contains($toolEvidence[0]['content'], 'pending; inspect') && !str_contains($toolEvidence[0]['content'], 'secret-key'), 'Execution facts preserve pending IDs without raw credential-bearing inputs');
    $run = ['messages' => [['role' => 'user', 'content' => 'Keep my exact request']], 'turns' => [
        ['type' => 'reasoning', 'encrypted_content' => 'opaque-secret'],
        ['type' => 'function_call', 'call_id' => 'tool-1', 'name' => 'site_tool', 'arguments' => '{"name":"bricks.read","arguments":{}}'],
    ], 'results' => [['id' => 'tool-1', 'result' => ['saved' => true, 'postId' => 99]]]];
    $originalRun = serialize($run); $seen = '';
    $runResult = $service->run('project', 'chat', $run, function ($system, $text) use (&$seen) { $seen .= $text; return 'Saved page 99; preserve request.'; });
    check($runResult['status'] === 'compacted' && !str_contains($seen, 'opaque-secret') && str_contains($seen, 'postId'), 'In-run tool-free summary excludes private reasoning and retains completion facts');
    check(serialize($run) === $originalRun, 'Original opaque checkpoint remains intact until browser acknowledgement');
    $withInstructions=$run;
    array_unshift($withInstructions['turns'],['role'=>'system','content'=>'STATIC-CATALOGUE-NOT-HISTORY']);
    $seen='';
    $service->run('project','chat',$withInstructions,function($system,$text)use(&$seen){$seen.=$text;return 'Keep the request and recorded result.';});
    check(!str_contains($seen,'STATIC-CATALOGUE-NOT-HISTORY'),'Run compaction excludes static provider instructions that are supplied again');
    check($service->run('project', 'chat', array_replace($run, ['results' => []]), $complete)['status'] === 'fallback', 'Unmatched native tool pair cannot compact');
    check($service->run('project', 'chat', $run + ['inFlight' => ['id' => 'one']], $complete)['status'] === 'fallback', 'In-flight tools prevent compaction');
    check($service->run('project', 'chat', array_replace($run, ['results' => [['id' => 'tool-1', 'result' => ['pending' => true]]]]), $complete)['status'] === 'fallback', 'Pending completed-tool responses remain inspect-first');
    check($service->run('project', 'chat', $run, fn() => throw new \RuntimeException('Secret upstream failure')) === ['status' => 'fallback', 'reason' => 'compaction_unavailable'], 'Run compaction failure preserves source without leaking details');
    foreach ([
        'anthropic' => [['role'=>'assistant','content'=>[['type'=>'thinking','thinking'=>'private-thought'],['type'=>'tool_use','id'=>'a','name'=>'site_tool','input'=>['name'=>'bricks.read']]]]],
        'google' => [['role'=>'model','parts'=>[['thought'=>true,'text'=>'private-thought'],['thoughtSignature'=>'opaque-private','functionCall'=>['name'=>'site_tool','args'=>['name'=>'bricks.read']]]]]],
        'openai' => [['role'=>'assistant','tool_calls'=>[['id'=>'a','function'=>['name'=>'site_tool','arguments'=>'{}']]]]],
        'ollama' => [['role'=>'assistant','tool_calls'=>[['function'=>['name'=>'site_tool','arguments'=>[]]]]]],
    ] as $protocol=>$turns) {
        $id = $protocol==='google' ? 'google-0' : ($protocol==='ollama' ? 'call-0' : 'a');
        $seen = '';
        $result = $service->run('project', 'chat', ['turns'=>$turns, 'results'=>[['id'=>$id,'result'=>['ok'=>true]]]], function($system,$text) use (&$seen) { $seen=$text; return 'Complete tool result'; });
        check($result['status']==='compacted' && !str_contains($seen,'private-thought') && !str_contains($seen,'opaque-private'), $protocol.' completed native pairs compact without hidden reasoning');
        check($service->run('project', 'chat', ['turns'=>$turns,'results'=>[]], $complete)['status']==='fallback', $protocol.' unmatched native calls remain intact');
    }
    $missingGoogle = [['role'=>'model','parts'=>[['functionCall'=>['name'=>'site_tool']],['functionCall'=>['name'=>'site_tool']]]]];
    check($service->run('project','chat',['turns'=>$missingGoogle,'results'=>[['id'=>'google-0','result'=>['ok'=>true]]]],$complete)['status']==='fallback','Multiple Gemini calls require every result, not only one');
    $pendingBeforeDelete = $repository->candidate('project', 'chat', ['summary' => 'Private deleted facts'], '');
    $user = 2;
    $sharedCandidate = $repository->candidate('project', 'chat', ['summary' => 'Other reader same deleted source'], '');
    $user = 1;
    $otherChat = $repository->candidate('project', 'other-chat', ['summary' => 'Keep'], '');
    $blog = 2;
    $otherSite = $repository->candidate('project', 'chat', ['summary' => 'Keep'], '');
    $blog = 1;
    $indexKey = 'pixflow_design_working_context_1_' . \PixflowDesign\WordPress\Chat\HistoryRepository::key('project', 'chat') . '_candidates';
    $meta[1][$indexKey][$otherChat] = time() + 600;
    $meta[1][$indexKey][$otherSite] = time() + 600;
    $repository->forget('project', 'chat');
    check($repository->read('project', 'chat') === [], 'Deleting source removes derived private facts');
    check(!isset($pending['pixflow_context_candidate_' . $pendingBeforeDelete]) && !isset($pending['pixflow_context_candidate_' . $sharedCandidate]), 'Deleting source physically removes all reader candidates without waiting for cron');
    rejects(fn() => $repository->pending('project', 'chat', $pendingBeforeDelete), 'Deleted candidate cannot be replayed');
    check(isset($pending['pixflow_context_candidate_' . $otherChat], $pending['pixflow_context_candidate_' . $otherSite]), 'Even corrupted index entries cannot delete another chat or site candidate');
    check(!isset($meta[1][$indexKey]) && !isset($meta[2][$indexKey]), 'Deletion removes candidate indexes for every source reader');
    $bounded = [];
    for ($i = 0; $i < 34; $i++) $bounded[] = $repository->candidate('bounded', 'chat', [], '');
    check(!isset($pending['pixflow_context_candidate_' . $bounded[0]]) && !isset($pending['pixflow_context_candidate_' . $bounded[1]]) && isset($pending['pixflow_context_candidate_' . $bounded[33]]), 'Abandoned preparations are bounded to 32 candidates per owner and chat');
    $boundedKey = 'pixflow_design_working_context_1_' . \PixflowDesign\WordPress\Chat\HistoryRepository::key('bounded', 'chat') . '_candidates';
    $meta[1][$boundedKey][$bounded[2]] = time() - 1;
    $repository->candidate('bounded', 'chat', [], '');
    check(!isset($pending['pixflow_context_candidate_' . $bounded[2]]), 'Expired candidates are physically removed when the index is renewed');
    $raw = str_repeat('{"value":"quoted \\"text\\""}', 1200);
    $seenFragments = [];
    Context::summarizeText($raw, '', function($system, $text) use (&$seenFragments) {
        $seenFragments[] = substr($text, strpos($text, ":\n", strpos($text, "Next consecutive transcript fragment")) + 2);
        return 'Bounded continuation';
    });
    check(implode('', $seenFragments) === $raw, 'Run summarization consumes exact evidence without a second JSON encoding');
    check(count($seenFragments) === 1, 'Quote-heavy run evidence fits one existing-budget call');
    $legacyCalls = 0;
    Context::summarize([['role'=>'user','content'=>$raw]], '', function() use (&$legacyCalls) { $legacyCalls++; return 'Bounded continuation'; });
    check($legacyCalls > count($seenFragments), 'Avoiding double encoding removes a sequential summary call without increasing the budget');
    $history=[];
    for($i=0;$i<40;$i++)$history[]=['id'=>'barrier-'.$i,'role'=>$i%2?'assistant':'user','content'=>str_repeat('Completed test context ',160),'status'=>$i%2?'complete':null];
    $history[1]['status']='streaming';$history[1]['content']='Unfinished operation; no save receipt.';
    $unchanged=serialize($history);$calls=[];
    $prepared=$service->prepare('protected-spans','chat',[], $complete);
    check($prepared['status']==='compacted' && $prepared['coveredMessages']===28,'Old unfinished reply does not block compaction of later completed exchanges');
    check(array_slice($prepared['messages'],1,2)===Context::project(array_slice($history,0,2)),'Unfinished exchange and its user request remain verbatim outside the summary');
    check(!str_contains(wp_json_encode($calls),'Unfinished operation'),'Unfinished evidence is never entrusted to the summarizer');
    $service->commit('protected-spans','chat',$prepared['candidateId']);$calls=[];
    check($service->prepare('protected-spans','chat',[],$complete)['status']==='reused' && !$calls,'Protected-span checkpoint is reused without repeated compaction');
    check(serialize($history)===$unchanged,'Protected-span compaction leaves all original history untouched');
    $checkpoint=$repository->read('protected-spans','chat');
    $missing=$checkpoint;unset($missing['preserved']);
    check(!Context::valid($missing,$history),'Checkpoint cannot omit protected unfinished exchanges');
    $altered=$checkpoint;$altered['preserved'][1]['content']='Claimed completion';
    check(!Context::valid($altered,$history),'Checkpoint cannot replace protected evidence with a completion claim');
    $history[1]['content'].=' A new live delta.';
    check(!Context::valid($repository->read('protected-spans','chat'),$history),'New delta invalidates the checkpoint instead of hiding ongoing work');
    $runEvidence = ['messages'=>[['role'=>'user','content'=>str_repeat('Completed evidence. ', 3000)]], 'turns'=>[], 'results'=>[]];
    $runCalls = [];
    $runResult = $service->run('project', 'chat', $runEvidence, function($system, $text) use (&$runCalls) { $runCalls[]=$text; return 'Complete bounded continuation.'; });
    check($runResult['status']==='compacted' && count($runCalls)===1, 'Medium completed run evidence should need one summary request');
    check(str_contains($runCalls[0], $runEvidence['messages'][0]['content']), 'Single run summary includes all evidence');
    $largeEvidence = str_repeat('Résumé — completed. ', 7000);
    $fragments = [];
    Context::summarizeText($largeEvidence, '', function($system, $text) use (&$fragments) {
        $fragment = explode("Next consecutive transcript fragment (JSON may continue in the next fragment):\n", $text, 2)[1];
        check(strlen($fragment) <= 64000 && preg_match('//u', $fragment), 'Run fragment is bounded and valid UTF-8');
        $fragments[] = $fragment;
        return 'Bounded continuation';
    }, 64000);
    check(count($fragments) > 1 && implode('', $fragments) === $largeEvidence, 'Large run evidence remains complete across bounded fragments');
    $history=[];
    for($i=0;$i<30;$i++) $history[]=['id'=>'budget-'.$i,'role'=>$i%2?'assistant':'user','content'=>str_repeat('Saved ordinary history. ',150)];
    $before=serialize($history);$calls=[];
    $current=['apiProtocol'=>'openai','baseUrl'=>'https://api.openai.com/v1','model'=>'gpt-6-luna'];
    check($service->prepare('model-budget','chat',$current,$complete)['status']==='unchanged' && !$calls,'Known model retains moderate history without summary');
    check(serialize($history)===$before,'Budget selection preserves authoritative history');
    $fragments=[];
    $text=str_repeat('Complete evidence. ',7000);
    Context::summarizeText($text,'',function($system,$body)use(&$fragments){$fragments[]=explode("Next consecutive transcript fragment (JSON may continue in the next fragment):\n",$body,2)[1];return 'Bounded note';},192000);
    check(count($fragments)===1 && implode('',$fragments)===$text,'Known model summary uses one bounded call without omitting source');
    echo $checks . " working-context preservation, concurrency, cancellation and projection checks passed.\n";
}
