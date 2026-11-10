<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Resources;

if (!defined('ABSPATH')) exit;

/** Delete only retired download trees; keep bundled guidance and user data. */
final class RetiredResourceCleanup
{
    public const SLUGS = ['plugins', 'design-templates', 'design-systems'];
    private const STATE = 'pixflow_design_retired_resources_cleanup_v1';
    private const HOOK = 'pixflow_design_retired_resources_cleanup';

    public static function register(): void
    {
        add_action(self::HOOK, [self::class, 'run']);
        add_action('admin_init', static function (): void {
            if (current_user_can('manage_options')) self::run();
        });
        add_action('init', static function (): void {
            $state = get_option(self::STATE, []);
            if (is_array($state) && ($state['complete'] ?? false)) return;
            self::schedule();
        }, 20);
    }

    private static function schedule(): void
    {
        if (!wp_next_scheduled(self::HOOK)) wp_schedule_single_event(time() + 60, self::HOOK);
    }

    /** Bounded and retryable; remove records only after their files are gone. */
    public static function run(int $budget = 500): array
    {
        $previous = get_option(self::STATE, []);
        if (!is_array($previous)) $previous = [];
        if (is_array($previous) && ($previous['complete'] ?? false)) return $previous;
        $state = ['complete' => false, 'bytesRemoved' => (int) ($previous['bytesRemoved'] ?? 0)];
        $lock = false;
        $acquired = false;
        try {
            // Migration preserves every saved resource. Native deletion cannot operate
            // on the encrypted index, and must not discard its saved references.
            if (get_option('pixflow_design_resource_storage_backend', '') === 'encrypted-v1') return $state;
            $base = realpath((new ResourcePackPathService())->base_dir());
            if ($base === false) throw new \RuntimeException('Private storage unavailable.');
            $base = wp_normalize_path($base);
            $lockPath = $base . '/.retired-cleanup.lock';
            if (is_link($lockPath)) throw new \RuntimeException('Unsafe cleanup lock.');
            $lock = fopen($lockPath, 'c');
            if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { self::schedule(); return $state; }
            $acquired = true;
            $latest = get_option(self::STATE, []);
            if (is_array($latest)) {
                $state['bytesRemoved'] = (int) ($latest['bytesRemoved'] ?? 0);
                if ($latest['complete'] ?? false) { $state = $latest; return $state; }
            }
            $repo = new ResourcePackRepository();
            foreach ($repo->locks() as $slug => $operation) {
                if (in_array($slug, self::SLUGS, true) && time() - (int) ($operation['lockedAt'] ?? 0) < 1800) {
                    self::schedule();
                    return $state;
                }
            }
            $remaining = max(1, min(2000, $budget));
            foreach (self::SLUGS as $slug) {
                $target = $base . '/' . $slug;
                self::removeTree($target, $base, $remaining, $state['bytesRemoved']);
                if (file_exists($target) || is_link($target)) break;
                if ($repo->get($slug) !== null) $repo->delete_pack($slug);
            }
            $state['complete'] = true;
            foreach (self::SLUGS as $slug) {
                if (file_exists($base . '/' . $slug) || is_link($base . '/' . $slug)) $state['complete'] = false;
            }
            if ($state['complete']) {
                delete_option('pixflow_design_resource_pack_manifest');
                foreach (['pixflow_design_resource_pack_operations', 'pixflow_design_resource_pack_locks'] as $key) {
                    $rows = get_option($key, []);
                    if (!is_array($rows)) continue;
                    $kept = array_filter($rows, static fn($row) => !is_array($row) || !in_array($row['slug'] ?? '', self::SLUGS, true));
                    if ($kept !== $rows) update_option($key, $kept, false);
                }
                wp_clear_scheduled_hook(self::HOOK);
            }
        } catch (\Throwable) {
            $state['retryNeeded'] = true;
            self::schedule();
        } finally {
            if ($acquired) {
                update_option(self::STATE, $state, false);
                if (!$state['complete']) self::schedule();
            }
            if (is_resource($lock)) { flock($lock, LOCK_UN); fclose($lock); }
        }
        return $state;
    }

    private static function removeTree(string $path, string $base, int &$budget, int &$bytes): void
    {
        if ($budget <= 0 || (!file_exists($path) && !is_link($path))) return;
        // Check every entry before descending: never follow symlinks or junctions,
        // including links to another directory inside the private resource root.
        $real = realpath($path);
        if (is_link($path) || $real === false || !str_starts_with(wp_normalize_path($real), $base . '/')
            || strcasecmp(wp_normalize_path($real), $path) !== 0) {
            throw new \RuntimeException('Unsafe retired resource path.');
        }
        if (is_dir($path)) {
            foreach (new \DirectoryIterator($path) as $entry) {
                if ($entry->isDot()) continue;
                self::removeTree($path . '/' . $entry->getFilename(), $base, $budget, $bytes);
                if ($budget <= 0) return;
            }
            if (!rmdir($path)) throw new \RuntimeException('Cannot remove retired resource directory.');
        } else {
            $size = filesize($path);
            if (!unlink($path)) throw new \RuntimeException('Cannot remove retired resource file.');
            $bytes += (int) $size;
        }
        $budget--;
    }
}
