<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) exit;

/** Read-only installation diagnostics. Package presence never grants a licence. */
final class ProInstallation
{
    public const BASENAME = 'pixflow-design-pro/pixflow-design-pro.php';

    public function register(): void
    {
        (new ProUpgradeNotice())->register();
    }

    public function status(bool $licensed, bool $has_license_history = false): array
    {
        $root = defined('WP_PLUGIN_DIR') ? WP_PLUGIN_DIR . '/pixflow-design-pro' : '';
        if ($root === '' || !is_file($root . '/pixflow-design-pro.php')) $state = 'missing';
        elseif (!$this->active()) $state = 'inactive';
        elseif (!$this->complete($root, true)) $state = 'incomplete';
        elseif (!class_exists(\PixflowDesign\Pro\Plugin::class, false)
            || \PixflowDesign\Pro\Plugin::dependency_error() !== null) $state = 'incompatible';
        else $state = 'active';

        return [
            'eligible' => $licensed,
            // A known past licence (trial or paid) is not a new trial candidate.
            // A licence-free site cannot identify account-wide history: ask the account.
            'trial_status' => ($licensed || $has_license_history) ? 'ineligible' : 'unknown',
            'installation' => $state,
            'account_url' => CentralEntitlements::delivery_origin() . '/account#pro-download',
            'plugins_url' => function_exists('self_admin_url') ? self_admin_url('plugins.php') : '',
            'upload_url' => function_exists('self_admin_url') ? self_admin_url('plugin-install.php?tab=upload') : '',
            // Discovery only. The website verifies eligibility; visiting never starts a trial.
            'trial_url' => !$licensed && defined('PIXFLOW_DESIGN_PRO_TRIALS_ENABLED') && PIXFLOW_DESIGN_PRO_TRIALS_ENABLED === true
                ? CentralEntitlements::delivery_origin() . '/account#pro-trial' : '',
        ];
    }

    private function active(): bool
    {
        return in_array(self::BASENAME, (array) get_option('active_plugins', []), true)
            || (function_exists('is_multisite') && is_multisite()
                && array_key_exists(self::BASENAME, (array) get_site_option('active_sitewide_plugins', [])));
    }

    /**
     * Check the shipped inventory without executing candidate PHP or changing files.
     * Only ordinary status diagnostics may reuse a successful check for 60 seconds.
     * Every call still validates the manifest, canonical paths and file metadata;
     * explicit installation checks always hash the bytes. This diagnostic cache
     * never establishes a licence or authorizes an operation.
     */
    public function complete(string $root, bool $allow_diagnostic_cache = false): bool
    {
        $raw = @file_get_contents($root . '/package-integrity.json');
        $manifest = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($manifest) || ($manifest['schema'] ?? null) !== 1
            || ($manifest['product'] ?? '') !== 'pixflow-design-pro'
            || !is_array($manifest['files'] ?? null) || count($manifest['files']) > 20000) return false;
        foreach (['pixflow-design-pro.php', 'src/Plugin.php', 'src/autoload.php'] as $required) {
            if (!isset($manifest['files'][$required])) return false;
        }
        $base = realpath($root);
        if ($base === false) return false;
        $files = [];
        $metadata = [];
        foreach ($manifest['files'] as $path => $hash) {
            if (!is_string($path) || !preg_match('~\A[a-zA-Z0-9_./-]+\z~D', $path)
                || str_starts_with($path, '/') || in_array('..', explode('/', $path), true)
                || !is_string($hash) || !preg_match('/\A[a-f0-9]{64}\z/D', $hash)) return false;
            clearstatcache(true, $root . '/' . $path);
            $file = realpath($root . '/' . $path);
            if ($file === false || !str_starts_with($file, $base . DIRECTORY_SEPARATOR)
                || !is_file($file) || !is_readable($file)) return false;
            clearstatcache(true, $file);
            $stat = @stat($file);
            if (!is_array($stat)) return false;
            $files[$file] = $hash;
            $metadata[$path] = [$file, $stat['dev'], $stat['ino'], $stat['size'], $stat['mtime'], $stat['ctime'], $stat['mode']];
        }
        $key = 'pixflow_pro_inventory_' . substr(hash('sha256', $base), 0, 32);
        $fingerprint = hash('sha256', $raw . json_encode($metadata));
        $cached = $allow_diagnostic_cache && function_exists('get_transient') ? get_transient($key) : false;
        if (is_array($cached) && ($cached['fingerprint'] ?? '') === $fingerprint
            && is_int($cached['verified_at'] ?? null) && $cached['verified_at'] <= time()
            && time() - $cached['verified_at'] < 60) return true;
        foreach ($files as $file => $hash) {
            if (!hash_equals($hash, (string) @hash_file('sha256', $file))) {
                if (function_exists('delete_transient')) delete_transient($key);
                return false;
            }
        }
        if (function_exists('set_transient')) set_transient($key, ['fingerprint'=>$fingerprint, 'verified_at'=>time()], 60);
        return true;
    }
}
