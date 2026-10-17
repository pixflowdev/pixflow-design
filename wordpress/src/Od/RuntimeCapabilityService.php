<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Od;

if (!defined('ABSPATH')) {
    exit;
}

final class RuntimeCapabilityService
{
    public function bridge_payload(): array
    {
        $manifest_url = 'https://pixflow.dev/downloads/pixflow-design-bridge/latest.json';

        return [
            'required' => false,
            'status' => 'optional',
            'available' => null,
            'version' => null,
            'requiredVersion' => defined('PIXFLOW_DESIGN_BRIDGE_VERSION') ? PIXFLOW_DESIGN_BRIDGE_VERSION : '0.0.0',
            'baseUrl' => 'http://127.0.0.1:7456',
            'manifestUrl' => $manifest_url,
            'installers' => [
                'windows' => 'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-win-x64-setup.exe',
                'macos' => 'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-mac-arm64.dmg',
                'macosArm64' => 'https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-mac-arm64.dmg',
                'linux' => 'https://pixflow.dev/downloads/pixflow-design-bridge/install.sh',
            ],
            'requiredFor' => ['localCli', 'localFiles', 'prototypeGeneration'],
            'browserPermissions' => [
                'chromePrompt' => 'Chrome may ask this site to access apps on your device. Allow Apps on device when using Local CLI features.',
                'chromeDenied' => 'Chrome is blocking Pixflow Design Bridge access for this site. In Chrome site settings, allow Apps on device, then rescan.',
                'fallback' => 'The bridge is optional unless you use Local CLI or local files.',
            ],
            'reason' => 'The bridge is optional and only required for Local CLI or local filesystem access.',
        ];
    }

    public function capabilities(): array
    {
        return [
            'workspace' => \PixflowDesign\WordPress\Modules\WorkspaceAccess::available() ? 'available' : 'requires_pro',
            'bricksBuilder' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks') ? 'available' : 'unavailable',
            'apiGeneration' => 'available',
            'byokGeneration' => 'available',
            'prototypeGeneration' => 'requires_bridge',
            'pixflowLibrary' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks') ? 'available' : 'unavailable',
            'bricksMcp' => \PixflowDesign\WordPress\Modules\BuilderIntegrations::active('bricks') ? 'available' : 'unavailable',
            'projects' => 'available',
            'onboarding' => 'available',
            'resourcePacks' => 'available',
            'memory' => 'available',
            'localCli' => 'requires_bridge',
            'localFiles' => 'requires_bridge',
        ];
    }

    public function agents_payload(): array
    {
        // Pixflow-owned: WP-first startup must never block PHP on the optional
        // local bridge. Browser-side Local CLI surfaces discover bridge agents
        // directly with short passive timeouts and explicit long rescans.
        return [
            'agents' => [],
            'runtime' => 'wordpress',
            'bridge' => $this->bridge_payload(),
            'capabilities' => $this->capabilities(),
            'localCli' => [
                'available' => false,
                'reason' => 'browser_optional_bridge_probe_required',
            ],
        ];
    }
}
