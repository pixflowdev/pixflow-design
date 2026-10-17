<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require __DIR__ . '/../src/Modules/BuilderIntegrations.php';
require __DIR__ . '/../src/Modules/SavedExtensionState.php';

use PixflowDesign\WordPress\Modules\BuilderIntegrations;
use PixflowDesign\WordPress\Modules\SavedExtensionState;

$active = false;
BuilderIntegrations::add('bricks', ['active' => static fn() => $GLOBALS['active']]);
$stored = ['bricksExtensions' => ['twoFactorAuthentication' => ['enabled' => true, 'label' => 'My login'], 'gradientBuilder' => ['enabled' => true]], 'appearance' => 'dark'];
$options = ['pixflow_design_app_config' => $stored];
function get_option($key, $default = null) { return $GLOBALS['options'][$key] ?? $default; }
function update_option($key, $value, $autoload = false) { $GLOBALS['options'][$key] = $value; }
SavedExtensionState::reconcile();
$expected = $stored;
$expected['bricksExtensions']['twoFactorAuthentication']['enabled'] = false;
if ($options['pixflow_design_app_config'] !== $expected) throw new RuntimeException('Only the 2FA enable switch may change when Pro is absent.');
$active = true;
SavedExtensionState::reconcile();
if ($options['pixflow_design_app_config'] !== $expected) throw new RuntimeException('Reactivating Pro must not re-enable 2FA.');
if (SavedExtensionState::filter($stored) !== $stored) throw new RuntimeException('Explicit re-enable must work while Bricks is available.');
echo "Saved extension state: absence, preservation and explicit re-enable passed.\n";

BuilderIntegrations::authorize_using(static fn(): bool => false);
if (BuilderIntegrations::active('bricks')) throw new RuntimeException('Expired Pro remains authorized.');
if (SavedExtensionState::filter($stored) !== $stored) throw new RuntimeException('Expiry must not change saved 2FA or extension settings.');
echo "Licence expiry preserves installed extension settings.\n";
