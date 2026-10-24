<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Storage;
if (!defined('ABSPATH')) exit;

/** Immutable encrypted objects with a database-owned directory index.
 * Publishing the index is the commit point. Interrupted writes leave only harmless
 * encrypted objects; readers never see partial files. Originals are not removed.
 */
final class EncryptedResourceTree
{
    private readonly EncryptedResourceStore $store;
    private readonly string $option;
    public function __construct(private readonly string $root)
    {
        $this->store = EncryptedResourceStore::open($root);
        $this->option = 'pixflow_resource_tree_' . hash('sha256', $root);
    }
    public static function name(string $name): string
    {
        if ($name === '' || strlen($name) > 2048 || preg_match('~[\\\\:\x00-\x1f]|^/|/$|//|(?:^|/)\.{1,2}(?:/|$)~', $name)) throw new \RuntimeException('Invalid resource path.');
        return $name;
    }
    public function entries(): array
    {
        $value = get_option($this->option, []);
        if (!is_array($value)) throw new \RuntimeException('Resource index is invalid. Files have been kept.');
        return $value;
    }
    public function mount_id(): string { return substr(hash('sha256', $this->root), 0, 32); }
    public function read(string $name): string
    {
        $entry = $this->entries()[self::name($name)] ?? null;
        if (!is_array($entry) || !is_string($entry['object'] ?? null)) throw new \RuntimeException('Resource is unavailable.');
        $bytes = $this->store->read($entry['object']);
        if (!hash_equals((string) ($entry['sha256'] ?? ''), hash('sha256', $bytes)) || strlen($bytes) !== ($entry['bytes'] ?? null)) throw new \RuntimeException('Resource index verification failed.');
        return $bytes;
    }
    /** The same lock also serializes Pro's library state changes with installation. */
    public function locked(\Closure $operation, string $scope = 'tree'): mixed
    {
        if (!in_array($scope, ['tree', 'recovery'], true)) throw new \RuntimeException('Invalid resource lock scope.');
        $path = $this->root . '/.' . $scope . '.lock';
        if (is_link($path)) throw new \RuntimeException('Unsafe resource lock.');
        $lock = @fopen($path, 'c');
        if (!$lock) throw new \RuntimeException('Resource lock unavailable.');
        try {
            if (!flock($lock, LOCK_EX | LOCK_NB)) throw new \RuntimeException('Another resource operation is in progress. Try again.');
            if (function_exists('wp_cache_delete')) wp_cache_delete($this->option, 'options');
            return $operation();
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
    public function put(string $name, string $bytes): void
    {
        $this->locked(fn() => $this->put_locked($name, $bytes));
    }
    /** Caller owns locked(). Existing versions are immutable, including after removal. */
    public function put_locked(string $name, string $bytes): void
    {
        self::name($name);
        $entries = $this->entries();
        $hash = hash('sha256', $bytes);
        if (isset($entries[$name])) {
            if (!hash_equals($hash, hash('sha256', $this->read($name)))) throw new \RuntimeException('Conflicting resource copies have been kept.');
            return;
        }
        $entries[$name] = $this->stage($name, $bytes);
        $this->commit($entries);
    }
    private function stage(string $name, string $bytes): array
    {
        $hash = hash('sha256', $bytes);
        $object = 'objects/' . hash('sha256', $name) . '/' . $hash;
        $this->store->put($object, $bytes);
        if ($this->store->read($object) !== $bytes) throw new \RuntimeException('Resource read-back failed.');
        return ['object'=>$object, 'sha256'=>$hash, 'bytes'=>strlen($bytes)];
    }
    private function commit(array $entries): void
    {
        if (!update_option($this->option, $entries, false) && $this->entries() !== $entries) throw new \RuntimeException('Could not commit resource index. Original files have been kept.');
    }
    /** Bounded, resumable copy. Complete means every current source file was verified.
     * This never authorizes source retirement: callers must separately verify all readers.
     */
    public function import(string $source, string $prefix = '', int $budget = 50): array
    {
        if ($prefix !== '') self::name($prefix);
        for ($part = $source; ; $part = dirname($part)) {
            if (is_link($part)) throw new \RuntimeException('Linked resources cannot be migrated.');
            if (dirname($part) === $part) break;
        }
        if (!is_dir($source)) throw new \RuntimeException('Resource source is unavailable.');
        $source = rtrim($source, '/\\');
        return $this->locked(function () use ($source, $prefix, $budget): array {
            $copied = 0; $verified = 0; $bytesCopied = 0;
            $entries = $this->entries();
            $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS));
            foreach ($iterator as $file) {
                if ($file->isLink() || !$file->isFile()) throw new \RuntimeException('Unsafe resource source. Original files have been kept.');
                $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($source) + 1));
                $name = self::name(($prefix !== '' ? $prefix . '/' : '') . $relative);
                $entry = $entries[$name] ?? null;
                $known = is_array($entry);
                if ($known) {
                    // The immutable encrypted object was read back before its receipt
                    // committed. Retry checks the current source hash, without repeatedly
                    // decrypting the entire already-copied library on every batch.
                    // Retirement independently authenticates the ciphertext again.
                    if (!hash_equals((string) ($entry['sha256'] ?? ''), (string) hash_file('sha256', $file->getPathname()))) throw new \RuntimeException('Resource changed during migration. Both copies have been kept.');
                    $verified++;
                    continue;
                }
                if ($copied >= max(1, min(200, $budget)) || $bytesCopied >= 16777216) {
                    $this->commit($entries);
                    return ['complete'=>false, 'copied'=>$copied, 'verified'=>$verified];
                }
                if ($file->getSize() > 16777216) throw new \RuntimeException('Resource exceeds the encrypted transfer limit. Original file has been kept.');
                $bytes = file_get_contents($file->getPathname());
                if (!is_string($bytes)) throw new \RuntimeException('Cannot read resource source.');
                $entries[$name] = $this->stage($name, $bytes);
                if (!hash_equals($entries[$name]['sha256'], (string) hash_file('sha256', $file->getPathname()))) throw new \RuntimeException('Resource changed during migration. Both copies have been kept.');
                $verified++;
                if (!$known) { $copied++; $bytesCopied += strlen($bytes); }
            }
            if ($copied > 0) $this->commit($entries);
            return ['complete'=>true, 'copied'=>$copied, 'verified'=>$verified];
        });
    }
}
