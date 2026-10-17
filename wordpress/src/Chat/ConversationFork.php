<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;

use PixflowDesign\WordPress\Projects\ProjectRepository;
use PixflowDesign\WordPress\Projects\ProjectPermission;
use PixflowDesign\WordPress\Od\ProjectAdapter;

if (!defined('ABSPATH')) exit;

/** A fork is an atomic, private, independent chat; it never mutates the source. */
final class ConversationFork
{
    public function __construct(private readonly HistoryRepository $history = new HistoryRepository(), private readonly ProjectRepository $projects = new ProjectRepository()) {}

    public function create(string $projectId, string $conversationId, array $input): array|\WP_Error
    {
        $point = $input['forkAfterMessageId'] ?? null;
        $request = $input['requestId'] ?? null;
        if (!is_string($point) || $point === '' || strlen($point) > 191 || !is_string($request) || !preg_match('/\A[A-Za-z0-9_-]{16,128}\z/D', $request)) return new \WP_Error('pixflow_fork_invalid', 'A saved reply and valid request identifier are required.', ['status' => 400]);
        $source = $this->projects->find_by_uuid($projectId);
        if (!$source || ($source['status'] ?? '') === 'deleted') return new \WP_Error('pixflow_fork_missing', 'Original chat not found.', ['status' => 404]);
        if (get_current_user_id() < 1 || !current_user_can('edit_posts') || !(new ProjectPermission())->can_view($source)) return new \WP_Error('pixflow_fork_forbidden', 'You cannot access the original chat.', ['status' => 403]);
        $known = $this->history->conversation($projectId, $conversationId);
        $state = $source['metadata']['odState'] ?? [];
        if (!$known && !in_array($conversationId, array_column($state['conversations'] ?? [], 'id'), true) && !array_key_exists($conversationId, $state['messages'] ?? [])) return new \WP_Error('pixflow_fork_missing', 'Original conversation not found.', ['status' => 404]);
        $page = (new HistoryService())->page($projectId, $conversationId, null, '', false);
        if (is_wp_error($page)) return $page;
        $index = array_search($point, array_column($page['messages'], 'id'), true);
        if ($index === false || ($page['messages'][$index]['role'] ?? '') !== 'assistant') return new \WP_Error('pixflow_fork_point', 'The selected reply is not saved. Save chat history and retry.', ['status' => 409]);
        if (in_array($page['messages'][$index]['runStatus'] ?? '', ['running', 'queued'], true) || ($page['messages'][$index]['status'] ?? '') === 'streaming') return new \WP_Error('pixflow_fork_running', 'Wait for this reply to finish before continuing it in another chat.', ['status' => 409]);
        $messages = array_slice($page['messages'], 0, $index + 1);
        $identity = wp_json_encode([$projectId, $conversationId, $point]);
        $key = hash('sha256', 'fork:' . get_current_user_id() . ':' . $request);
        try {
            return $this->history->locked($key, function () use ($source, $projectId, $conversationId, $point, $request, $input, $messages, $identity, $key) {
                $existing = $this->history->binding($key);
                if ($existing) {
                    if ($existing['session_key'] !== $identity) return new \WP_Error('pixflow_fork_conflict', 'This retry belongs to a different fork.', ['status' => 409]);
                    $target = $this->projects->find_by_uuid($existing['project_uuid']);
                    $record = $this->history->conversation($existing['project_uuid'], $existing['conversation_id']);
                    if (!$target || ($target['status'] ?? '') === 'deleted' || !$record || (int) $record['deleted']) return new \WP_Error('pixflow_fork_deleted', 'This fork was deleted.', ['status' => 410]);
                    return $this->response($target, $record);
                }
                $origin = ['projectId' => $projectId, 'conversationId' => $conversationId, 'messageId' => $point, 'title' => $source['title'], 'requestId' => $request];
                $sourceMeta = $source['metadata'] ?? [];
                $metadata = array_intersect_key($sourceMeta, array_flip(['kind', 'skillId', 'designSystemId', 'customInstructions']));
                $metadata['kind'] ??= 'website';
                $metadata['forkedFrom'] = $origin;
                $now = (int) round(microtime(true) * 1000);
                $cid = wp_generate_uuid4();
                $title = mb_substr(sanitize_text_field((string) ($input['title'] ?? ($source['title'] . ' fork'))), 0, 191);
                $mode = in_array($input['sessionMode'] ?? '', ['design', 'chat', 'plan'], true) ? $input['sessionMode'] : 'design';
                $metadata['conversationMode'] = $mode;
                $metadata['odState'] = ['conversations' => [['id' => $cid, 'title' => $title, 'sessionMode' => $mode, 'createdAt' => $now, 'updatedAt' => $now]], 'messages' => [], 'comments' => [], 'tabs' => ['tabs' => [], 'active' => null]];
                $target = $this->projects->create(['title' => $title, 'kind' => 'chat', 'visibility' => 'private', 'owner_user_id' => get_current_user_id(), 'metadata' => $metadata]);
                if (empty($target['uuid'])) throw new \RuntimeException('The fork could not be created.');
                $record = $this->history->seed_fork($target['uuid'], $cid, $title, $now, $messages, $projectId, $conversationId);
                $this->history->bind($key, get_current_user_id(), $target['uuid'], $cid, $identity);
                return $this->response($target, $record);
            });
        } catch (\Throwable $error) { return new \WP_Error('pixflow_fork_save', 'The fork could not be saved. Retry safely; your original chat is unchanged.', ['status' => 500]); }
    }

    private function response(array $project, array $record): array
    {
        $mode = $project['metadata']['conversationMode'] ?? 'design';
        return ['project' => (new ProjectAdapter())->to_app_project($project), 'conversation' => [
            'id' => $record['conversation_id'], 'projectId' => $project['uuid'], 'title' => $project['title'], 'sessionMode' => $mode,
            'messageCount' => $this->history->count_messages($project['uuid'], $record['conversation_id']), 'createdAt' => (int) $record['created_at'], 'updatedAt' => (int) $record['updated_at'],
            'forkedFrom' => $project['metadata']['forkedFrom'],
        ]];
    }
}
