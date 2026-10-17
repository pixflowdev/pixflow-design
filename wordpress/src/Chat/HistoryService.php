<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;

use PixflowDesign\WordPress\Projects\ProjectRepository;
use PixflowDesign\WordPress\Projects\ProjectPermission;
use PixflowDesign\WordPress\Database\Table;

if (!defined('ABSPATH')) exit;

/** Shared persistence surface. Free access is owner-only and grants no Workspace access. */
final class HistoryService
{
    public function __construct(
        private readonly HistoryRepository $history = new HistoryRepository(),
        private readonly ProjectRepository $projects = new ProjectRepository(),
        private readonly ProjectPermission $permissions = new ProjectPermission(),
    ) {}

    private function project(string $projectId, bool $ownerOnly, bool $write): array|\WP_Error
    {
        global $wpdb;
        // Once migrated, reading a message page must not decode the old full transcript.
        $project = $wpdb->get_row($wpdb->prepare('SELECT id, uuid, title, owner_user_id, visibility, status FROM ' . Table::name(Table::PROJECTS) . ' WHERE uuid = %s', $projectId), ARRAY_A);
        if (is_array($project)) $project['ownerUserId'] = (int) $project['owner_user_id'];
        if (!$project || in_array($project['status'] ?? '', ['deleted'], true)) return new \WP_Error('pixflow_history_not_found', 'Chat not found.', ['status' => 404]);
        $owns = (int) ($project['ownerUserId'] ?? 0) === get_current_user_id();
        $sharedAccess = !$ownerOnly || (!$owns && \PixflowDesign\WordPress\Modules\WorkspaceAccess::available());
        $allowed = $ownerOnly && $owns;
        if (!$allowed && $sharedAccess) $allowed = $write ? $this->permissions->can_edit($project) : $this->permissions->can_view($project);
        if (!current_user_can('edit_posts') || !$allowed) {
            return new \WP_Error('pixflow_history_forbidden', 'You cannot access this chat.', ['status' => 403]);
        }
        return $project;
    }

    private function prepare(string $project, string $conversation, bool $ownerOnly, bool $write): array|\WP_Error
    {
        if ($conversation === '' || strlen($conversation) > 191) return new \WP_Error('pixflow_history_invalid', 'Invalid conversation identifier.', ['status' => 400]);
        $record = $this->project($project, $ownerOnly, $write);
        if (is_wp_error($record)) return $record;
        $existing = $this->history->conversation($project, $conversation);
        if ($existing && (int) $existing['deleted']) return new \WP_Error('pixflow_history_deleted', 'This conversation was deleted.', ['status' => 410]);
        if ($existing && (int) $existing['migrated']) return $existing;
        $record = $this->projects->find_by_uuid($project);
        if (!$record) return new \WP_Error('pixflow_history_not_found', 'Chat not found.', ['status' => 404]);
        return $this->history->migrate($record, $conversation);
    }

    public function resolve(array $input): array|\WP_Error
    {
        if (!current_user_can('edit_posts') || get_current_user_id() < 1) return new \WP_Error('pixflow_history_forbidden', 'Sign in to save chat history.', ['status' => 403]);
        $session = (string) ($input['sessionKey'] ?? '');
        $projectId = (string) ($input['projectId'] ?? '');
        $conversation = (string) ($input['conversationId'] ?? '');
        if ($projectId !== '') {
            if ($conversation === '') return new \WP_Error('pixflow_history_invalid', 'A conversation is required.', ['status' => 400]);
            if (($input['create'] ?? true) === false) {
                $project = $this->project($projectId, true, false);
                if (is_wp_error($project)) return $project;
                $saved = $this->history->conversation($projectId, $conversation);
                if (!$saved) return ['projectId' => null, 'conversationId' => null];
                if ((int) $saved['deleted']) return new \WP_Error('pixflow_history_deleted', 'This conversation was deleted.', ['status' => 410]);
                return ['projectId' => $projectId, 'conversationId' => $conversation];
            }
            $prepared = $this->prepare($projectId, $conversation, true, true);
            return is_wp_error($prepared) ? $prepared : ['projectId' => $projectId, 'conversationId' => $conversation];
        }
        if ($session === '' || strlen($session) > 1000) return new \WP_Error('pixflow_history_invalid', 'A valid session key is required.', ['status' => 400]);
        $owner = get_current_user_id();
        $key = hash('sha256', $owner . "\0" . $session);
        if (($input['create'] ?? true) === false) {
            $saved = $this->history->binding($key);
            if (!$saved) return ['projectId' => null, 'conversationId' => null];
            return $this->resolve(['projectId' => $saved['project_uuid'], 'conversationId' => $saved['conversation_id'], 'create' => false]);
        }
        $binding = $this->history->locked('binding:' . $key, function () use ($key, $owner, $input, $session) {
            $saved = $this->history->binding($key);
            if ($saved) return ['projectId' => $saved['project_uuid'], 'conversationId' => $saved['conversation_id']];
            $title = mb_substr(sanitize_text_field((string) ($input['title'] ?? 'New chat')), 0, 191);
            $project = $this->projects->create(['title' => $title ?: 'New chat', 'kind' => 'chat', 'visibility' => 'private', 'owner_user_id' => $owner]);
            if (empty($project['uuid'])) throw new \RuntimeException('Chat could not be created. Please retry.');
            $conversationId = 'wp-conversation-' . $project['uuid'];
            $this->history->bind($key, $owner, $project['uuid'], $conversationId, $session);
            return ['projectId' => $project['uuid'], 'conversationId' => $conversationId];
        });
        if (is_wp_error($binding)) return $binding;
        $prepared = $this->prepare($binding['projectId'], $binding['conversationId'], true, true);
        return is_wp_error($prepared) ? $prepared : $binding;
    }

    public function owned_conversations(int $limit = 50, string $before = ''): array|\WP_Error
    {
        if (!current_user_can('edit_posts') || get_current_user_id() < 1) return new \WP_Error('pixflow_history_forbidden', 'Sign in to read chat history.', ['status' => 403]);
        return $this->history->owned_conversations(get_current_user_id(), $limit, $before);
    }

    public function page(string $project, string $conversation, ?int $limit = 50, string $before = '', bool $ownerOnly = true): array|\WP_Error
    {
        $prepared = $this->prepare($project, $conversation, $ownerOnly, false);
        return is_wp_error($prepared) ? $prepared : $this->history->page($project, $conversation, $limit, $before);
    }

    public function export_page(string $project, string $conversation, string $cursor = '', int $limit = 100): array|\WP_Error
    {
        $prepared = $this->prepare($project, $conversation, true, false);
        return is_wp_error($prepared) ? $prepared : (new HistoryArchive($this->history))->export_page($project, $conversation, $cursor, $limit);
    }

    public function storage_usage(): array|\WP_Error
    {
        if (!current_user_can('edit_posts') || get_current_user_id() < 1) return new \WP_Error('pixflow_history_forbidden', 'Sign in to view chat storage.', ['status' => 403]);
        return (new HistoryArchive($this->history))->storage_usage(get_current_user_id());
    }

    public function write(string $project, string $conversation, array $message, bool $ownerOnly = true, bool $importOnly = false): array|\WP_Error
    {
        if (!is_string($message['id'] ?? null) || $message['id'] === '' || strlen($message['id']) > 191) return new \WP_Error('pixflow_history_invalid', 'Invalid message identifier.', ['status' => 400]);
        $prepared = $this->prepare($project, $conversation, $ownerOnly, true);
        return is_wp_error($prepared) ? $prepared : $this->history->write($project, $conversation, $message, $importOnly);
    }

    public function remove(string $project, string $conversation, string $message, bool $ownerOnly = true): array|\WP_Error
    {
        $prepared = $this->prepare($project, $conversation, $ownerOnly, true);
        if (is_wp_error($prepared)) return $prepared;
        $result = $this->history->remove($project, $conversation, $message);
        if (!is_wp_error($result)) (new WorkingContextRepository())->forget($project, $conversation);
        return $result;
    }

    public function remove_conversation(string $project, string $conversation, bool $ownerOnly = true): array|\WP_Error
    {
        $prepared = $this->prepare($project, $conversation, $ownerOnly, true);
        if (is_wp_error($prepared)) return $prepared->get_error_code() === 'pixflow_history_deleted' ? ['ok' => true] : $prepared;
        $result = $this->history->remove($project, $conversation);
        if (!is_wp_error($result)) (new WorkingContextRepository())->forget($project, $conversation);
        return $result;
    }

    public function rename(string $project, string $conversation, string $title, bool $ownerOnly = true): array|\WP_Error
    {
        $prepared = $this->prepare($project, $conversation, $ownerOnly, true);
        return is_wp_error($prepared) ? $prepared : $this->history->rename($project, $conversation, $title);
    }

    /** Overlay durable counts without rewriting the legacy backup. */
    public function merge_conversations(string $project, array $legacy): array
    {
        $items = [];
        foreach ($legacy as $item) if (is_array($item) && is_string($item['id'] ?? null)) $items[$item['id']] = $item;
        foreach ($this->history->conversations($project) as $row) {
            $id = $row['conversation_id'];
            if ((int) $row['deleted']) { unset($items[$id]); continue; }
            $item = $items[$id] ?? ['id' => $id, 'projectId' => $project, 'title' => $row['title'], 'sessionMode' => 'design', 'createdAt' => (int) $row['created_at']];
            $item['messageCount'] = (int) $row['message_count'];
            $item['updatedAt'] = max((int) ($item['updatedAt'] ?? 0), (int) $row['updated_at']);
            $items[$id] = $item;
        }
        $items = array_values($items);
        usort($items, static fn(array $a, array $b): int => ($b['updatedAt'] ?? 0) <=> ($a['updatedAt'] ?? 0));
        return $items;
    }
}
