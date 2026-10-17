<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

require_once dirname(__DIR__) . '/src/Resources/ResourcePackInstallService.php';

use PixflowDesign\WordPress\Resources\ResourcePackInstallService;

function assert_resource_pack(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$service = (new ReflectionClass(ResourcePackInstallService::class))->newInstanceWithoutConstructor();
$needs_update = new ReflectionMethod($service, 'pack_needs_update');
$needs_update->setAccessible(true);

assert_resource_pack(
    $needs_update->invoke($service, ['version' => '1.1.5'], ['version' => '1.1.5']) === false,
    'A plugin release must not make an unchanged same-version resource pack updateable.'
);
assert_resource_pack(
    $needs_update->invoke(
        $service,
        ['version' => '1.1.5', 'revision' => 'sha256:new'],
        ['version' => '1.1.5', 'revision' => 'sha256:old']
    ) === true,
    'A changed content revision must offer an update independently of the display version.'
);
assert_resource_pack(
    $needs_update->invoke(
        $service,
        ['version' => '1.1.5', 'revision' => 'sha256:same'],
        ['version' => '1.1.5', 'revision' => 'sha256:same']
    ) === false,
    'An unchanged content revision must remain installed across plugin updates.'
);
assert_resource_pack(
    $needs_update->invoke($service, ['version' => '1.1.6'], ['version' => '1.1.5']) === true,
    'Legacy records without a revision must retain version-based update detection.'
);

echo "resource-pack-revision: ok\n";
