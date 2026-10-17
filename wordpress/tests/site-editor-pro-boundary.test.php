<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require __DIR__ . '/../src/autoload.php';
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergExtensions;
use PixflowDesign\WordPress\Modules\FeatureContributions;
function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} }
function denied(callable $call): void { try { $call(); } catch (RuntimeException $e) { check(str_contains($e->getMessage(), 'Pro'), $e->getMessage()); return; } throw new RuntimeException('Free allowed Site Editor authoring'); }
foreach (['wp_template', 'wp_template_part', 'wp_block', 'wp_navigation'] as $type) {
    denied(fn() => GutenbergExtensions::assert_command('gutenberg.update', [], 0, ['type'=>$type,'id'=>'theme//test']));
    check(GutenbergExtensions::authoring_error($type)?->code === 'pixflow_site_editor_pro_required', 'Generic shared writes bypass Pro');
}
check(GutenbergExtensions::authoring_error('WP_BLOCK!')?->code === 'pixflow_site_editor_pro_required', 'Post-type normalization bypasses Pro');
check(GutenbergExtensions::authoring_error('page') === null, 'Free ordinary post write blocked');
denied(fn() => GutenbergExtensions::assert_command('gutenberg.create', ['type'=>'wp_block'], 0));
denied(fn() => GutenbergExtensions::assert_command('gutenberg.entities', ['type'=>'wp_template'], 0));
// A normal page can retain references; native WordPress never calls the agent gate.
GutenbergExtensions::assert_command('gutenberg.update', [], 0, ['type'=>'page','id'=>'42']);
GutenbergExtensions::assert_tree([['name'=>'core/block','attributes'=>['ref'=>123]]]);
echo "Site Editor Free boundaries passed.\n";
