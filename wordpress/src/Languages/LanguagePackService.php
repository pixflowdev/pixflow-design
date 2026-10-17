<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Languages;
if (!defined('ABSPATH')) exit;

/** Downloaded dictionaries are inert, digest-pinned data, never PHP or JavaScript. */
final class LanguagePackService
{
    private const OPTION = 'pixflow_design_language_packs_v1';
    private const MAX_BYTES = 3145728;
    private const ORIGIN = 'https://pixflow.dev/api/languages/v1/';

    public function __construct(private readonly ?string $manifestPath = null) {}

    public function manifest(): array
    {
        $path = $this->manifestPath ?? (defined('PIXFLOW_DESIGN_PLUGIN_DIR') ? PIXFLOW_DESIGN_PLUGIN_DIR : dirname(__DIR__, 2) . '/') . 'resources/language-packs.json';
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (!is_array($data) || ($data['schema'] ?? null) !== 1 || !is_array($data['locales'] ?? null)) return [];
        $valid = [];
        foreach ($data['locales'] as $locale => $entry) {
            if (!is_string($locale) || !preg_match('/^[a-z]{2}(?:-[A-Z]{2})?$/D', $locale) || $locale === 'en' || !is_array($entry)) continue;
            $hash = $entry['sha256'] ?? '';
            if (!is_string($hash) || !preg_match('/^[a-f0-9]{64}$/D', $hash)) continue;
            if (($entry['file'] ?? '') !== $locale . '-' . $hash . '.json') continue;
            if (!is_int($entry['bytes'] ?? null) || $entry['bytes'] < 2 || $entry['bytes'] > self::MAX_BYTES) continue;
            $valid[$locale] = $entry;
        }
        return $valid;
    }

    public function overview(): array
    {
        $installed = $this->receipts();
        $languages = [['locale'=>'en', 'installed'=>true, 'bundled'=>true, 'updateAvailable'=>false]];
        foreach ($this->manifest() as $locale => $entry) {
            $receipt = $installed[$locale] ?? null;
            $present = is_array($receipt) && $this->receiptPath($locale, $receipt) !== null;
            $languages[] = ['locale'=>$locale, 'installed'=>$present, 'bundled'=>false, 'updateAvailable'=>$present && ($receipt['sha256'] ?? '') !== $entry['sha256'], 'sha256'=>$entry['sha256'], 'bytes'=>$entry['bytes'], 'wpLocale'=>$entry['wpLocale'] ?? $locale];
        }
        return ['languages'=>$languages, 'canInstall'=>current_user_can('manage_options')];
    }

    public function read(string $locale): array
    {
        if (!isset($this->manifest()[$locale])) throw new \OutOfBoundsException('This language is not available.');
        $receipt = $this->receipts()[$locale] ?? null;
        $path = is_array($receipt) ? $this->receiptPath($locale, $receipt) : null;
        if ($path === null) throw new \OutOfBoundsException('Download this language before applying it.');
        return $this->validate((string) file_get_contents($path), $locale, $receipt);
    }

    public function install(string $locale): array
    {
        $entry = $this->manifest()[$locale] ?? null;
        if (!is_array($entry)) throw new \OutOfBoundsException('This language is not available.');
        $response = wp_safe_remote_get(self::ORIGIN . $entry['file'], ['timeout'=>30, 'redirection'=>0, 'limit_response_size'=>$entry['bytes'] + 1, 'headers'=>['Accept'=>'application/json']]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) throw new \RuntimeException('The language could not be downloaded. Please try again.');
        $body = wp_remote_retrieve_body($response);
        $payload = $this->validate($body, $locale, $entry);
        $directory = $this->directory(true);
        $this->writeImmutable($directory . '/' . $entry['file'], $body);
        $mo = [];
        foreach (($payload['wordpress'] ?? []) as $domain => $encoded) {
            $bytes = base64_decode($encoded, true);
            $filename = $locale . '-' . $entry['sha256'] . '-' . $domain . '.mo';
            $this->writeImmutable($directory . '/' . $filename, $bytes);
            $mo[$domain] = ['file'=>$filename, 'sha256'=>hash('sha256', $bytes), 'bytes'=>strlen($bytes)];
        }
        // The receipt changes only after every file is complete. Failed updates retain the previous pack.
        $lockPath = $directory . '/.receipts.lock';
        if (is_link($lockPath)) throw new \RuntimeException('Language storage is unsafe.');
        $lock = fopen($lockPath, 'c');
        if ($lock === false) throw new \RuntimeException('The language could not be installed.');
        try {
            if (!flock($lock, LOCK_EX)) throw new \RuntimeException('The language could not be installed.');
            // Clear the request's option cache before merging concurrent, different-language installs.
            wp_cache_delete(self::OPTION, 'options');
            wp_cache_delete('notoptions', 'options');
            $installed = $this->receipts();
            $installed[$locale] = $entry + ['mo'=>$mo];
            update_option(self::OPTION, $installed, false);
            wp_cache_delete(self::OPTION, 'options');
            wp_cache_delete('notoptions', 'options');
            if (($this->receipts()[$locale] ?? null) !== $installed[$locale]) throw new \RuntimeException('The language could not be registered. Please try again.');
        } finally { flock($lock, LOCK_UN); fclose($lock); }
        return $payload;
    }

    private function validate(string $body, string $locale, array $entry): array
    {
        if (strlen($body) !== ($entry['bytes'] ?? 0) || strlen($body) > self::MAX_BYTES || !hash_equals((string) ($entry['sha256'] ?? ''), hash('sha256', $body))) throw new \RuntimeException('Language verification failed. Your existing language has been kept.');
        $payload = json_decode($body, true, 64);
        if (!is_array($payload) || ($payload['schema'] ?? null) !== 1 || ($payload['locale'] ?? null) !== $locale || !is_array($payload['dictionary'] ?? null) || !$payload['dictionary'] || !is_array($payload['content'] ?? null) || !is_array($payload['wordpress'] ?? null)) throw new \RuntimeException('The language file is invalid.');
        foreach ($payload['dictionary'] as $key => $value) if (!is_string($key) || !is_string($value)) throw new \RuntimeException('The language dictionary is invalid.');
        foreach ($payload['wordpress'] as $domain => $encoded) {
            if (!in_array($domain, ['pixflow-design', 'pixflow-design-pro'], true) || !is_string($encoded)) throw new \RuntimeException('The translation domain is invalid.');
            $bytes = base64_decode($encoded, true);
            if (!is_string($bytes) || strlen($bytes) < 28 || !in_array(substr($bytes, 0, 4), ["\xde\x12\x04\x95", "\x95\x04\x12\xde"], true)) throw new \RuntimeException('The WordPress translation is invalid.');
        }
        return $payload;
    }

    private function receipts(): array
    {
        $value = get_option(self::OPTION, []);
        return is_array($value) ? $value : [];
    }

    private function receiptPath(string $locale, array $entry): ?string
    {
        $hash = $entry['sha256'] ?? '';
        if (!is_string($hash) || !preg_match('/^[a-f0-9]{64}$/D', $hash) || ($entry['file'] ?? '') !== $locale . '-' . $hash . '.json' || !is_int($entry['bytes'] ?? null) || $entry['bytes'] > self::MAX_BYTES) return null;
        try { $path = $this->directory(false) . '/' . $entry['file']; } catch (\Throwable) { return null; }
        return !is_link($path) && is_file($path) && filesize($path) === $entry['bytes'] ? $path : null;
    }

    private function directory(bool $create): string
    {
        $uploads = wp_upload_dir(null, false);
        if (!empty($uploads['error']) || empty($uploads['basedir'])) throw new \RuntimeException('Language storage is unavailable.');
        $base = rtrim(str_replace('\\', '/', $uploads['basedir']), '/');
        // Refuse symlink traversal, including ancestors. Never follow a user-controlled pack path.
        $ancestor = $base;
        while ($ancestor !== '' && dirname($ancestor) !== $ancestor) {
            if (is_link($ancestor)) throw new \RuntimeException('Language storage contains an unsupported symbolic link.');
            $ancestor = dirname($ancestor);
        }
        foreach ([$base, $base . '/pixflow-design', $base . '/pixflow-design/languages'] as $directory) {
            if (is_link($directory) || (file_exists($directory) && !is_dir($directory))) throw new \RuntimeException('Language storage is unsafe.');
            if (!is_dir($directory) && (!$create || !wp_mkdir_p($directory))) throw new \RuntimeException('Language storage could not be created.');
        }
        return $base . '/pixflow-design/languages';
    }

    private function writeImmutable(string $path, string $bytes): void
    {
        if (is_link($path)) throw new \RuntimeException('Language storage is unsafe.');
        if (is_file($path) && hash_equals(hash('sha256', $bytes), (string) hash_file('sha256', $path))) return;
        $temporary = tempnam(dirname($path), '.language-');
        if ($temporary === false) throw new \RuntimeException('The language could not be saved.');
        try {
            if (file_put_contents($temporary, $bytes, LOCK_EX) !== strlen($bytes)) throw new \RuntimeException('The language could not be saved.');
            if (!rename($temporary, $path)) throw new \RuntimeException('The language could not be installed.');
        } finally { if (is_file($temporary)) unlink($temporary); }
    }

    /** WordPress translations use tiny verified MO files, without downloading or hashing the JSON catalogue on init. */
    public static function register(): void
    {
        add_filter('load_textdomain_mofile', [self::class, 'installed_mofile'], 10, 2);
    }

    /** Directory installs need no bundled textdomain path, including on WordPress 6.2. */
    public static function load_installed(string $domain): void
    {
        $path = self::installed_mofile('', $domain);
        if ($path !== '') load_textdomain($domain, $path);
    }

    /** Preserve pinned legacy MOs while deriving the one omitted GNU header field. */
    private function compatible_mofile(string $path, array $receipt): string
    {
        $header = file_get_contents($path, false, null, 0, 28);
        if (!is_string($header) || strlen($header) !== 28 || substr($header, 0, 4) !== "\xde\x12\x04\x95") return $path;
        $fields = unpack('Vmagic/Vrevision/Vcount/Voriginals/Vtranslations/VhashLength/VhashAddress', $header);
        if (!$fields || $fields['revision'] !== 0 || $fields['count'] < 1
            || $fields['originals'] !== 28 || $fields['translations'] !== 28 + $fields['count'] * 8
            || $fields['hashLength'] !== 0 || $fields['hashAddress'] !== 0) return $path;
        $tableEnd = 28 + $fields['count'] * 16;
        if ($tableEnd > ($receipt['bytes'] ?? 0)) return $path;
        try {
            $bytes = file_get_contents($path);
            // Reverify the full bytes used for conversion, not just the earlier
            // stat/hash result. Never derive data from a changed original.
            if (!is_string($bytes) || !hash_equals($receipt['sha256'], hash('sha256', $bytes))) return $path;
            $compatible = substr_replace($bytes, pack('V', $tableEnd), 24, 4);
            $derived = substr($path, 0, -3) . '-wp62-' . hash('sha256', $compatible) . '.mo';
            $this->writeImmutable($derived, $compatible);
            return $derived;
        } catch (\Throwable) {
            // The existing pack/receipt stay usable on readers that accept the
            // legacy header, even if a read-only host cannot cache a derivative.
            return $path;
        }
    }

    public static function installed_mofile(string $path, string $domain): string
    {
        // Directory identity uses the approved-candidate slug; downloaded
        // pack receipts keep their stable domain and immutable filenames.
        if ($domain === 'pixflow-ai') $domain = 'pixflow-design';
        if (!in_array($domain, ['pixflow-design', 'pixflow-design-pro'], true)) return $path;
        $service = new self();
        $wpLocale = function_exists('determine_locale') ? determine_locale() : get_locale();
        foreach ($service->manifest() as $locale => $entry) {
            if (($entry['wpLocale'] ?? '') !== $wpLocale) continue;
            $receipt = $service->receipts()[$locale] ?? null;
            if (!is_array($receipt) || $service->receiptPath($locale, $receipt) === null) return $path;
            $mo = $receipt['mo'][$domain] ?? null;
            $expected = $locale . '-' . $receipt['sha256'] . '-' . $domain . '.mo';
            if (!is_array($mo) || ($mo['file'] ?? '') !== $expected) return $path;
            $candidate = $service->directory(false) . '/' . $expected;
            if (!is_link($candidate) && is_file($candidate) && filesize($candidate) === ($mo['bytes'] ?? 0) && hash_equals((string) ($mo['sha256'] ?? ''), (string) hash_file('sha256', $candidate))) return $service->compatible_mofile($candidate, $mo);
        }
        return $path;
    }
}
