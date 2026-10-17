<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg;

if (!defined('ABSPATH')) {
    exit;
}

/** Server-authoritative invariants for a full Gutenberg document replacement. */
final class GutenbergDocumentIntegrity
{
    public const CONTENT_INTENT_REPLACE = 'replace';
    public const EMPTY_CONTENT_HASH = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    private const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

    /** @return array<string, mixed>|\WP_Error */
    public function validate_browser_result(array $ticket, array $input): array|\WP_Error
    {
        $prepared = $this->validate_prepared_tree($ticket);
        if ($prepared instanceof \WP_Error) return $prepared;

        if (!array_key_exists('content', $input) || !is_string($input['content'])) {
            return $this->error('gutenberg_serialized_content_missing', 'The target editor did not return canonical serialized content.', 422);
        }
        $content = $input['content'];
        $bytes = strlen($content);
        if ($bytes === 0 || trim($content) === '' || $bytes > self::MAX_CONTENT_BYTES) {
            return $this->error('gutenberg_serialized_content_empty', 'The target editor returned an empty or invalid document for a non-empty replacement.', 422);
        }
        $canonical = wp_check_invalid_utf8($content);
        if ($canonical === '' || !hash_equals($content, $canonical)) {
            return $this->error('gutenberg_serialized_content_invalid', 'The target editor returned content that is not valid canonical UTF-8.', 422);
        }

        $browser_validation = is_array($input['validation'] ?? null) ? $input['validation'] : [];
        if (($browser_validation['valid'] ?? false) !== true || !empty($browser_validation['errors'])) {
            return $this->error('gutenberg_browser_validation_failed', 'The target Block Editor did not verify the proposed document.', 422, ['validation' => $browser_validation]);
        }

        $summary = $this->summarize_content($canonical);
        if ($summary instanceof \WP_Error) return $summary;
        if ((int) ($browser_validation['blockCount'] ?? 0) !== (int) $summary['totalBlockCount']) {
            return $this->error('gutenberg_serialization_readback_mismatch', 'The browser block count does not match the server-parsed document.', 422);
        }
        $consistent = $this->assert_tree_consistency((array) $ticket['resolvedBlocks'], $summary);
        if ($consistent instanceof \WP_Error) return $consistent;

        return [
            'content' => $canonical,
            'contentHash' => $summary['contentHash'],
            'serializedBytes' => $summary['serializedBytes'],
            'topLevelBlockCount' => $summary['topLevelBlockCount'],
            'totalBlockCount' => $summary['totalBlockCount'],
            'parsedBlockNames' => $summary['blockNames'],
            'proposedTopLevelBlockCount' => $prepared['topLevelBlockCount'],
            'proposedTotalBlockCount' => $prepared['totalBlockCount'],
            'blockOutline' => $prepared['blockOutline'],
            'browserValidation' => $browser_validation,
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function validate_receipt(array $receipt): array|\WP_Error
    {
        if (($receipt['contentIntent'] ?? '') !== self::CONTENT_INTENT_REPLACE) {
            return $this->error('gutenberg_content_intent_invalid', 'The prepared receipt is not an explicit Gutenberg replacement.', 422);
        }
        $prepared = $this->validate_prepared_tree($receipt);
        if ($prepared instanceof \WP_Error) return $prepared;
        if (!array_key_exists('content', $receipt) || !is_string($receipt['content'])) {
            return $this->error('gutenberg_receipt_content_missing', 'The prepared receipt has no canonical document.', 422);
        }
        $summary = $this->summarize_content($receipt['content']);
        if ($summary instanceof \WP_Error) return $summary;
        foreach ([
            'contentHash' => $summary['contentHash'],
            'serializedBytes' => $summary['serializedBytes'],
            'topLevelBlockCount' => $summary['topLevelBlockCount'],
            'blockCount' => $summary['totalBlockCount'],
            'proposedTopLevelBlockCount' => $prepared['topLevelBlockCount'],
            'proposedBlockCount' => $prepared['totalBlockCount'],
        ] as $field => $expected) {
            if (!array_key_exists($field, $receipt) || $receipt[$field] !== $expected) {
                return $this->error('gutenberg_receipt_integrity_mismatch', "The prepared receipt field {$field} does not match the server-recomputed document.", 422);
            }
        }
        if (!array_key_exists('blockOutline', $receipt) || $receipt['blockOutline'] !== $prepared['blockOutline']) {
            return $this->error('gutenberg_receipt_integrity_mismatch', 'The prepared receipt outline does not match the server-recomputed proposal.', 422);
        }
        if (($receipt['contentHash'] ?? '') === self::EMPTY_CONTENT_HASH) {
            return $this->error('gutenberg_receipt_empty_hash', 'An empty-content hash cannot authorize a Gutenberg replacement.', 422);
        }
        $consistent = $this->assert_tree_consistency((array) $receipt['resolvedBlocks'], $summary);
        if ($consistent instanceof \WP_Error) return $consistent;
        return [...$prepared, ...$summary];
    }

    /** @return array<string, mixed>|\WP_Error */
    public function validate_persisted_content(string $content, array $receipt): array|\WP_Error
    {
        $receipt_validation = $this->validate_receipt($receipt);
        if ($receipt_validation instanceof \WP_Error) return $receipt_validation;
        $summary = $this->summarize_content($content);
        if ($summary instanceof \WP_Error) return $summary;
        foreach (['contentHash', 'serializedBytes', 'topLevelBlockCount', 'totalBlockCount'] as $field) {
            if (($summary[$field] ?? null) !== ($receipt_validation[$field] ?? null)) {
                return $this->error('gutenberg_persisted_document_mismatch', 'The persisted Gutenberg document does not match the approved receipt.', 500);
            }
        }
        return $summary;
    }

    /** @return array<string, mixed>|\WP_Error */
    public function summarize_content(string $content): array|\WP_Error
    {
        $bytes = strlen($content);
        $hash = 'sha256:' . hash('sha256', $content);
        if ($bytes === 0 || trim($content) === '' || $hash === self::EMPTY_CONTENT_HASH) {
            return $this->error('gutenberg_serialized_content_empty', 'A non-empty Gutenberg replacement cannot use empty serialized content.', 422);
        }
        if ($bytes > self::MAX_CONTENT_BYTES || !function_exists('parse_blocks')) {
            return $this->error('gutenberg_serialized_content_invalid', 'The canonical document is too large or cannot be parsed server-side.', 422);
        }
        $parsed = parse_blocks($content);
        if (!is_array($parsed)) {
            return $this->error('gutenberg_serialized_content_invalid', 'The canonical document could not be parsed server-side.', 422);
        }
        $top_level = $this->count_named_top_level($parsed, 'blockName');
        $names = [];
        $total = $this->collect_names($parsed, 'blockName', $names);
        if ($top_level < 1 || $total < 1) {
            return $this->error('gutenberg_serialized_blocks_missing', 'The server parsed no Gutenberg blocks from the proposed replacement.', 422);
        }
        ksort($names);
        return [
            'contentHash' => $hash,
            'serializedBytes' => $bytes,
            'topLevelBlockCount' => $top_level,
            'totalBlockCount' => $total,
            'blockNames' => $names,
        ];
    }

    /** @return array<string, mixed>|\WP_Error */
    private function validate_prepared_tree(array $ticket): array|\WP_Error
    {
        if (($ticket['contentIntent'] ?? self::CONTENT_INTENT_REPLACE) !== self::CONTENT_INTENT_REPLACE) {
            return $this->error('gutenberg_content_intent_invalid', 'Only explicit non-empty Gutenberg replacement receipts are supported.', 422);
        }
        $blocks = is_array($ticket['blocks'] ?? null) ? $ticket['blocks'] : [];
        $resolved = is_array($ticket['resolvedBlocks'] ?? null) ? $ticket['resolvedBlocks'] : [];
        $outline = $this->block_outline($blocks);
        $resolved_outline = $this->block_outline($resolved);
        $top_level = $this->count_named_top_level($resolved, 'name');
        $names = [];
        $total = $this->collect_names($resolved, 'name', $names);
        if ($blocks === [] || $resolved === [] || $outline === [] || $resolved_outline === [] || $top_level < 1 || $total < 1) {
            return $this->error('gutenberg_proposed_document_empty', 'A Gutenberg replacement requires a non-empty proposed block tree and outline.', 422);
        }
        if (isset($ticket['treeHash']) && !hash_equals((string) $ticket['treeHash'], $this->tree_hash($blocks))) {
            return $this->error('gutenberg_ticket_tree_mismatch', 'The proposed tree hash no longer matches the prepared ticket.', 409);
        }
        if (isset($ticket['resolvedTreeHash']) && !hash_equals((string) $ticket['resolvedTreeHash'], $this->tree_hash($resolved))) {
            return $this->error('gutenberg_ticket_tree_mismatch', 'The resolved tree hash no longer matches the prepared ticket.', 409);
        }
        $validated_count = (int) ($ticket['validation']['blockCount'] ?? $total);
        if ($validated_count !== $total) {
            return $this->error('gutenberg_proposed_count_mismatch', 'The server-validated proposal count no longer matches the prepared tree.', 422);
        }
        return [
            'topLevelBlockCount' => $top_level,
            'totalBlockCount' => $total,
            'blockOutline' => $outline,
            'resolvedBlockOutline' => $resolved_outline,
            'blockNames' => $names,
        ];
    }

    /** @param array<string, mixed> $summary */
    private function assert_tree_consistency(array $resolved, array $summary): ?\WP_Error
    {
        $required_names = [];
        $required_total = $this->collect_names($resolved, 'name', $required_names);
        $required_top_level = $this->count_named_top_level($resolved, 'name');
        if ((int) ($summary['totalBlockCount'] ?? 0) < $required_total
            || (int) ($summary['topLevelBlockCount'] ?? 0) < $required_top_level) {
            return $this->error('gutenberg_serialization_dropped_blocks', 'Required blocks disappeared during target-editor serialization.', 422);
        }
        $parsed_names = is_array($summary['blockNames'] ?? null) ? $summary['blockNames'] : [];
        foreach ($required_names as $name => $count) {
            if ((int) ($parsed_names[$name] ?? 0) < $count) {
                return $this->error('gutenberg_serialization_dropped_blocks', "The required block {$name} disappeared during target-editor serialization.", 422);
            }
        }
        return null;
    }

    private function count_named_top_level(array $blocks, string $name_field): int
    {
        $count = 0;
        foreach ($blocks as $block) {
            if (is_array($block) && is_string($block[$name_field] ?? null) && $block[$name_field] !== '') $count++;
        }
        return $count;
    }

    /** @param array<string, int> $names */
    private function collect_names(array $blocks, string $name_field, array &$names): int
    {
        $count = 0;
        foreach ($blocks as $block) {
            if (!is_array($block)) continue;
            $name = is_string($block[$name_field] ?? null) ? $block[$name_field] : '';
            if ($name !== '') {
                $names[$name] = (int) ($names[$name] ?? 0) + 1;
                $count++;
            }
            $count += $this->collect_names(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : [], $name_field, $names);
        }
        return $count;
    }

    /** @return list<array{name:string,depth:int}> */
    private function block_outline(array $blocks): array
    {
        $outline = [];
        $walk = function (array $items, int $depth) use (&$walk, &$outline): void {
            foreach ($items as $block) {
                if (!is_array($block) || !is_string($block['name'] ?? null) || $block['name'] === '') continue;
                $outline[] = ['name' => $block['name'], 'depth' => $depth];
                $walk(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : [], $depth + 1);
            }
        };
        $walk($blocks, 0);
        return $outline;
    }

    private function tree_hash(array $blocks): string
    {
        return 'sha256:' . hash('sha256', (string) wp_json_encode($blocks, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function error(string $code, string $message, int $status, array $extra = []): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status, 'retryable' => false, ...$extra]);
    }
}
