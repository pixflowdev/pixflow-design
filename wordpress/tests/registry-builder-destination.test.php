<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Bricks {
    class BricksModuleLifecycle { public static bool $enabled = false; public static function active(): bool { return self::$enabled; } }
}
namespace PixflowDesign\WordPress\Etch {
    class EtchModule { public static bool $enabled = false; public static function active(): bool { return self::$enabled; } }
}
namespace PixflowDesign\WordPress\Elementor {
    class ElementorModule { public static bool $enabled = false; public static function active(): bool { return self::$enabled; } }
}
namespace PixflowDesign\WordPress\Resources {
    class ResourcePackRepository { public function installed(): array { return []; } }
}
namespace {
    function sanitize_key(string $value): string { return $value; }
    function wp_json_encode(mixed $value): string { return json_encode($value); }
    function get_transient(string $key): array { return [['id' => 'example-acreage-farming', 'pixflowDestination' => null]]; }
    define('ABSPATH', __DIR__);
    require_once __DIR__ . '/../src/autoload.php';
    require __DIR__ . '/../src/Modules/BuilderIntegrations.php';
    \PixflowDesign\WordPress\Modules\BuilderIntegrations::add('bricks', ['active'=>static fn()=>\PixflowDesign\WordPress\Bricks\BricksModuleLifecycle::active()]);
    \PixflowDesign\WordPress\Modules\BuilderIntegrations::add('etch', ['active'=>static fn()=>\PixflowDesign\WordPress\Etch\EtchModule::active()]);
    \PixflowDesign\WordPress\Modules\BuilderIntegrations::add('elementor', ['active'=>static fn()=>\PixflowDesign\WordPress\Elementor\ElementorModule::active()]);
    require __DIR__ . '/../src/Od/CatalogueCuration.php';
    require __DIR__ . '/../src/Od/RegistryService.php';
    $type = new ReflectionClass(\PixflowDesign\WordPress\Od\RegistryService::class);
    $service = $type->newInstanceWithoutConstructor();
    $type->getProperty('resource_packs')->setValue($service, new \PixflowDesign\WordPress\Resources\ResourcePackRepository());
    $method = $type->getMethod('curated_plugin');
    foreach ([[false, false, false], [true, false, false], [false, true, false], [true, true, false], [false, false, true], [true, true, true]] as [$bricks, $etch, $elementor]) {
        \PixflowDesign\WordPress\Bricks\BricksModuleLifecycle::$enabled = $bricks;
        \PixflowDesign\WordPress\Etch\EtchModule::$enabled = $etch;
        \PixflowDesign\WordPress\Elementor\ElementorModule::$enabled = $elementor;
        $record = $method->invoke($service, ['id' => 'example-orbis-nft']);
        if (isset($record['pixflowDestination']) !== ($bricks || $etch || $elementor)) throw new RuntimeException('Native reference availability must follow each supported builder.');
    }
    \PixflowDesign\WordPress\Bricks\BricksModuleLifecycle::$enabled = false;
    \PixflowDesign\WordPress\Elementor\ElementorModule::$enabled = false;
    \PixflowDesign\WordPress\Etch\EtchModule::$enabled = true;
    $summary = $service->plugin_summaries()[0];
    if (($summary['pixflowDestination'] ?? null) !== 'bricks') throw new RuntimeException('Etch must restore native destination on a cached community summary.');
    \PixflowDesign\WordPress\Etch\EtchModule::$enabled = false;
    if (isset($service->plugin_summaries()[0]['pixflowDestination'])) throw new RuntimeException('Inactive builders must not inherit a cached destination.');
    \PixflowDesign\WordPress\Elementor\ElementorModule::$enabled = true;
    if (($service->plugin_summaries()[0]['pixflowDestination'] ?? null) !== 'bricks') throw new RuntimeException('Elementor must restore native destination on a cached summary.');
    echo "registry-builder-destination: 9 checks passed\n";
}
