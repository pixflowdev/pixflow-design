<?php
/**
 * Plugin Name: Pixflow Design
 * Description: AI assistance for WordPress and Gutenberg, with optional Pixflow Design Pro integrations.
 * Version: 2.1.4
 * Author: Pixflow
 * Author URI: https://pixflow.dev
 * Update URI: https://pixflow.dev
 * Requires at least: 6.0
 * Tested up to: 6.8
 * Requires PHP: 8.1
 * License: Apache-2.0
 * Text Domain: pixflow-design
 * Domain Path: /languages
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('PIXFLOW_DESIGN_VERSION', '2.1.4');
// Pixflow-owned: WordPress plugin declares the minimum compatible local bridge.
define('PIXFLOW_DESIGN_BRIDGE_VERSION', '2.1.4');
define('PIXFLOW_DESIGN_PLUGIN_FILE', __FILE__);
define('PIXFLOW_DESIGN_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PIXFLOW_DESIGN_PLUGIN_URL', plugin_dir_url(__FILE__));
// Pixflow-owned: source keeps WordPress code under wordpress/, while release
// zips stage the same files as root src/ and assets/ for a normal WP layout.
// Check the loader itself rather than its directory: during a non-atomic
// WordPress update the entry file can briefly exist before src/autoload.php.
$pixflow_design_src_dir = null;
foreach ([
    PIXFLOW_DESIGN_PLUGIN_DIR . 'src/',
    PIXFLOW_DESIGN_PLUGIN_DIR . 'wordpress/src/',
] as $pixflow_design_src_candidate) {
    if (is_readable($pixflow_design_src_candidate . 'autoload.php')) {
        $pixflow_design_src_dir = $pixflow_design_src_candidate;
        break;
    }
}

// Let this one request continue without Pixflow instead of fatally taking
// down WordPress while the updater is still replacing the plugin files.
if ($pixflow_design_src_dir === null) {
    return;
}

$pixflow_design_assets_dir = is_dir(PIXFLOW_DESIGN_PLUGIN_DIR . 'assets')
    ? PIXFLOW_DESIGN_PLUGIN_DIR . 'assets/'
    : PIXFLOW_DESIGN_PLUGIN_DIR . 'wordpress/assets/';
$pixflow_design_assets_url = is_dir(PIXFLOW_DESIGN_PLUGIN_DIR . 'assets')
    ? PIXFLOW_DESIGN_PLUGIN_URL . 'assets/'
    : PIXFLOW_DESIGN_PLUGIN_URL . 'wordpress/assets/';

define('PIXFLOW_DESIGN_SRC_DIR', $pixflow_design_src_dir);
define('PIXFLOW_DESIGN_ASSETS_DIR', $pixflow_design_assets_dir);
define('PIXFLOW_DESIGN_ASSETS_URL', $pixflow_design_assets_url);

// Pixflow's path-aware loader owns both its source namespace and the one
// audited, bundled WebAuthn namespace. This avoids shipping Composer metadata
// whose repository src path differs from the release ZIP's src path.
require_once PIXFLOW_DESIGN_SRC_DIR . 'autoload.php';

add_action('init', static function (): void {
    $directory = is_dir(PIXFLOW_DESIGN_PLUGIN_DIR . 'languages') ? 'languages' : 'wordpress/languages';
    load_plugin_textdomain('pixflow-design', false, dirname(plugin_basename(PIXFLOW_DESIGN_PLUGIN_FILE)) . '/' . $directory);
}, 0);

$pixflow_design_plugin_updater = new \PixflowDesign\WordPress\Admin\PluginUpdater(__FILE__, PIXFLOW_DESIGN_VERSION);
$pixflow_design_plugin_updater->register();

// Pixflow-owned: install project-library tables when WordPress activates the
// plugin, while Plugin::register() keeps them upgraded after file updates.
register_activation_hook(__FILE__, static function () use ($pixflow_design_plugin_updater): void {
    \PixflowDesign\WordPress\Plugin::activate();
    $pixflow_design_plugin_updater->seed_default_auto_update_setting();
});

\PixflowDesign\WordPress\Plugin::boot();

