<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Storage;
if (!defined('ABSPATH')) exit;

/** Copy/verify first, activate readers second, retire only byte-identical originals last. */
final class EncryptedResourceMigration
{
    public static function prepare(string $vault, array $sources): EncryptedResourceTree
    {
        $tree = new EncryptedResourceTree($vault);
        return $tree->locked(function () use ($tree, $vault, $sources): EncryptedResourceTree {
        foreach ($sources as $source => $prefix) {
            if (is_link($source)) throw new \RuntimeException('Linked resources cannot be migrated.');
            if (!file_exists($source)) continue;
            if (!$tree->import($source, $prefix)['complete']) throw new \RuntimeException('Encrypted resource migration is continuing. Original files have been kept.');
        }
        // Recovery receipts are retained before activation, including the original roots.
        $receipt = ['vault'=>$vault, 'sources'=>$sources];
        if (!update_option('pixflow_design_resource_migration_v1', $receipt, false) && get_option('pixflow_design_resource_migration_v1') !== $receipt) throw new \RuntimeException('Could not save resource recovery state.');
        if (!update_option('pixflow_design_resource_storage_backend', 'encrypted-v1', false) && get_option('pixflow_design_resource_storage_backend') !== 'encrypted-v1') throw new \RuntimeException('Could not activate encrypted resources.');
        return $tree;
        }, 'recovery');
    }

    /** A separate bounded pass; unreadable, changed or linked files are never removed. */
    public static function retire(EncryptedResourceTree $tree, string $source, string $prefix = '', int $budget = 50): bool
    {
        for ($part=$source;;$part=dirname($part)) {
            if (is_link($part)) throw new \RuntimeException('Linked resources cannot be retired.');
            if (dirname($part)===$part) break;
        }
        if (!file_exists($source)) return true;
        if (!is_dir($source)) throw new \RuntimeException('Resource recovery source is not a directory.');
        $source=rtrim($source,'/\\');$count=0;
        foreach(new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($source,\FilesystemIterator::SKIP_DOTS),\RecursiveIteratorIterator::CHILD_FIRST) as $file) {
            if ($file->isLink()) throw new \RuntimeException('Linked resources cannot be retired.');
            if ($file->isDir()) { @rmdir($file->getPathname()); continue; }
            if (!$file->isFile()) throw new \RuntimeException('Unknown resource type has been kept.');
            if ($count++ >= max(1,min(200,$budget))) return false;
            $name=($prefix!==''?$prefix.'/':'').str_replace('\\','/',substr($file->getPathname(),strlen($source)+1));
            $copy=$tree->read($name);
            if (!hash_equals(hash('sha256',$copy),(string)hash_file('sha256',$file->getPathname()))) throw new \RuntimeException('Resource changed after migration. Both copies have been kept.');
            if (!@unlink($file->getPathname())) throw new \RuntimeException('Verified resources are encrypted, but original cleanup is not permitted.');
        }
        return @rmdir($source);
    }
}
