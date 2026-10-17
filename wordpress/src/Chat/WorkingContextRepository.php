<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;
if (!defined('ABSPATH')) exit;

/** One bounded checkpoint per user/conversation; pending candidates expire automatically. */
final class WorkingContextRepository
{
    private function key(string $project, string $conversation): string
    {
        return 'pixflow_design_working_context_' . get_current_blog_id() . '_' . HistoryRepository::key($project, $conversation);
    }

    public function read(string $project, string $conversation): array
    {
        $value = get_user_meta(get_current_user_id(), $this->key($project, $conversation), true);
        return is_array($value) ? $value : [];
    }

    public function candidate(string $project, string $conversation, array $checkpoint, string $previousDigest, ?string $throughMessageId = null): string
    {
        // Called under the history lock. Index only random tokens, never private facts;
        // explicit source deletion can then erase candidates even with cron disabled.
        $indexKey = $this->key($project, $conversation) . '_candidates';
        $index = get_user_meta(get_current_user_id(), $indexKey, true);
        $index = is_array($index) ? $index : [];
        foreach ($index as $oldToken => $expires) {
            if ((int) $expires <= time()) {
                $this->erase_candidate($project, $conversation, (string) $oldToken, get_current_user_id());
                unset($index[$oldToken]);
            }
        }
        while (count($index) >= 32) {
            $oldToken = (string) array_key_first($index);
            $this->erase_candidate($project, $conversation, $oldToken, get_current_user_id());
            unset($index[$oldToken]);
        }
        $token = bin2hex(random_bytes(32));
        $index[$token] = time() + 600;
        if (!update_user_meta(get_current_user_id(), $indexKey, $index)
            && get_user_meta(get_current_user_id(), $indexKey, true) !== $index) {
            throw new \RuntimeException('The working context could not be prepared.');
        }
        if (!set_transient('pixflow_context_candidate_' . $token, [
            'userId' => get_current_user_id(), 'blogId' => get_current_blog_id(),
            'project' => $project, 'conversation' => $conversation,
            'checkpoint' => $checkpoint, 'previousDigest' => $previousDigest, 'throughMessageId' => $throughMessageId,
        ], 600)) throw new \RuntimeException('The working context could not be prepared.');
        return $token;
    }

    private function erase_candidate(string $project, string $conversation, string $token, int $owner): void
    {
        if (!preg_match('/\A[a-f0-9]{64}\z/D', $token)) return;
        $key = 'pixflow_context_candidate_' . $token;
        $value = get_transient($key);
        if ($value === false || (is_array($value) && ($value['userId'] ?? null) === $owner
            && ($value['blogId'] ?? null) === get_current_blog_id()
            && ($value['project'] ?? null) === $project && ($value['conversation'] ?? null) === $conversation)) {
            delete_transient($key);
        }
    }

    public function pending(string $project, string $conversation, string $token): array
    {
        if (!preg_match('/\A[a-f0-9]{64}\z/D', $token)) throw new \InvalidArgumentException('Invalid working context candidate.');
        $value = get_transient('pixflow_context_candidate_' . $token);
        if (!is_array($value) || $value['userId'] !== get_current_user_id() || $value['blogId'] !== get_current_blog_id()
            || $value['project'] !== $project || $value['conversation'] !== $conversation) {
            throw new \RuntimeException('The working context candidate expired or belongs to another chat. Please retry.');
        }
        return $value;
    }

    public function save(string $project, string $conversation, array $checkpoint): void
    {
        if (!update_user_meta(get_current_user_id(), $this->key($project, $conversation), $checkpoint)
            && $this->read($project, $conversation) !== $checkpoint) throw new \RuntimeException('The working context could not be saved.');
    }

    /** Derived private facts must not outlive explicitly deleted source messages. */
    public function forget(string $project, string $conversation): void
    {
        $indexKey = $this->key($project, $conversation) . '_candidates';
        // A shared source deletion invalidates every owner's derived facts for this
        // exact chat/site, including accounts no longer members of the current site.
        foreach (get_users(['blog_id' => 0, 'meta_key' => $indexKey, 'fields' => 'ID']) as $owner) {
            $index = get_user_meta((int) $owner, $indexKey, true);
            foreach (is_array($index) ? array_keys($index) : [] as $token) {
                $this->erase_candidate($project, $conversation, (string) $token, (int) $owner);
            }
        }
        delete_metadata('user', 0, $indexKey, '', true);
        delete_metadata('user', 0, $this->key($project, $conversation), '', true);
    }

    public function forget_project(string $project): void
    {
        $history = new HistoryRepository();
        foreach ($history->conversations($project) as $conversation) {
            $id = (string) $conversation['conversation_id'];
            $result = $history->locked(HistoryRepository::key($project, $id), function () use ($project, $id): void { $this->forget($project, $id); });
            if (is_wp_error($result)) throw new \RuntimeException($result->get_error_message());
        }
    }
}
