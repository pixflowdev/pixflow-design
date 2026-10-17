<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Chat;

if (!defined('ABSPATH')) exit;

/** Lossless storage encoding only. REST, exports and context always receive ordinary JSON. */
final class HistoryPayload
{
    private const PREFIX = 'PFCHAT1:';
    public const MIN_BYTES = 512;
    public const MAX_BYTES = 33554432;

    public static function available(): bool { return function_exists('gzencode') && function_exists('gzdecode'); }

    public static function encode(string $json): string
    {
        if (strlen($json) < self::MIN_BYTES || strlen($json) > self::MAX_BYTES || !self::available()) return $json;
        // Never turn malformed legacy data into an apparently valid archive.
        self::message($json);
        $gzip = gzencode($json, 6);
        if ($gzip === false) return $json;
        $stored = self::PREFIX . strlen($json) . ':' . hash('sha256', $json) . ':' . base64_encode($gzip);
        if (strlen($stored) > strlen($json) * 0.85) return $json;
        // Verify before replacing the sole durable representation.
        if (self::json($stored) !== $json) throw new \RuntimeException('Chat storage verification failed.');
        return $stored;
    }

    public static function json(string $stored): string
    {
        if (!str_starts_with($stored, self::PREFIX)) {
            if (str_starts_with($stored, 'PFCHAT')) throw new \RuntimeException('Unsupported chat storage version.');
            return $stored;
        }
        $parts = explode(':', $stored, 4);
        if (count($parts) !== 4 || !preg_match('/\A[1-9][0-9]{0,8}\z/D', $parts[1])
            || (int) $parts[1] > self::MAX_BYTES || !preg_match('/\A[a-f0-9]{64}\z/D', $parts[2])
            || !function_exists('gzdecode')) throw new \RuntimeException('Chat storage cannot be decoded.');
        $gzip = base64_decode($parts[3], true);
        if ($gzip === false) throw new \RuntimeException('Chat storage is damaged.');
        $json = @gzdecode($gzip, (int) $parts[1] + 1);
        if (!is_string($json) || strlen($json) !== (int) $parts[1] || !hash_equals($parts[2], hash('sha256', $json))) {
            throw new \RuntimeException('Chat storage verification failed.');
        }
        return $json;
    }

    public static function message(string $stored): array
    {
        $message = json_decode(self::json($stored), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($message)) throw new \RuntimeException('Invalid chat message storage.');
        return $message;
    }
}
