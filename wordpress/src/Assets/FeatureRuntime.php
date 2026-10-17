<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Assets;

use PixflowDesign\WordPress\Modules\BuilderIntegrations;
use PixflowDesign\WordPress\Modules\FeatureContributions;

if (!defined('ABSPATH')) exit;

/** Current authorized client modules, for activation without reloading an editor. */
final class FeatureRuntime
{
    /** Settings and planning load when used; native builder bootstrap remains eager. */
    public const DEFERRED_HANDLES = ['pixflow-composio', 'pixflow-workspace', 'pixflow-planning', 'pixflow-custom-skills', 'pixflow-assets', 'pixflow-bricks-agent', 'pixflow-bricks-settings'];

    public static function state(?array $handles = null): array
    {
        $features = array_keys(FeatureContributions::all());
        if ($handles === null) {
            $handles = FeatureContributions::enqueue();
            foreach (BuilderIntegrations::all() as $integration) {
                if (isset($integration['enqueueClient'])) $handles[] = ($integration['enqueueClient'])();
            }
        }
        foreach (BuilderIntegrations::all() as $integration) {
            if (isset($integration['registerSettingsClient'])) $handles[] = ($integration['registerSettingsClient'])();
        }
        $assets = [];
        $base = plugins_url('assets/app/', WP_PLUGIN_DIR . '/pixflow-design-pro/pixflow-design-pro.php');
        foreach (array_unique($handles) as $handle) {
            foreach (['script' => wp_scripts(), 'style' => wp_styles()] as $kind => $registry) {
                $item = $registry->registered[$handle] ?? null;
                // Only the installed Pro package's compiled client contributions.
                // Never publish inline code, credentials, dependency URLs or arbitrary hooks.
                $url = is_object($item) ? (string) $item->src : '';
                $suffix = $kind === 'script' ? 'js' : 'css';
                if (!str_starts_with($url, $base)
                    || !preg_match('/^pixflow-[a-z0-9-]+\.' . $suffix . '$/D', substr($url, strlen($base)))) continue;
                $assets[] = ['handle' => $handle, 'kind' => $kind, 'url' => add_query_arg('ver', (string) $item->ver, $url)];
            }
        }
        $builders = [];
        foreach (['bricks', 'etch', 'elementor', 'generateblocks'] as $builder) $builders[$builder] = BuilderIntegrations::active($builder);
        return ['schema' => 'pixflow.feature-runtime.v1', 'features' => $features, 'builders' => $builders, 'assets' => $assets];
    }
}
