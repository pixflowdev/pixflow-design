<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin\Gutenberg;
use PixflowDesign\WordPress\Modules\BuilderIntegrations;
if (!defined('ABSPATH')) exit;

/** Shared Gutenberg extension contract. Missing modules never rewrite saved blocks. */
final class GutenbergExtensions
{
    // Ownership metadata is retained in Free so an old editor cannot bypass a missing add-on.
    public const OWNERS = ['generateblocks/' => 'generateblocks', 'generateblocks-pro/' => 'generateblocks'];
    public const ENTITY_OWNERS = ['gblocks_form' => 'generateblocks', 'gblocks_overlay' => 'generateblocks', 'gblocks_condition' => 'generateblocks'];

    public static function contributions(string $key): array
    {
        $out = [];
        foreach (array_merge(BuilderIntegrations::all(), \PixflowDesign\WordPress\Modules\FeatureContributions::all()) as $definition) $out = array_merge($out, $definition[$key] ?? []);
        return $out;
    }
    public static function support(string $name): ?array
    {
        foreach (self::OWNERS as $prefix => $owner) {
            if (!str_starts_with($name, $prefix)) continue;
            $adapter = BuilderIntegrations::get($owner, 'blockAdapter');
            return $adapter ? $adapter->support($name) : ['level' => 'integration_unavailable', 'adapter' => null, 'certified' => false, 'allowed' => false];
        }
        foreach (['kadence/', 'uagb/'] as $prefix) {
            if (!str_starts_with($name, $prefix)) continue;
            $adapter = \PixflowDesign\WordPress\Modules\FeatureContributions::all()['plugin-integrations']['blockAdapters'][$prefix] ?? null;
            return $adapter ? $adapter->support($name) : ['level' => 'integration_unavailable', 'adapter' => null, 'certified' => false, 'allowed' => false];
        }
        return null;
    }
    public static function assert_entity(string $type): void
    {
        if (isset(self::ENTITY_OWNERS[$type]) && !BuilderIntegrations::active(self::ENTITY_OWNERS[$type])) throw new \RuntimeException('This block integration requires Pixflow Design Pro and its active plugin. Existing content is unchanged.');
    }
    /** Only Pixflow write services call this; native WordPress editing is untouched. */
    public static function authoring_error(string $type): ?\WP_Error
    {
        $type = preg_replace('/[^a-z0-9_\-]/', '', strtolower($type));
        if (in_array($type, GutenbergEntity::SHARED, true) && !\PixflowDesign\WordPress\Modules\FeatureContributions::available('site-editor')) {
            return new \WP_Error('pixflow_site_editor_pro_required', 'Pixflow Site Editor and shared-pattern authoring requires Pro. WordPress native editing remains available.', ['status'=>403]);
        }
        return null;
    }
    public static function assert_tree(array $blocks): void
    {
        foreach ($blocks as $block) {
            // Direct JSON payloads use stdClass; WordPress parse_blocks returns arrays.
            if (is_object($block)) $block = get_object_vars($block);
            if (!is_array($block)) throw new \RuntimeException('Each block must be an object. No operation was applied.');
            $support = self::support((string) ($block['blockName'] ?? $block['name'] ?? ''));
            if ($support && empty($support['allowed'])) throw new \RuntimeException('This block integration requires a compatible active plugin and Pixflow Design Pro. Existing content is unchanged.');
            self::assert_tree((array) ($block['innerBlocks'] ?? []));
        }
    }
    public static function assert_command(string $tool, array $args, int $post_id, ?array $entity = null): void
    {
        $type = (string) ($entity['type'] ?? ($post_id && function_exists('get_post_type') ? get_post_type($post_id) : ''));
        $specialist = in_array($tool, ['gutenberg.entities', 'gutenberg.create'], true)
            || (in_array($type, GutenbergEntity::SHARED, true) && !in_array($tool, array_merge(['gutenberg.read', 'gutenberg.schema'], self::contributions('gutenbergReadCommands')), true));
        if ($specialist && !\PixflowDesign\WordPress\Modules\FeatureContributions::available('site-editor')) throw new \RuntimeException('Pixflow Site Editor, template and shared-pattern authoring requires Pro. Existing content and WordPress native editing remain available.');
        if (isset($args['type'])) self::assert_entity((string) $args['type']);
        if (!in_array($tool, array_merge(['gutenberg.read', 'gutenberg.schema', 'gutenberg.entities'], self::contributions('gutenbergReadCommands')), true)) {
            self::assert_tree((array) ($args['blocks'] ?? []));
            if ($post_id && function_exists('parse_blocks')) self::assert_tree(parse_blocks((string) get_post_field('post_content', $post_id)));
        }
        if ($tool === 'gutenberg.schema' && !empty($args['name'])) self::assert_tree([['name' => $args['name']]]);
    }
    public static function enqueue(bool $serializer = false): array
    {
        $handles = [];
        foreach (array_merge(BuilderIntegrations::all(), \PixflowDesign\WordPress\Modules\FeatureContributions::all()) as $definition) if (isset($definition['enqueueGutenberg'])) $handles[] = ($definition['enqueueGutenberg'])($serializer);
        return $handles;
    }
}
