<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
$saved = ['layer' => ['css' => '.pds-button { color: red; }', 'settings' => ['color' => ['palette' => [['slug'=>'pds-brand','color'=>'#ff0000']]]], 'styles'=>['color'=>['text'=>'#ff0000']]]];
function get_stylesheet() { return 'qa-theme'; }
function wp_is_block_theme() { return true; }
function get_option($key, $fallback = false) { return $key === 'pixflow_design_gutenberg_system_state' ? ['qa-theme'=>$GLOBALS['saved']] : $fallback; }
function wp_register_style(...$args) {}
function wp_enqueue_style(...$args) {}
function wp_add_inline_style($handle, $css) { $GLOBALS['rendered'] = $css; }
require __DIR__ . '/../src/Admin/Gutenberg/SavedGutenbergDesignSystem.php';
require __DIR__ . '/../src/Framework/DesignSystem/SavedDesignSystems.php';
use PixflowDesign\WordPress\Admin\Gutenberg\SavedGutenbergDesignSystem as Renderer;
$theme = new class {
    public array $data = ['settings'=>['color'=>['palette'=>[['slug'=>'theme-brand','color'=>'#000000']]]], 'styles'=>['spacing'=>['blockGap'=>'2rem']]];
    function get_data() { return $this->data; }
    function update_with($value) { $this->data = $value; return $this; }
};
Renderer::theme_data($theme);
Renderer::enqueue();
if (count($theme->data['settings']['color']['palette']) !== 2 || $theme->data['styles']['spacing']['blockGap'] !== '2rem' || $GLOBALS['rendered'] !== $saved['layer']['css']) throw new RuntimeException('Saved styles or original theme settings were lost in Free');
if (method_exists(Renderer::class, 'apply') || method_exists(\PixflowDesign\WordPress\Framework\DesignSystem\SavedDesignSystems::class, 'save')) throw new RuntimeException('Free contains authoring methods');
echo "Free renders saved presets and CSS without the Pro classes; original theme settings preserved.\n";
