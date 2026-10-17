<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Modules;
if (!defined('ABSPATH')) exit;

/** The Pro shell owns Workspace access. Reads/export and cleanup survive expiry. */
final class WorkspaceAccess
{
    public static function available(): bool { return FeatureContributions::available('workspace'); }
    public static function permits(string $path, string $method): bool
    {
        if (!preg_match('#^projects(?:/|$)#', trim($path, '/'))) return true;
        if (in_array(strtoupper($method), ['GET', 'HEAD', 'DELETE'], true)) return true;
        return self::available();
    }
}
