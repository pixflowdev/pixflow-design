<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Resources;
if (!defined('ABSPATH')) exit;

/** Text guidance is read in place; legacy executable examples remain private. */
final class BundledResources
{
    public const COLLECTIONS = ['skills', 'plugins', 'prompt-templates', 'design-templates', 'design-systems'];
    private static array $roots = [];

    /** Fresh Free installs need no writable resource directory at all. */
    public static function needs_private_preparation(): bool
    {
        foreach (['skills', 'plugins'] as $collection) {
            $path = PIXFLOW_DESIGN_PLUGIN_DIR . 'resources/bundled-' . $collection;
            if (!is_dir($path) || is_link($path)) return true;
        }
        $uploads = wp_upload_dir(null, false);
        if (!empty($uploads['error'])) return true;
        $legacy = rtrim((string) ($uploads['basedir'] ?? ''), '/\\') . '/pixflow-design/resource-packs';
        if ((file_exists($legacy) || is_link($legacy)) && !self::remove_empty_tree($legacy)) return true;
        foreach (self::COLLECTIONS as $collection) {
            $legacy = PIXFLOW_DESIGN_PLUGIN_DIR . $collection;
            if ((file_exists($legacy) || is_link($legacy)) && !self::remove_empty_tree($legacy)) return true;
        }
        return false;
    }

    /** Remove directories only: never unlink files, follow links or discard resources. */
    public static function remove_empty_tree(string $path, int $depth = 0): bool
    {
        if ($depth > 32 || is_link($path) || !is_dir($path)) return false;
        // A linked ancestor is just as unsafe as a linked leaf.
        for ($parent = dirname($path); $parent !== dirname($parent); $parent = dirname($parent)) {
            if (is_link($parent)) return false;
        }
        $entries = @scandir($path);
        if ($entries === false) return false;
        foreach ($entries as $name) {
            if ($name === '.' || $name === '..') continue;
            if (!self::remove_empty_tree($path . '/' . $name, $depth + 1)) return false;
        }
        // rmdir fails safely if a concurrent writer has added anything.
        return @rmdir($path);
    }

    public static function root(string $collection, ?string $package_dir = null): string
    {
        if (!in_array($collection, self::COLLECTIONS, true)) throw new \InvalidArgumentException('Unknown resource collection.');
        $package_dir ??= PIXFLOW_DESIGN_PLUGIN_DIR;
        // Free's required instructions and router are plain text shipped with the plugin.
        // They must not depend on writable storage, ZipArchive or a download.
        $guidance = $package_dir . 'resources/bundled-' . $collection;
        if (in_array($collection, ['skills', 'plugins'], true) && is_dir($guidance) && !is_link($guidance)) return $guidance;
        // Directory distributions contain ordinary, build-validated inert files.
        // No archive, download or writable storage is required to read them.
        $library = $package_dir . 'resources/bundled-library';
        $plain = $library . '/' . $collection;
        if (is_dir($library) && !is_link($library) && is_dir($plain) && !is_link($plain)) return $plain;
        self::prepare($package_dir);
        return self::$roots[$package_dir] . '/' . $collection;
    }

    public static function prepare(?string $package_dir = null): void
    {
        $package_dir ??= PIXFLOW_DESIGN_PLUGIN_DIR;
        if (isset(self::$roots[$package_dir])) return;
        $encrypted = (new ResourcePackPathService())->encrypted_tree();
        if ($encrypted !== null) {
            $archive = $package_dir . 'resources/bundled-library.zip';
            $revision = is_file($archive) ? hash_file('sha256', $archive) : 'legacy';
            if (is_file($archive)) {
                $valid = (new ResourcePackInstallService())->validate_archive($archive);
                if (is_wp_error($valid)) throw new \RuntimeException('Bundled library validation failed.');
                $zip = new \ZipArchive();
                if ($zip->open($archive) !== true) throw new \RuntimeException('Bundled library unavailable.');
                try {
                    for ($i = 0; $i < $zip->numFiles; $i++) {
                        $name = $zip->getNameIndex($i);
                        if (!is_string($name) || str_ends_with($name, '/')) continue;
                        $bytes = $zip->getFromIndex($i);
                        if (!is_string($bytes)) throw new \RuntimeException('Bundled library read failed.');
                        $encrypted->put('_bundled/' . $revision . '/' . $name, $bytes);
                    }
                } finally { $zip->close(); }
            }
            self::$roots[$package_dir] = (new ResourcePackPathService())->base_dir() . '/_bundled/' . $revision;
            return;
        }
        $base = (new ResourcePackPathService())->base_dir();
        $archive = $package_dir . 'resources/bundled-library.zip';
        $revision = is_file($archive) ? hash_file('sha256', $archive) : 'legacy';
        $root = $base . '/_bundled/' . $revision;
        if (!wp_mkdir_p(dirname($root))) throw new \RuntimeException('Private library directory unavailable.');
        $lock = @fopen($base . '/.bundled-migration.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX)) throw new \RuntimeException('Private library lock unavailable.');
        try {
            if (is_file($archive) && !is_dir($root)) {
                $valid = (new ResourcePackInstallService())->validate_archive($archive);
                if (is_wp_error($valid)) throw new \RuntimeException('Bundled library validation failed.');
                $stage = $root . '-staging-' . bin2hex(random_bytes(8));
                if (!wp_mkdir_p($stage)) throw new \RuntimeException('Private library staging unavailable.');
                $zip = new \ZipArchive();
                if ($zip->open($archive) !== true) throw new \RuntimeException('Bundled library unavailable.');
                try { if (!$zip->extractTo($stage)) throw new \RuntimeException('Private library extraction failed.'); }
                finally { $zip->close(); }
                if (!rename($stage, $root)) throw new \RuntimeException('Private library activation failed.');
            }
            if (!wp_mkdir_p($root)) throw new \RuntimeException('Private library unavailable.');
            // Normal WP upgrades remove obsolete files. In-place/FTP upgrades
            // may leave older examples behind: retain them privately, never erase.
            foreach ($package_dir === PIXFLOW_DESIGN_PLUGIN_DIR ? self::COLLECTIONS : [] as $collection) {
                $old = PIXFLOW_DESIGN_PLUGIN_DIR . $collection;
                if (!is_dir($old)) continue;
                $preserved = $base . '/_legacy-bundled/' . hash('sha256', PIXFLOW_DESIGN_PLUGIN_DIR) . '/' . $collection;
                if (is_link($old) || file_exists($preserved)) throw new \RuntimeException('Legacy resource migration needs host assistance.');
                foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($old, \FilesystemIterator::SKIP_DOTS)) as $entry) {
                    if ($entry->isLink() || !$entry->isFile()) throw new \RuntimeException('Unsafe legacy resource path.');
                }
                if (!wp_mkdir_p(dirname($preserved)) || !rename($old, $preserved)) throw new \RuntimeException('Could not secure legacy bundled resources.');
            }
            self::$roots[$package_dir] = $root;
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    public static function legacy_root(string $collection): string
    {
        if (!in_array($collection, self::COLLECTIONS, true)) return '';
        return (new ResourcePackPathService())->base_dir() . '/_legacy-bundled/' . hash('sha256', PIXFLOW_DESIGN_PLUGIN_DIR) . '/' . $collection;
    }

    /** Read-only fallback for saved references removed from a newer bundle. */
    public static function historical_roots(string $collection): array
    {
        if (!in_array($collection, self::COLLECTIONS, true)) return [];
        $base = (new ResourcePackPathService())->base_dir() . '/_bundled';
        if (!is_dir($base) || is_link($base)) return [];
        $roots = [];
        foreach (new \DirectoryIterator($base) as $entry) {
            if (!$entry->isDir() || $entry->isLink() || !preg_match('/^[a-f0-9]{64}$/D', $entry->getBasename())) continue;
            $path = $base . '/' . $entry->getBasename() . '/' . $collection;
            if (is_dir($path) && !is_link($path)) $roots[] = $path;
        }
        sort($roots, SORT_STRING);
        return $roots;
    }
}
