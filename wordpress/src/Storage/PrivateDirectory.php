<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Storage;
if (!defined('ABSPATH')) exit;

/** Private, installation-bound storage; migrations never merge or leave public backups. */
final class PrivateDirectory
{
    private ?string $ready_root = null;
    public function __construct(
        private readonly string $collection,
        private readonly string $option,
        private readonly string $constant,
    ) {
        if (!in_array($collection, ['projects', 'resource-packs'], true)) throw new \InvalidArgumentException('Unknown private collection.');
    }
    public function directory(): string
    {
        if ($this->ready_root !== null) return $this->ready_root;
        $uploads = $this->uploads();
        $document_root = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
        // CLI/cron must reuse the root discovered by the web server, or an
        // explicit host setting. ABSPATH alone is unsafe for subdirectory WP.
        if (empty($_SERVER['DOCUMENT_ROOT'])) $document_root = false;
        $root = defined($this->constant)
            ? (string) constant($this->constant)
            : (string) get_option($this->option, '');
        $origin = hash('sha256', wp_normalize_path($uploads['basedir']));
        if (!defined($this->constant) && $root !== ''
            && get_option($this->option . '_origin', '') !== $origin) {
            throw new \RuntimeException('This site moved. Configure and migrate its private storage directory before using this collection.');
        }
        if ($root === '') {
            if ($document_root === false || !$this->within(wp_normalize_path(ABSPATH), wp_normalize_path($document_root))) {
                throw new \RuntimeException('Configure private Pixflow storage outside the web root.');
            }
            $root = dirname($document_root) . '/.pixflow-private-' . substr(hash('sha256', wp_normalize_path($uploads['basedir'])), 0, 20) . '/' . $this->collection;
        }
        $root = rtrim(wp_normalize_path($root), '/');
        if (!preg_match('~^(?:[A-Za-z]:/|/)~', $root) || preg_match('~(?:^|/)\.{1,2}(?:/|$)|[\x00-\x1f]~', $root)) {
            throw new \RuntimeException('Invalid private storage directory.');
        }
        $this->assert_no_links($root);
        foreach (array_filter([$document_root, realpath(ABSPATH), realpath($uploads['basedir']), defined('WP_CONTENT_DIR') ? WP_CONTENT_DIR : null]) as $public) {
            $public = wp_normalize_path((string) $public);
            if ($this->within($root, $public) || $this->within($public, $root)) {
                throw new \RuntimeException('Private storage must be outside public directories.');
            }
        }
        $this->make_directory(dirname($root));
        $lock_path = dirname($root) . '/.' . $this->collection . '-migration.lock';
        $this->assert_no_links($lock_path);
        // Expected host permission failures are reported by the caller's notice /
        // JSON error, never by a PHP warning that leaks paths or corrupts JSON.
        $lock = @fopen($lock_path, 'c');
        if ($lock === false || !flock($lock, LOCK_EX)) throw new \RuntimeException('Could not lock private storage.');
        try {
            $legacy = wp_normalize_path($uploads['basedir'] . '/' . 'pixflow-design/' . $this->collection);
            if (file_exists($legacy) || is_link($legacy)) {
                $this->assert_no_links($legacy);
                if (file_exists($root)) {
                    // A previous attempt may have created an empty destination.
                    // Only resource directories get this recovery; never merge
                    // two populated trees or modify project storage here.
                    if ($this->collection !== 'resource-packs'
                        || !\PixflowDesign\WordPress\Resources\BundledResources::remove_empty_tree($root)) {
                        throw new \RuntimeException('Both legacy and private storage trees exist; migration needs host assistance.');
                    }
                }
                // Rename the whole tree atomically: no partially copied data,
                // public backup, database rewrite or destructive merge. Hosts
                // using different filesystems must perform an offline migration.
                $before = $this->inventory($legacy);
                if (!@rename($legacy, $root)) throw new \RuntimeException('Could not move legacy files to private storage.');
                @chmod($root, 0700);
                update_option($this->option, $root, false);
                update_option($this->option . '_origin', $origin, false);
                if ($before !== $this->inventory($root)) throw new \RuntimeException('Storage migration verification failed; private files retained.');
            } else {
                $this->make_directory($root);
                update_option($this->option, $root, false);
                update_option($this->option . '_origin', $origin, false);
            }
        } finally {
            flock($lock, LOCK_UN); fclose($lock);
        }
        $this->ready_root = $root;
        return $root;
    }

    private function within(string $path, string $root): bool
    {
        if (PHP_OS_FAMILY === 'Windows') { $path = strtolower($path); $root = strtolower($root); }
        return rtrim($path, '/') === rtrim($root, '/') || str_starts_with($path, rtrim($root, '/') . '/');
    }

    private function assert_no_links(string $path): void
    {
        do {
            if (is_link($path)) throw new \RuntimeException('Linked private storage is not allowed.');
            $parent = dirname($path);
            if ($parent === $path) break;
            $path = $parent;
        } while ($path !== '.' && $path !== '');
    }

    private function make_directory(string $path): void
    {
        $this->assert_no_links($path);
        if (!is_dir($path) && !wp_mkdir_p($path)) throw new \RuntimeException('Could not create private storage.');
        @chmod($path, 0700);
    }

    private function inventory(string $root): array
    {
        $files = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::SELF_FIRST);
        foreach ($iterator as $entry) {
            if ($entry->isLink() || (!$entry->isDir() && !$entry->isFile())) throw new \RuntimeException('Unsupported linked storage file; migration stopped.');
            $relative = substr(wp_normalize_path($entry->getPathname()), strlen($root) + 1);
            // Atomic rename preserves the underlying files; compare tree
            // metadata without rereading large archives on a web request.
            $files[$relative] = $entry->isDir() ? 'directory' : [$entry->getSize(), $entry->getMTime()];
        }
        ksort($files);
        return $files;
    }

    private function uploads(): array
    {
        $uploads = wp_upload_dir(null, false);

        if (!empty($uploads['error'])) {
            throw new \RuntimeException((string) $uploads['error']);
        }

        return $uploads;
    }

}
