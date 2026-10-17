<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\Framework\Routes;

if (!defined('ABSPATH')) { exit; }

/** Resolve the loaded plugin, never an inactive legacy installation. */
final class AcssVersion
{
    public static function current(): array
    {
        if (!defined('ACSS_PLUGIN_FILE') || !is_readable(ACSS_PLUGIN_FILE)) return self::classify('');
        $data = get_file_data(ACSS_PLUGIN_FILE, ['Version' => 'Version']);
        return self::classify((string) ($data['Version'] ?? ''));
    }

    public static function classify(string $version): array
    {
        $major = preg_match('/^(\d+)\.\d+(?:\.\d+)?(?:[-+].*)?$/', $version, $match) ? (int) $match[1] : 0;
        return ['version' => $version, 'major' => $major,
            'mappingProfile' => in_array($major, [3, 4], true) ? 'acss_v' . $major : null,
            'supported' => in_array($major, [3, 4], true)];
    }
}
