<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Assets;
if (!defined('ABSPATH')) exit;

/** Cache-busting metadata only: never use these digests as an integrity verdict. */
final class AssetRevision
{
    public static function fingerprint(array $paths): string
    {
        $revisions = [];
        $manifests = [];
        foreach (array_unique($paths) as $path) {
            clearstatcache(true, $path);
            $stat = @stat($path);
            if (!is_array($stat) || !is_file($path) || !is_readable($path)) {
                $revisions[$path] = 'missing';
                continue;
            }
            $metadata = [$stat['dev'], $stat['ino'], $stat['size'], $stat['mtime'], $stat['ctime']];
            $manifest_path = dirname($path) . '/asset-revisions.json';
            if (!array_key_exists($manifest_path, $manifests)) {
                $raw = is_file($manifest_path) ? @file_get_contents($manifest_path) : false;
                $manifest = is_string($raw) ? json_decode($raw, true) : null;
                $manifests[$manifest_path] = is_array($manifest) && ($manifest['version'] ?? null) === 1
                    && is_array($manifest['files'] ?? null) ? $manifest['files'] : [];
            }
            $entry = $manifests[$manifest_path][basename($path)] ?? null;
            if (is_array($entry) && ($entry['size'] ?? null) === $stat['size']
                && is_string($entry['sha256'] ?? null) && preg_match('/\A[a-f0-9]{64}\z/D', $entry['sha256'])) {
                // Built alongside final JS/CSS bytes. Same-version builds change
                // this digest even when reproducible archives preserve mtimes.
                $digest = $entry['sha256'];
            } else {
                // Older/local packages without a manifest retain content-based
                // cache busting; metadata changes invalidate the short cache.
                $key = 'pixflow_asset_revision_' . substr(hash('sha256', $path), 0, 32);
                $cached = function_exists('get_transient') ? get_transient($key) : false;
                if (is_array($cached) && ($cached['metadata'] ?? null) === $metadata
                    && is_string($cached['sha256'] ?? null) && preg_match('/\A[a-f0-9]{64}\z/D', $cached['sha256'])
                    && is_int($cached['at'] ?? null) && $cached['at'] <= time() && time() - $cached['at'] < 60) {
                    $digest = $cached['sha256'];
                } else {
                    $digest = @hash_file('sha256', $path) ?: 'unavailable';
                    if ($digest !== 'unavailable' && function_exists('set_transient')) {
                        set_transient($key, ['metadata'=>$metadata, 'sha256'=>$digest, 'at'=>time()], 60);
                    }
                }
            }
            // Also bust when a locally replaced file changes its metadata before
            // the next full build. Never require customer cache purges to upgrade.
            $revisions[$path] = [$digest, $metadata];
        }
        return substr(hash('sha256', serialize($revisions)), 0, 12);
    }
}
