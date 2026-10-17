<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin;
if (!defined('ABSPATH')) exit;

/** Discover installed capabilities without executing them or importing vendor policy. */
final class NativeAbilityCatalog
{
    public static function allowed(string $name): bool
    {
        if (str_starts_with($name, 'core/')) return true;
        if (str_starts_with($name, 'pixflow/')) return (new WpAdminCapabilityRegistry())->find($name) !== null;
        if (str_starts_with($name, 'bricks/')) return \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks');
        return \PixflowDesign\WordPress\Modules\FeatureContributions::available('plugin-integrations');
    }
    public static function list(array $args): array
    {
        $items = [];
        foreach (function_exists('wp_get_abilities') ? wp_get_abilities() : [] as $ability) {
            $name = $ability->get_name();
            if (!self::allowed($name)) continue;
            if (str_starts_with($name, 'bricks/') && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks')) continue;
            $meta = $ability->get_meta();
            $mcp = is_array($meta['mcp'] ?? null) ? $meta['mcp'] : [];
            $kind = ($mcp['type'] ?? 'tool') === 'resource' ? 'resource' : 'tool';
            if (isset($args['kind']) && $args['kind'] !== $kind) continue;
            if (!empty($args['namespace']) && !str_starts_with($name, rtrim((string) $args['namespace'], '/') . '/')) continue;
            $description = $ability->get_description();
            $query = trim((string) ($args['query'] ?? ''));
            if ($query !== '' && stripos($name . ' ' . $description, $query) === false) continue;
            $item = ['name' => $name, 'description' => $description, 'kind' => $kind,
                'annotations' => $meta['annotations'] ?? []];
            if (empty($args['summary'])) {
                $item['inputSchema'] = $ability->get_input_schema();
                $item['outputSchema'] = $ability->get_output_schema();
                // These are discovery references, not instructions to execute automatically.
                $item['requiredResources'] = $meta['angie/requiredResources'] ?? $meta['annotations']['angie/requiredResources'] ?? $mcp['annotations']['angie/requiredResources'] ?? [];
            }
            $uri = $mcp['uri'] ?? $meta['uri'] ?? null;
            if (is_string($uri) && $uri !== '') $item['uri'] = $uri;
            $items[] = $item;
        }
        return ['abilities' => $items, 'count' => count($items),
            'guidance' => 'Resources are reference material, tools perform actions. Read only relevant guides. Inspect inputSchema before ability.call; permission checks still run inside the native ability. Availability does not guarantee permission or successful execution.'];
    }
}
