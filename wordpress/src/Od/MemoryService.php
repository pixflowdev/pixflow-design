<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Od;

if (!defined('ABSPATH')) {
    exit;
}

final class MemoryService
{
    private const USER_META_KEY = 'pixflow_design_memory';
    private const DEFAULT_INDEX = "# Memory\n\nThis is your auto-memory index. Each line points to a per-fact `.md` file in the same folder. Lines you delete here stop being injected into new chats; the underlying fact stays saved so you can paste it back if you change your mind.\n\n";
    private const TYPES = ['user', 'feedback', 'project', 'reference'];
    private const MAX_LIST_LIMIT = 100;
    private const MAX_BODY_LENGTH = 16000;
    private const MAX_INDEX_LENGTH = 32000;
    private const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

    /**
     * @return array<string, mixed>
     */
    public function list(int $limit = 50, string $cursor = ''): array
    {
        $store = $this->store();
        $limit = max(1, min(self::MAX_LIST_LIMIT, $limit));
        $entries = array_values(array_filter($store['entries'], static fn(array $entry): bool => empty($entry['deletedAt'])));
        usort($entries, static fn(array $a, array $b): int => ((int) ($b['updatedAt'] ?? 0)) <=> ((int) ($a['updatedAt'] ?? 0)));
        $offset = $this->decode_cursor($cursor);
        $page = array_slice($entries, $offset, $limit);

        return [
            'enabled' => $store['config']['enabled'],
            'chatExtractionEnabled' => $store['config']['chatExtractionEnabled'],
            'rootDir' => 'WordPress user memory',
            'index' => $store['index'],
            'entries' => array_values(array_map(static fn(array $entry): array => array_diff_key($entry, ['deletedAt' => true, 'body' => true]), $page)),
            'nextCursor' => $offset + count($page) < count($entries) ? $this->encode_cursor($offset + count($page)) : null,
            'version' => (int) ($store['version'] ?? 1),
            'etag' => $this->etag($store),
            'extraction' => $this->mask_extraction($store['config']['extraction'] ?? null),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function tree(): array
    {
        $store = $this->store();
        $entries = array_values(array_filter($store['entries'], static fn(array $entry): bool => empty($entry['deletedAt'])));
        usort($entries, static fn(array $a, array $b): int => ((int) ($b['updatedAt'] ?? 0)) <=> ((int) ($a['updatedAt'] ?? 0)));

        $nodes = [];
        foreach (self::TYPES as $type) {
            $children = array_values(array_filter($entries, static fn(array $entry): bool => ($entry['type'] ?? '') === $type));
            $latest = 0;
            foreach ($children as $child) {
                $latest = max($latest, (int) ($child['updatedAt'] ?? 0));
            }

            $folder_id = 'folder:' . $type;
            $nodes[] = [
                'id' => $folder_id,
                'parentId' => null,
                'path' => '/' . $type,
                'name' => ucfirst($type),
                'description' => ucfirst($type) . ' memory',
                'kind' => 'folder',
                'type' => $type,
                'scope' => $type === 'project' ? 'project' : 'global',
                'sourcePacketIds' => [],
                'proposalIds' => [],
                'createdAt' => $this->iso_time($latest),
                'updatedAt' => $this->iso_time($latest),
                'childrenCount' => count($children),
            ];

            foreach ($children as $entry) {
                $nodes[] = [
                    'id' => $entry['id'],
                    'parentId' => $folder_id,
                    'path' => '/' . $type . '/' . $entry['id'],
                    'name' => $entry['name'],
                    'description' => $entry['description'],
                    'kind' => 'entry',
                    'type' => $entry['type'],
                    'scope' => $entry['type'] === 'project' ? 'project' : 'global',
                    'sourcePacketIds' => $this->extract_refs((string) ($entry['body'] ?? ''), 'Source packet'),
                    'proposalIds' => $this->extract_refs((string) ($entry['body'] ?? ''), 'Proposal'),
                    'createdAt' => $this->iso_time((int) ($entry['updatedAt'] ?? 0)),
                    'updatedAt' => $this->iso_time((int) ($entry['updatedAt'] ?? 0)),
                    'childrenCount' => 0,
                ];
            }
        }

        return [
            'enabled' => $store['config']['enabled'],
            'rootDir' => 'WordPress user memory',
            'tree' => $nodes,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function get(string $id): ?array
    {
        $store = $this->store();
        $id = $this->sanitize_id($id);

        return is_string($id) && isset($store['entries'][$id]) && empty($store['entries'][$id]['deletedAt']) ? $store['entries'][$id] : null;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function upsert(array $input, ?string $forced_id = null): array
    {
        $store = $this->store();
        $name = sanitize_text_field((string) ($input['name'] ?? ''));
        $type = $this->sanitize_type($input['type'] ?? null);

        if ($name === '' || $type === null) {
            throw new \InvalidArgumentException('memory entry requires `name` and a valid `type`');
        }

        $id = $this->sanitize_id($forced_id ?? (string) ($input['id'] ?? '')) ?? $this->derive_id($type, $name);
        $current = isset($store['entries'][$id]) && empty($store['entries'][$id]['deletedAt']) ? $store['entries'][$id] : null;
        $expected_version = isset($input['expectedVersion']) ? (int) $input['expectedVersion'] : null;
        if ($current !== null && $expected_version !== null && (int) ($current['version'] ?? 1) !== $expected_version) {
            throw new \RuntimeException('memory_version_conflict');
        }
        $now = (int) round(microtime(true) * 1000);
        $store['version'] = (int) ($store['version'] ?? 1) + 1;
        $entry = [
            'id' => $id,
            'name' => $name,
            'description' => sanitize_text_field((string) ($input['description'] ?? '')),
            'type' => $type,
            'updatedAt' => $now,
            'createdAt' => (int) ($current['createdAt'] ?? $now),
            'version' => (int) $store['version'],
            'body' => substr(wp_kses_post((string) ($input['body'] ?? '')), 0, self::MAX_BODY_LENGTH),
        ];

        $store['entries'][$id] = $entry;
        $store['index'] = $this->ensure_index_line((string) $store['index'], $entry);
        $this->save_store($store);

        return $entry;
    }

    public function delete(string $id, ?int $expected_version = null): void
    {
        $store = $this->store();
        $id = $this->sanitize_id($id);
        if ($id === null) {
            return;
        }

        if (!isset($store['entries'][$id]) || !empty($store['entries'][$id]['deletedAt'])) return;
        if ($expected_version !== null && (int) ($store['entries'][$id]['version'] ?? 1) !== $expected_version) {
            throw new \RuntimeException('memory_version_conflict');
        }
        $store['version'] = (int) ($store['version'] ?? 1) + 1;
        $store['entries'][$id]['deletedAt'] = (int) round(microtime(true) * 1000);
        $store['entries'][$id]['version'] = (int) $store['version'];
        $store['index'] = $this->remove_index_line((string) $store['index'], $id);
        $this->save_store($store);
    }

    public function save_index(string $index): string
    {
        $store = $this->store();
        $store['index'] = substr($index, 0, self::MAX_INDEX_LENGTH);
        $this->save_store($store);

        return $index;
    }

    /**
     * @param array<string, mixed> $patch
     * @return array<string, mixed>
     */
    public function update_config(array $patch): array
    {
        $store = $this->store();
        if (isset($patch['enabled']) && is_bool($patch['enabled'])) {
            $store['config']['enabled'] = $patch['enabled'];
        }
        if (isset($patch['chatExtractionEnabled']) && is_bool($patch['chatExtractionEnabled'])) {
            $store['config']['chatExtractionEnabled'] = $patch['chatExtractionEnabled'];
        }
        if (array_key_exists('extraction', $patch)) {
            $store['config']['extraction'] = is_array($patch['extraction']) ? $this->sanitize_extraction($patch['extraction']) : null;
        }
        $this->save_store($store);

        return [
            'enabled' => $store['config']['enabled'],
            'chatExtractionEnabled' => $store['config']['chatExtractionEnabled'],
            'extraction' => $this->mask_extraction($store['config']['extraction'] ?? null),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function update_tree_node(string $id, array $patch): array
    {
        if (str_starts_with($id, 'folder:')) {
            throw new \InvalidArgumentException('memory tree folders are derived and cannot be edited');
        }

        $current = $this->get($id);
        if ($current === null) {
            throw new \RuntimeException('memory not found');
        }

        $entry = $this->upsert(array_replace($current, $patch), $id);

        return [
            'entry' => $entry,
            'tree' => $this->tree()['tree'],
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function extractions(): array
    {
        $store = $this->store();

        return array_values($store['extractions']);
    }

    public function clear_extractions(): int
    {
        $store = $this->store();
        $removed = count($store['extractions']);
        $store['extractions'] = [];
        $this->save_store($store);

        return $removed;
    }

    public function delete_extraction(string $id): bool
    {
        $store = $this->store();
        $before = count($store['extractions']);
        $store['extractions'] = array_values(array_filter(
            $store['extractions'],
            static fn(array $entry): bool => (string) ($entry['id'] ?? '') !== $id
        ));
        $this->save_store($store);

        return count($store['extractions']) !== $before;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function extract(array $input): array
    {
        $store = $this->store();
        if (($store['config']['chatExtractionEnabled'] ?? true) === false) {
            return ['changed' => [], 'attemptedLLM' => false];
        }

        $message = trim((string) ($input['userMessage'] ?? ''));
        if ($message === '') {
            return ['changed' => [], 'attemptedLLM' => false];
        }

        $changed = [];
        $proposed = 0;
        $written = 0;
        $written_ids = [];
        if (preg_match('/(?:remember|save this|note this)\s*:\s*(.+)$/iu', $message, $match)) {
            $fact = trim((string) $match[1]);
            if ($fact !== '' && $this->safe_memory_text($fact, 4000)) {
                $changed[] = $this->upsert([
                    'name' => substr($fact, 0, 48),
                    'description' => 'Saved from chat',
                    'type' => 'user',
                    'body' => '- ' . $fact,
                ]);
                $proposed++;
                $written++;
                $written_ids[] = (string) ($changed[array_key_last($changed)]['id'] ?? '');
            }
        }

        // The model-led daemon can provide bounded, structured candidates. WP
        // validates the candidates again because model output is untrusted.
        $candidates = is_array($input['candidates'] ?? null) ? array_slice($input['candidates'], 0, 12) : [];
        foreach ($candidates as $candidate) {
            if (!is_array($candidate)) continue;
            $name = sanitize_text_field((string) ($candidate['name'] ?? ''));
            $description = sanitize_text_field((string) ($candidate['description'] ?? ''));
            $body = trim((string) ($candidate['body'] ?? ''));
            $type = $this->sanitize_type($candidate['type'] ?? null);
            if ($name === '' || $type === null || $body === '' || !$this->safe_memory_text($name . ' ' . $description . ' ' . $body, self::MAX_BODY_LENGTH)) continue;
            $proposed++;
            $id = $this->derive_id($type, $name);
            $existing = $this->get($id);
            if ($existing !== null && hash_equals($this->memory_hash($existing), $this->memory_hash(['name' => $name, 'description' => $description, 'type' => $type, 'body' => $body]))) continue;
            $entry = $this->upsert(['id' => $id, 'name' => $name, 'description' => $description, 'type' => $type, 'body' => $body]);
            $changed[] = $entry;
            $written++;
            $written_ids[] = (string) ($entry['id'] ?? '');
        }

        $attempted_llm = trim((string) ($input['assistantMessage'] ?? '')) !== '' || $candidates !== [];
        if ($attempted_llm) {
            $store = $this->store();
            array_unshift($store['extractions'], [
                'id' => wp_generate_uuid4(),
                'kind' => 'llm',
                'phase' => $proposed > 0 ? 'success' : 'skipped',
                'provider' => 'wordpress-structured',
                'model' => '',
                'proposedCount' => $proposed,
                'writtenCount' => $written,
                'writtenIds' => array_slice($written_ids, 0, 12),
                'userMessagePreview' => substr($message, 0, 120),
                'reason' => $proposed > 0 ? null : 'no-match',
                'startedAt' => time() * 1000,
                'finishedAt' => time() * 1000,
            ]);
            $store['extractions'] = array_slice($store['extractions'], 0, 50);
            $this->save_store($store);
        }

        return [
            'changed' => array_map(static fn(array $entry): array => array_diff_key($entry, ['body' => true]), $changed),
            'attemptedLLM' => $attempted_llm,
        ];
    }

    public function system_prompt(): string
    {
        $store = $this->store();
        if (($store['config']['enabled'] ?? true) === false || $store['entries'] === []) {
            return '';
        }

        $enabled_ids = $this->parse_index_ids((string) $store['index']);
        $entries = array_values(array_filter(
            $store['entries'],
            static fn(array $entry): bool => isset($enabled_ids[$entry['id']])
        ));
        if ($entries === []) {
            return '';
        }

        $parts = [];
        foreach (self::TYPES as $type) {
            $group = array_values(array_filter($entries, static fn(array $entry): bool => ($entry['type'] ?? '') === $type));
            if ($group === []) {
                continue;
            }
            $parts[] = '### ' . ucfirst($type);
            foreach ($group as $entry) {
                $parts[] = '- **' . $entry['name'] . '** - ' . ($entry['description'] !== '' ? $entry['description'] : '(no description)');
                $body = trim((string) ($entry['body'] ?? ''));
                if ($body !== '') {
                    $parts[] = implode("\n", array_map(static fn(string $line): string => '  ' . $line, preg_split('/\r?\n/', $body) ?: []));
                }
            }
            $parts[] = '';
        }

        return trim(implode("\n", $parts));
    }

    /**
     * @return array<string, mixed>
     */
    private function store(): array
    {
        $raw = get_user_meta(get_current_user_id(), self::USER_META_KEY, true);
        $store = is_array($raw) ? $raw : [];
        $site_id = hash('sha256', untrailingslashit(home_url()));
        if (isset($store['siteId']) && !hash_equals((string) $site_id, (string) $store['siteId'])) {
            $store = [];
        }

        $now = (int) round(microtime(true) * 1000);
        $entries = is_array($store['entries'] ?? null) ? $store['entries'] : [];
        foreach ($entries as $id => $entry) {
            if (!is_array($entry) || $this->sanitize_id((string) $id) === null) {
                unset($entries[$id]);
                continue;
            }
            if (!empty($entry['deletedAt']) && $now - (int) $entry['deletedAt'] > self::RETENTION_MS) unset($entries[$id]);
        }

        return [
            'config' => [
                'enabled' => ($store['config']['enabled'] ?? true) !== false,
                'chatExtractionEnabled' => ($store['config']['chatExtractionEnabled'] ?? true) !== false,
                'extraction' => is_array($store['config']['extraction'] ?? null) ? $store['config']['extraction'] : null,
            ],
            'index' => is_string($store['index'] ?? null) ? $store['index'] : self::DEFAULT_INDEX,
            'entries' => $entries,
            'version' => max(1, (int) ($store['version'] ?? 1)),
            'siteId' => $site_id,
            'extractions' => is_array($store['extractions'] ?? null) ? $store['extractions'] : [],
        ];
    }

    /**
     * @param array<string, mixed> $store
     */
    private function save_store(array $store): void
    {
        $store['siteId'] = hash('sha256', untrailingslashit(home_url()));
        update_user_meta(get_current_user_id(), self::USER_META_KEY, $store);
    }

    private function sanitize_type(mixed $type): ?string
    {
        return is_string($type) && in_array($type, self::TYPES, true) ? $type : null;
    }

    private function sanitize_id(string $id): ?string
    {
        $id = strtolower(trim($id));
        return preg_match('/^[a-z0-9_]{1,96}$/', $id) === 1 ? $id : null;
    }

    private function derive_id(string $type, string $name): string
    {
        $slug = strtolower((string) preg_replace('/[^a-z0-9]+/i', '_', $name));
        $slug = trim($slug, '_');
        if ($slug === '') {
            $slug = 'n' . substr(md5($name), 0, 10);
        }

        return $type . '_' . substr($slug, 0, 48);
    }

    /**
     * @param array<string, mixed> $entry
     */
    private function ensure_index_line(string $index, array $entry): string
    {
        $lines = preg_split('/\r?\n/', $index) ?: [];
        $target = $entry['id'] . '.md';
        $line = '- [' . $entry['name'] . '](' . $target . ')' . ($entry['description'] !== '' ? ' - ' . $entry['description'] : '');
        $replaced = false;
        foreach ($lines as $i => $existing) {
            if (preg_match('/^\s*-\s+\[[^\]]+\]\(([^)]+)\)/', $existing, $match) && ($match[1] ?? '') === $target) {
                $lines[$i] = $line;
                $replaced = true;
                break;
            }
        }
        if (!$replaced) {
            if ($lines !== [] && end($lines) !== '') {
                $lines[] = '';
            }
            $lines[] = $line;
        }

        return implode("\n", $lines);
    }

    private function remove_index_line(string $index, string $id): string
    {
        $target = $id . '.md';
        $lines = preg_split('/\r?\n/', $index) ?: [];
        $lines = array_values(array_filter($lines, static function (string $line) use ($target): bool {
            return !(preg_match('/^\s*-\s+\[[^\]]+\]\(([^)]+)\)/', $line, $match) && ($match[1] ?? '') === $target);
        }));

        return implode("\n", $lines);
    }

    /**
     * @return array<string, bool>
     */
    private function parse_index_ids(string $index): array
    {
        $ids = [];
        foreach (preg_split('/\r?\n/', $index) ?: [] as $line) {
            if (!preg_match('/^\s*-\s+\[[^\]]+\]\(([^)]+)\)/', $line, $match)) {
                continue;
            }
            $target = (string) ($match[1] ?? '');
            if (!str_ends_with($target, '.md')) {
                continue;
            }
            $id = substr($target, 0, -3);
            if ($this->sanitize_id($id) !== null) {
                $ids[$id] = true;
            }
        }

        return $ids;
    }

    /**
     * @param array<string, mixed>|null $extraction
     * @return array<string, mixed>|null
     */
    private function mask_extraction(?array $extraction): ?array
    {
        if ($extraction === null || !is_string($extraction['provider'] ?? null)) {
            return null;
        }
        $api_key = is_string($extraction['apiKey'] ?? null) ? $extraction['apiKey'] : '';

        return [
            'provider' => $extraction['provider'],
            'model' => is_string($extraction['model'] ?? null) ? $extraction['model'] : '',
            'baseUrl' => is_string($extraction['baseUrl'] ?? null) ? $extraction['baseUrl'] : '',
            'apiVersion' => is_string($extraction['apiVersion'] ?? null) ? $extraction['apiVersion'] : '',
            'apiKeyTail' => $api_key !== '' ? substr($api_key, -4) : '',
            'apiKeyConfigured' => $api_key !== '',
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>|null
     */
    private function sanitize_extraction(array $input): ?array
    {
        $provider = is_string($input['provider'] ?? null) ? $input['provider'] : '';
        if (!in_array($provider, ['anthropic', 'openai', 'azure', 'google', 'ollama', 'senseaudio', 'aihubmix'], true)) {
            return null;
        }
        $out = ['provider' => $provider];
        foreach (['model', 'baseUrl', 'apiKey', 'apiVersion'] as $key) {
            if (is_string($input[$key] ?? null) && trim((string) $input[$key]) !== '') {
                $out[$key] = trim((string) $input[$key]);
            }
        }

        return $out;
    }

    /**
     * @return array<int, string>
     */
    private function extract_refs(string $body, string $label): array
    {
        preg_match_all('/^' . preg_quote($label, '/') . ':\s*([A-Za-z0-9_-]+)\s*$/mi', $body, $matches);

        return array_values(array_unique($matches[1] ?? []));
    }

    private function iso_time(int $ms): string
    {
        return gmdate('c', $ms > 0 ? (int) floor($ms / 1000) : 0);
    }

    private function encode_cursor(int $offset): string
    {
        return rtrim(strtr(base64_encode((string) max(0, $offset)), '+/', '-_'), '=');
    }

    private function decode_cursor(string $cursor): int
    {
        if ($cursor === '') return 0;
        $decoded = base64_decode(strtr($cursor, '-_', '+/'), true);
        return is_string($decoded) && ctype_digit($decoded) ? max(0, min(100000, (int) $decoded)) : 0;
    }

    /** @param array<string, mixed> $store */
    private function etag(array $store): string
    {
        return 'W/"pixflow-memory-' . (int) ($store['version'] ?? 1) . '"';
    }

    private function safe_memory_text(string $value, int $max): bool
    {
        if ($value === '' || strlen($value) > $max) return false;
        return preg_match('/(?:api[_ -]?key|secret|password|passwd|bearer|nonce|approval[_ -]?token|private[_ -]?key)/i', $value) !== 1;
    }

    /** @param array<string, mixed> $entry */
    private function memory_hash(array $entry): string
    {
        return hash('sha256', implode("\0", [
            (string) ($entry['name'] ?? ''),
            (string) ($entry['description'] ?? ''),
            (string) ($entry['type'] ?? ''),
            (string) ($entry['body'] ?? ''),
        ]));
    }
}
