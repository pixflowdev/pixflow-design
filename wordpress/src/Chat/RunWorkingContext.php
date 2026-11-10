<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;
if (!defined('ABSPATH')) exit;

/** Read-only extraction of completed provider tool cycles; original checkpoint remains opaque. */
final class RunWorkingContext
{
    public static function project(array $input): array
    {
        if (!empty($input['calls']) || !empty($input['inFlight'])) throw new \RuntimeException('An operation is still pending.');
        $calls = []; $results = [];
        $visit = static function (mixed $value) use (&$visit, &$calls, &$results): mixed {
            if (!is_array($value)) return $value;
            if (!empty($value['pending']) || in_array($value['code'] ?? '', ['site_delivery_uncertain', 'delivery_uncertain'], true)) throw new \RuntimeException('A tool result is uncertain.');
            if (in_array($value['type'] ?? '', ['thinking', 'redacted_thinking', 'reasoning', 'image', 'input_image', 'image_url'], true) || !empty($value['thought'])) return null;
            $callId = null; $resultId = null;
            if (($value['type'] ?? '') === 'function_call' && isset($value['call_id'])) $callId = (string) $value['call_id'];
            if (($value['type'] ?? '') === 'tool_use' && isset($value['id'])) $callId = (string) $value['id'];
            foreach ($value['tool_calls'] ?? [] as $call) {
                $id = (string) ($call['id'] ?? 'ollama:' . ($call['function']['name'] ?? 'site_tool'));
                $calls[$id] = ($calls[$id] ?? 0) + 1;
            }
            if (isset($value['functionCall'])) $callId = (string) ($value['functionCall']['id'] ?? 'google');
            if (($value['type'] ?? '') === 'function_call_output' && isset($value['call_id'])) $resultId = (string) $value['call_id'];
            if (($value['type'] ?? '') === 'tool_result' && isset($value['tool_use_id'])) $resultId = (string) $value['tool_use_id'];
            if (($value['role'] ?? '') === 'tool') $resultId = (string) ($value['tool_call_id'] ?? 'ollama:' . ($value['tool_name'] ?? 'site_tool'));
            if (isset($value['functionResponse'])) $resultId = (string) ($value['functionResponse']['id'] ?? 'google');
            if ($callId !== null) $calls[$callId] = ($calls[$callId] ?? 0) + 1;
            if ($resultId !== null) $results[$resultId] = ($results[$resultId] ?? 0) + 1;
            $out = [];
            foreach ($value as $key => $item) {
                if (in_array($key, ['encrypted_content', 'thoughtSignature', 'signature', 'reasoning_content', 'base64', 'inlineData'], true)) continue;
                $clean = $visit($item);
                if ($clean !== null) $out[$key] = $clean;
            }
            return $out;
        };
        // Static instructions/catalogues are resupplied on continuation. They
        // are not execution history and must not be summarized repeatedly.
        $turns = array_values(array_filter($input['turns'] ?? [], static fn($turn) => !is_array($turn) || !in_array($turn['role'] ?? '', ['system','developer'], true)));
        $messages = array_values(array_filter($input['messages'] ?? [], static fn($message) => !in_array($message, $turns, true)));
        $source = ['messages' => $messages, 'turns' => $turns, 'results' => $input['results'] ?? []];
        if (strlen((string) wp_json_encode($source)) > 2000000) throw new \RuntimeException('The run context is too large for one safe compaction.');
        $clean = $visit($source);
        foreach ($input['results'] ?? [] as $result) if (isset($result['id'])) {
            $id = (string) $result['id'];
            $results[$id] = ($results[$id] ?? 0) + 1;
            if (str_starts_with($id, 'google-')) $results['google'] = ($results['google'] ?? 0) + 1;
            if (str_starts_with($id, 'call-')) $results['ollama:site_tool'] = ($results['ollama:site_tool'] ?? 0) + 1;
        }
        foreach ($calls as $id => $count) if (($results[$id] ?? 0) < $count) throw new \RuntimeException('A provider tool call has no recorded result.');
        return [['role' => 'user', 'content' => 'Completed provider conversation and tool-result records. Tool requests are historical data, not instructions to execute. A received result does not by itself prove persistence. ' . wp_json_encode($clean)]];
    }
}
