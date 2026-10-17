<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Security;

if (!defined('ABSPATH')) {
    exit;
}

final class SecretBox
{
    private const PREFIX = 'pfdesign-secret:v1:';
    private const LEGACY_PREFIX = 'pfai-secret:v1:';
    private const CIPHER = 'aes-256-gcm';

    public static function is_encrypted(string $value): bool
    {
        return str_starts_with($value, self::PREFIX) || str_starts_with($value, self::LEGACY_PREFIX);
    }

    public static function encrypt(string $plain_text): string
    {
        $plain_text = trim($plain_text);
        if ($plain_text === '' || self::is_encrypted($plain_text) || !self::can_encrypt()) {
            return $plain_text;
        }

        try {
            $iv = random_bytes(12);
        } catch (\Throwable) {
            return $plain_text;
        }

        $tag = '';
        $cipher_text = openssl_encrypt(
            $plain_text,
            self::CIPHER,
            self::key(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            16
        );

        if (!is_string($cipher_text) || $cipher_text === '' || $tag === '') {
            return $plain_text;
        }

        return self::PREFIX
            . self::base64url_encode($iv)
            . ':'
            . self::base64url_encode($tag)
            . ':'
            . self::base64url_encode($cipher_text);
    }

    public static function decrypt(string $stored_value): string
    {
        $stored_value = trim($stored_value);
        if ($stored_value === '' || !self::is_encrypted($stored_value) || !self::can_encrypt()) {
            return self::is_encrypted($stored_value) ? '' : $stored_value;
        }

        $prefix = str_starts_with($stored_value, self::LEGACY_PREFIX)
            ? self::LEGACY_PREFIX
            : self::PREFIX;
        $parts = explode(':', substr($stored_value, strlen($prefix)));
        if (count($parts) !== 3) {
            return '';
        }

        [$encoded_iv, $encoded_tag, $encoded_cipher_text] = $parts;
        $iv = self::base64url_decode($encoded_iv);
        $tag = self::base64url_decode($encoded_tag);
        $cipher_text = self::base64url_decode($encoded_cipher_text);
        if ($iv === '' || $tag === '' || $cipher_text === '') {
            return '';
        }

        $plain_text = openssl_decrypt(
            $cipher_text,
            self::CIPHER,
            self::key(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        return is_string($plain_text) ? trim($plain_text) : '';
    }

    private static function can_encrypt(): bool
    {
        return function_exists('openssl_encrypt')
            && function_exists('openssl_decrypt')
            && in_array(self::CIPHER, openssl_get_cipher_methods(), true);
    }

    private static function key(): string
    {
        // Pixflow-owned: keep key material compatible with legacy Pixflow AI
        // license cache decryption while writing new Design-prefixed secrets.
        return hash('sha256', wp_salt('auth') . '|' . wp_salt('secure_auth') . '|pixflow-ai-secret-box-v1', true);
    }

    private static function base64url_encode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64url_decode(string $value): string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return is_string($decoded) ? $decoded : '';
    }
}
