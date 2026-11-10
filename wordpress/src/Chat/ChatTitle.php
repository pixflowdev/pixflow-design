<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;

if (!defined('ABSPATH')) exit;

/** Keep the stored title bounded; visual clipping belongs to the shared sidebar. */
final class ChatTitle
{
    public static function from_prompt(string $prompt): string
    {
        return mb_substr(sanitize_text_field($prompt), 0, 191);
    }

    public static function restore(string $title, array $message): string
    {
        if (($message['role'] ?? '') !== 'user' || !is_string($message['content'] ?? null)) return $title;
        $legacy = mb_substr(wp_trim_words(sanitize_text_field($message['content']), 8, '…'), 0, 191);
        return str_ends_with($title, '…') && $title === $legacy ? self::from_prompt($message['content']) : $title;
    }

    /** Read-only, batched recovery for old automatic titles. Never changes custom names or transcripts. */
    public static function restore_project_rows(array $rows): array
    {
        global $wpdb;
        $ids = [];
        foreach ($rows as $row) if (str_ends_with((string) ($row['title'] ?? ''), '…')) $ids[] = (string) $row['uuid'];
        if (!$ids) return $rows;
        $conversations = \PixflowDesign\WordPress\Database\Table::name(\PixflowDesign\WordPress\Database\Table::CHAT_CONVERSATIONS);
        $messages = \PixflowDesign\WordPress\Database\Table::name(\PixflowDesign\WordPress\Database\Table::CHAT_MESSAGES);
        $sql = "SELECT c.project_uuid, c.title, m.payload FROM $conversations c JOIN $messages m ON m.conversation_key = c.conversation_key
            WHERE c.deleted = 0 AND m.deleted = 0 AND c.project_uuid IN (" . implode(',', array_fill(0, count($ids), '%s')) . ")
            AND m.sequence_id = (SELECT MIN(first.sequence_id) FROM $messages first WHERE first.conversation_key = c.conversation_key AND first.deleted = 0)";
        $recovered = [];
        foreach ($wpdb->get_results($wpdb->prepare($sql, ...$ids), ARRAY_A) ?: [] as $source) {
            $recovered[$source['project_uuid']][$source['title']] = self::restore($source['title'], HistoryPayload::message($source['payload']));
        }
        foreach ($rows as &$row) $row['title'] = $recovered[$row['uuid']][$row['title']] ?? $row['title'];
        return $rows;
    }
}
