<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Storage;
if (!defined('ABSPATH')) exit;

/** Authenticated encrypted resource objects. No plaintext or key is written to disk. */
final class EncryptedResourceStore
{
    private const MAGIC = "PXR1";
    private const MAX_BYTES = 16777216;
    public function __construct(private readonly string $root, private readonly string $key)
    {
        if (strlen($key) !== 32 || !function_exists('openssl_encrypt')) throw new \RuntimeException('Resource encryption is unavailable.');
        self::assert_path($root);
        if (!is_dir($root) && !@mkdir($root, 0700, true)) throw new \RuntimeException('Encrypted resource storage is not writable.');
    }

    /** The random key must survive upgrades, salt rotation and database backups. */
    public static function open(string $root): self
    {
        self::assert_path($root);
        $option = 'pixflow_design_resource_encryption_key_v1';
        $encoded = get_option($option, null);
        if ($encoded === null) {
            // Never silently replace a lost key and strand previously encrypted files.
            if (is_dir($root) && array_diff(scandir($root) ?: [], ['.', '..']) !== []) {
                throw new \RuntimeException('The resource encryption key is missing. Restore the matching database backup; encrypted files have been kept.');
            }
            add_option($option, base64_encode(random_bytes(32)), '', false);
            // Read the winning value if another request created the key first.
            $encoded = get_option($option, null);
        }
        $key = is_string($encoded) ? base64_decode($encoded, true) : false;
        if ($key === false || strlen($key) !== 32) throw new \RuntimeException('The resource encryption key is invalid. Files have been kept.');
        return new self($root, $key);
    }

    private static function assert_path(string $path): void
    {
        if (!preg_match('~^(?:[A-Za-z]:[/\\\\]|/)~', $path) || preg_match('~[\x00-\x1f]|(?:^|[/\\\\])\.{1,2}(?:[/\\\\]|$)~', $path)) throw new \RuntimeException('Invalid encrypted storage path.');
        for ($part = $path; ; $part = dirname($part)) {
            if (is_link($part)) throw new \RuntimeException('Linked encrypted storage is not allowed.');
            if (dirname($part) === $part) break;
        }
    }
    private function id(string $name): string
    {
        if ($name === '' || strlen($name) > 2048 || preg_match('~[\\\\:\x00-\x1f]|^/|/$|//|(?:^|/)\.{1,2}(?:/|$)~', $name)) throw new \RuntimeException('Invalid resource name.');
        return hash_hmac('sha256', $name, $this->key);
    }
    private function path(string $name): string
    {
        $path = $this->root . '/' . $this->id($name) . '.pxr';
        self::assert_path($path);
        return $path;
    }
    public function read(string $name): string
    {
        $path = $this->path($name);
        $size = @filesize($path);
        if ($size === false || $size < 32 || $size > self::MAX_BYTES + 32) throw new \RuntimeException('Encrypted resource is missing or invalid.');
        $bytes = @file_get_contents($path);
        if (!is_string($bytes) || substr($bytes, 0, 4) !== self::MAGIC) throw new \RuntimeException('Encrypted resource header is invalid.');
        $plain = openssl_decrypt(substr($bytes, 32), 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, substr($bytes, 4, 12), substr($bytes, 16, 16), self::MAGIC . $name);
        if ($plain === false) throw new \RuntimeException('Encrypted resource authentication failed. Files have been kept.');
        return $plain;
    }
    /** Immutable write: retries accept identical bytes; conflicting content is never overwritten. */
    public function put(string $name, string $plain): void
    {
        if (strlen($plain) > self::MAX_BYTES) throw new \RuntimeException('Resource exceeds the encrypted transfer limit. Original file has been kept.');
        $path = $this->path($name);
        $lockPath = $this->root . '/.write.lock';
        self::assert_path($lockPath);
        $lock = @fopen($lockPath, 'c');
        if (!$lock) throw new \RuntimeException('Cannot lock encrypted storage.');
        $stage = null;
        try {
            if (!flock($lock, LOCK_EX)) throw new \RuntimeException('Cannot lock encrypted storage.');
            clearstatcache(true, $path);
            if (file_exists($path)) {
                if (!hash_equals(hash('sha256', $plain), hash('sha256', $this->read($name)))) throw new \RuntimeException('Conflicting resource copies have been kept.');
                return;
            }
            $iv = random_bytes(12); $tag = '';
            $cipher = openssl_encrypt($plain, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag, self::MAGIC . $name, 16);
            if ($cipher === false || strlen($tag) !== 16) throw new \RuntimeException('Resource encryption failed.');
            $bytes = self::MAGIC . $iv . $tag . $cipher;
            $stage = $this->root . '/' . bin2hex(random_bytes(24)) . '.stage';
            $handle = @fopen($stage, 'x');
            if (!$handle) throw new \RuntimeException('Cannot stage encrypted resource.');
            try {
                $offset = 0;
                while ($offset < strlen($bytes)) {
                    $written = fwrite($handle, substr($bytes, $offset));
                    if (!$written) throw new \RuntimeException('Incomplete encrypted write.');
                    $offset += $written;
                }
                if (!fflush($handle) || (function_exists('fsync') && !fsync($handle))) throw new \RuntimeException('Cannot flush encrypted resource.');
            } finally { fclose($handle); }
            if (!@rename($stage, $path)) throw new \RuntimeException('Cannot activate encrypted resource.');
            $stage = null;
            if (!hash_equals(hash('sha256', $plain), hash('sha256', $this->read($name)))) throw new \RuntimeException('Encrypted read-back failed.');
        } finally {
            if ($stage !== null && is_file($stage) && !is_link($stage)) @unlink($stage);
            flock($lock, LOCK_UN); fclose($lock);
        }
    }

    /** Copy and verify one legacy file. Retirement is a separate, explicitly coordinated step. */
    public function preserve_file(string $name, string $source): array
    {
        self::assert_path($source);
        $size = @filesize($source);
        if ($size === false || $size > self::MAX_BYTES || !is_file($source)) throw new \RuntimeException('Legacy resource cannot be safely transferred. Original has been kept.');
        $plain = @file_get_contents($source);
        if (!is_string($plain) || strlen($plain) !== $size) throw new \RuntimeException('Legacy resource changed while reading. Original has been kept.');
        $hash = hash('sha256', $plain);
        $this->put($name, $plain);
        if (!hash_equals($hash, hash('sha256', $this->read($name))) || !hash_equals($hash, (string) @hash_file('sha256', $source))) throw new \RuntimeException('Resource changed during verification. Original has been kept.');
        return ['name' => $name, 'sha256' => $hash, 'bytes' => $size];
    }
}
