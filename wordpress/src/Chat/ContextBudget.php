<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;
if (!defined('ABSPATH')) exit;

/** Same checked catalogue and conservative byte estimate as the browser policy. */
final class ContextBudget
{
    public static function bytes(array $input): int
    {
        static $catalogue;
        $catalogue ??= json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/resources/context-models.json'), true);
        $composio = ($input['transport'] ?? '') === 'composio';
        $openai = $composio ? true
            : (($input['apiProtocol'] ?? '') === 'openai' && parse_url($input['baseUrl'] ?? '', PHP_URL_HOST) === 'api.openai.com');
        $model = (string) ($input['model'] ?? '');
        if ($composio) $model = preg_replace('~^openai/~', '', $model);
        $window = $openai ? ($catalogue['openai'][$model] ?? null) : null;
        if (!$window) return 48000;
        $output = is_numeric($input['maxTokens'] ?? null) && (float) $input['maxTokens'] > 0 ? (int) ceil((float) $input['maxTokens']) : 8192;
        return (int) (max(2048, min($catalogue['maxWorkingTokens'], floor($window * 0.65) - $output - 4096)) * $catalogue['bytesPerEstimatedToken']);
    }
}
