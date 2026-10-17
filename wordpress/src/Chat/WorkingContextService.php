<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;
if (!defined('ABSPATH')) exit;

final class WorkingContextService
{
    public function __construct(
        private readonly HistoryService $history = new HistoryService(),
        private readonly WorkingContextRepository $contexts = new WorkingContextRepository(),
        private readonly HistoryRepository $repository = new HistoryRepository(),
    ) {}

    private function messages(string $project, string $conversation, ?string $throughMessageId = null): array
    {
        $page = $this->history->page($project, $conversation, null);
        if (is_wp_error($page)) throw new \RuntimeException($page->get_error_message());
        if ($throughMessageId === '') return [];
        if ($throughMessageId !== null) {
            foreach ($page['messages'] as $index => $message) {
                if (($message['id'] ?? '') === $throughMessageId) return array_slice($page['messages'], 0, $index + 1);
            }
            throw new \RuntimeException('The preceding chat message is not saved. Please retry after chat history finishes saving.');
        }
        return $page['messages'];
    }

    private function response(array $messages, array $checkpoint, string $status): array
    {
        $valid = WorkingContext::valid($checkpoint, $messages);
        return ['messages' => WorkingContext::projection($messages, $checkpoint), 'status' => $status,
            'coveredMessages' => $valid ? $checkpoint['coveredMessages'] : 0,
            'sourceDigest' => WorkingContext::digest($messages)] + ($valid ? ['summary' => $checkpoint['summary']] : []);
    }

    /** Summarization never receives tool definitions, permission grants or opaque active turns. */
    public function prepare(string $project, string $conversation, array $input, ?callable $complete = null): array
    {
        $throughMessageId = isset($input['throughMessageId']) ? (string) $input['throughMessageId'] : null;
        $messages = $this->messages($project, $conversation, $throughMessageId);
        $saved = $this->contexts->read($project, $conversation);
        $valid = WorkingContext::valid($saved, $messages);
        $previous = $valid ? $saved : [];
        $response = $this->response($messages, $previous, $valid ? 'reused' : 'unchanged');
        $cutoff = WorkingContext::cutoff($messages);
        $covered = $valid ? $saved['coveredMessages'] : 0;
        if ($cutoff <= $covered || (($input['force'] ?? false) !== true && strlen((string) wp_json_encode($response['messages'])) < WorkingContext::TRIGGER_BYTES)) return $response;
        try {
            $complete ??= function (string $system, string $text) use ($input): string {
                if (($input['transport'] ?? 'api') === 'composio') {
                    return \PixflowDesign\WordPress\Modules\ComposioAccess::summarize($input, $system, $text);
                }
                return (new \PixflowDesign\WordPress\Http\Routes\ProviderSettingsRoutes())->summarize($input, $system, $text);
            };
            $summary = WorkingContext::summarize(array_slice($messages, $covered, $cutoff - $covered), $previous['summary'] ?? '', $complete);
            $checkpoint = ['version' => 1, 'summary' => $summary, 'coveredMessages' => $cutoff,
                'prefixDigest' => WorkingContext::digest(array_slice($messages, 0, $cutoff)), 'createdAt' => time()];
            $result = $this->repository->locked(HistoryRepository::key($project, $conversation), function () use ($project, $conversation, $throughMessageId, $messages, $saved, $checkpoint): array {
                $latest = $this->messages($project, $conversation, $throughMessageId);
                if (!hash_equals(WorkingContext::digest($messages), WorkingContext::digest($latest))) {
                    return $this->response($latest, $saved, 'fallback') + ['reason' => 'history_changed'];
                }
                $candidate = $this->contexts->candidate($project, $conversation, $checkpoint, WorkingContext::digest([$saved]), $throughMessageId);
                return $this->response($messages, $checkpoint, 'compacted') + ['candidateId' => $candidate];
            });
            if (is_wp_error($result)) throw new \RuntimeException($result->get_error_message());
            return $result;
        } catch (\Throwable $error) {
            // The caller gets every uncompressed message after the last valid checkpoint.
            // Never return upstream error text: it can include credentials or transcript data.
            return $this->response($this->messages($project, $conversation, $throughMessageId), $saved, 'fallback') + ['reason' => 'compaction_unavailable'];
        }
    }

    /** A canceled browser request does not commit. Retrying an accepted commit is idempotent. */
    public function commit(string $project, string $conversation, string $candidate): array
    {
        $this->messages($project, $conversation); // Enforce ownership before inspecting the candidate.
        $pending = $this->contexts->pending($project, $conversation, $candidate);
        $result = $this->repository->locked(HistoryRepository::key($project, $conversation), function () use ($project, $conversation, $pending): array {
            $messages = $this->messages($project, $conversation, $pending['throughMessageId'] ?? null);
            $current = $this->contexts->read($project, $conversation);
            $checkpoint = $pending['checkpoint'];
            if (!WorkingContext::valid($checkpoint, $messages)) return $this->response($messages, $current, 'fallback') + ['reason' => 'history_changed'];
            if ($current === $checkpoint) return $this->response($messages, $current, 'reused');
            if (!hash_equals($pending['previousDigest'], WorkingContext::digest([$current]))) return $this->response($messages, $current, 'fallback') + ['reason' => 'checkpoint_changed'];
            $this->contexts->save($project, $conversation, $checkpoint);
            return $this->response($messages, $checkpoint, 'compacted');
        });
        if (is_wp_error($result)) throw new \RuntimeException($result->get_error_message());
        return $result;
    }

    /** No persisted checkpoint is changed until the browser atomically accepts this note. */
    public function run(string $project, string $conversation, array $input, ?callable $complete = null): array
    {
        $this->messages($project, $conversation); // Same ownership boundary as durable history.
        try {
            $source = RunWorkingContext::project($input);
            $complete ??= function (string $system, string $text) use ($input): string {
                return ($input['transport'] ?? 'api') === 'composio'
                    ? \PixflowDesign\WordPress\Modules\ComposioAccess::summarize($input, $system, $text)
                    : (new \PixflowDesign\WordPress\Http\Routes\ProviderSettingsRoutes())->summarize($input, $system, $text);
            };
            return ['status' => 'compacted', 'summary' => WorkingContext::summarize($source, '', $complete)];
        } catch (\Throwable $error) {
            return ['status' => 'fallback', 'reason' => 'compaction_unavailable'];
        }
    }
}
