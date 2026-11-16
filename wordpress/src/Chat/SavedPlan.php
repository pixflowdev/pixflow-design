<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;
if (!defined('ABSPATH')) exit;

/** Plans live in the existing owned history, inheriting deletion, export and revision protection. */
final class SavedPlan
{
    public const MESSAGE_ID = 'pixflow-saved-plan';

    public static function validate(array $input): array
    {
        if (array_diff(array_keys($input), ['id', 'title', 'summary', 'steps', 'revision'])) throw new \InvalidArgumentException('Unknown plan fields.');
        foreach (['id' => 100, 'title' => 240, 'summary' => 8000] as $field => $limit) {
            if (!is_string($input[$field] ?? null) || strlen($input[$field]) > $limit || ($field !== 'summary' && trim($input[$field]) === '')) throw new \InvalidArgumentException('Invalid plan ' . $field . '.');
        }
        if (!is_int($input['revision'] ?? null) || $input['revision'] < 0) throw new \InvalidArgumentException('Read plan.read and supply its revision, or 0 for a new chat plan.');
        if (!is_array($input['steps'] ?? null) || !array_is_list($input['steps']) || count($input['steps']) < 1 || count($input['steps']) > 40) throw new \InvalidArgumentException('Supply 1–40 plan steps.');
        $ids = []; $active = 0;
        foreach ($input['steps'] as $step) {
            if (!is_array($step) || array_diff(array_keys($step), ['id', 'content', 'status']) || !is_string($step['id'] ?? null) || !preg_match('/\A[a-zA-Z0-9_-]{1,80}\z/D', $step['id']) || isset($ids[$step['id']]) || !is_string($step['content'] ?? null) || trim($step['content']) === '' || strlen($step['content']) > 2000 || !in_array($step['status'] ?? '', ['pending', 'in_progress', 'completed', 'stopped'], true)) throw new \InvalidArgumentException('Invalid or duplicate plan step.');
            $ids[$step['id']] = true;
            if ($step['status'] === 'in_progress') ++$active;
        }
        if ($active > 1) throw new \InvalidArgumentException('Only one plan step may be active.');
        return $input;
    }

    public static function from_message(?array $message): ?array
    {
        $plan = $message['savedPlan'] ?? null;
        if (!is_array($plan)) return null;
        $plan['revision'] = (int) $message['historyRevision'];
        return $plan;
    }

    public static function message(array $plan, ?array $previous): array
    {
        return ['id' => self::MESSAGE_ID, 'role' => 'assistant', 'content' => '',
            'createdAt' => $previous['createdAt'] ?? (int) round(microtime(true) * 1000),
            'historyRevision' => $plan['revision'], 'savedPlan' => $plan,
            'events' => [['kind' => 'tool_use', 'id' => 'saved-plan', 'name' => 'TodoWrite',
                'input' => ['title' => $plan['title'], 'summary' => $plan['summary'], 'todos' => $plan['steps'], 'savedPlanRevision' => $plan['revision'] + 1]]]];
    }
}
