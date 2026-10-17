<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Bricks { final class BricksModuleLifecycle { public static function active(): bool { return false; } } }
namespace {
    define('ABSPATH', __DIR__);
    require_once dirname(__DIR__) . '/src/autoload.php';
    $available = true;
    function wp_get_abilities(): array {
        if (!$GLOBALS['available']) return [];
        return array_map(static fn($name) => new class($name) {
            public function __construct(private string $name) {}
            public function get_name() { return $this->name; }
            public function get_description() { return 'Widget guidance'; }
            public function get_meta() { return ['mcp' => ['type' => str_ends_with($this->name, 'guide') ? 'resource' : 'tool', 'uri' => 'example://guide']]; }
            public function get_input_schema() { return ['type' => 'object']; }
            public function get_output_schema() { return ['type' => 'string']; }
            public function execute() { throw new RuntimeException('Discovery executed an ability'); }
        }, ['core/guide', 'core/build', 'optional/blocked', 'bricks/guide']);
    }
    require dirname(__DIR__) . '/src/Admin/NativeAbilityCatalog.php';
    use PixflowDesign\WordPress\Admin\NativeAbilityCatalog as Catalog;
    function check($ok, $message) { if (!$ok) throw new RuntimeException($message); }
    check(Catalog::list([])['count'] === 2, 'Inactive builder leaked');
    $guides = Catalog::list(['namespace' => 'core', 'kind' => 'resource', 'query' => 'Widget']);
    check($guides['count'] === 1 && $guides['abilities'][0]['uri'] === 'example://guide', 'Resource routing lost');
    check($guides['abilities'][0]['outputSchema']['type'] === 'string', 'Output schema missing');
    check(!isset(Catalog::list(['summary' => true])['abilities'][0]['inputSchema']), 'Summary loaded schemas');
    check(Catalog::list(['namespace' => 'absent'])['count'] === 0, 'Namespace filter failed');
    $available = false;
    check(Catalog::list([])['abilities'] === [], 'Optional absence failed');
    echo "Native ability discovery passed\n";
}
