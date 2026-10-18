<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Od;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectAdapter
{
    /** Adapt older floating-panel text for Workspace readers without rewriting history. */
    public static function to_app_message_page(array $page): array
    {
        foreach ($page['messages'] as &$message) {
            if (!is_string($message['content'] ?? null)) {
                $message['content'] = is_string($message['text'] ?? null) ? $message['text'] : '';
            }
        }
        unset($message);
        return $page;
    }

    /** Legacy transcripts are a server-side migration backup, not list/detail payloads. */
    public static function without_chat_backup(array $project): array
    {
        if (is_array($project['metadata']['odState'] ?? null)) unset($project['metadata']['odState']['messages']);
        return $project;
    }

    public function to_app_project(array $project): array
    {
        $uuid = sanitize_text_field((string) ($project['uuid'] ?? ''));
        $id = $uuid !== '' ? $uuid : 'wp-project-' . (int) ($project['id'] ?? 0);
        $title = sanitize_text_field((string) ($project['title'] ?? ''));
        $metadata = is_array($project['metadata'] ?? null) ? $project['metadata'] : [];
        unset($metadata['odState']);
        $context = is_array($project['context'] ?? null) ? $project['context'] : [];
        $created = $this->timestamp_ms($project['createdAt'] ?? null);
        $updated = $this->timestamp_ms($project['updatedAt'] ?? null) ?: $created;
        $pending_prompt = is_string($metadata['pendingPrompt'] ?? null)
            ? (string) $metadata['pendingPrompt']
            : '';
        $applied_plugin_snapshot_id = is_string($metadata['appliedPluginSnapshotId'] ?? null)
            ? (string) $metadata['appliedPluginSnapshotId']
            : null;

        return [
            'id' => $id,
            'name' => $title !== '' ? $title : 'Pixflow project',
            'kind' => sanitize_key((string) ($project['kind'] ?? 'project')) ?: 'project',
            'skillId' => $metadata['skillId'] ?? null,
            'designSystemId' => $context['designSystemId'] ?? ($metadata['designSystemId'] ?? null),
            'createdAt' => $created,
            'updatedAt' => $updated,
            'pendingPrompt' => $pending_prompt,
            'appliedPluginSnapshotId' => $applied_plugin_snapshot_id,
            'metadata' => array_replace_recursive($metadata, [
                // The embedded runtime owns this project's files in the
                // WordPress uploads tree. The frontend uses this marker to
                // keep file requests on the site instead of probing Bridge.
                'storageBackend' => 'wordpress',
                'wordpressProject' => [
                    'id' => (int) ($project['id'] ?? 0),
                    'uuid' => $uuid,
                    'status' => sanitize_key((string) ($project['status'] ?? 'draft')),
                    'visibility' => sanitize_key((string) ($project['visibility'] ?? 'site')),
                    'currentVersionId' => (int) ($project['currentVersionId'] ?? 0),
                ],
            ]),
            'status' => [
                'value' => 'succeeded',
                'label' => 'Ready',
            ],
        ];
    }

    private function timestamp_ms(mixed $value): int
    {
        if (is_int($value) || is_float($value)) {
            $number = (float) $value;
            return $number > 0 && $number < 100000000000 ? (int) ($number * 1000) : (int) $number;
        }

        if (is_string($value) && trim($value) !== '') {
            $timestamp = strtotime($value);
            return $timestamp ? $timestamp * 1000 : 0;
        }

        return 0;
    }
}
