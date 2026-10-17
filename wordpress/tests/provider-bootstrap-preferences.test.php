<?php
declare(strict_types=1);
use PixflowDesign\WordPress\Providers\ProviderSettingsRepository;
define('ABSPATH', __DIR__);
require __DIR__ . '/../src/Providers/ProviderSettingsRepository.php';
function get_current_user_id(): int { return 7; }
function get_user_meta(int $id, string $key, bool $single): array { return $GLOBALS['personal']; }
function sanitize_text_field(string $value): string { return strip_tags($value); }
function sanitize_key(string $value): string { return $value; }
function update_user_meta(int $id, string $key, array $value): void { $GLOBALS['personal'] = $value; }
$GLOBALS['personal'] = ['mode' => 'api', 'apiTransport' => 'composio', 'composioProvider' => 'my-account', 'composioModel' => 'selected-model'];
$stored = $stored_app_config = ['mode' => 'api', 'apiTransport' => 'composio', 'composioProvider' => 'old-account', 'composioModel' => 'old-model', 'apiKey' => 'must-not-be-localized'];
// Exercise each actual bootstrap expression, without loading WordPress or
// enqueueing the editor's unrelated UI assets.
foreach (['../src/Assets/AssetRegistrar.php' => 'provider'] as $file => $variable) {
    $source = file_get_contents(__DIR__ . '/' . $file);
    if (!preg_match('/\$' . $variable . ' = (\(new ProviderSettingsRepository\(\)\)->[^;]+);/', $source, $match)) throw new RuntimeException('Missing bootstrap expression');
    $value = eval('return ' . str_replace('ProviderSettingsRepository', '\\PixflowDesign\\WordPress\\Providers\\ProviderSettingsRepository', $match[1]) . ';');
    if ($value !== $GLOBALS['personal']) throw new RuntimeException($file . ': editor must use personal provider/model and omit credentials');
}
$GLOBALS['personal'] = [];
$repository = new ProviderSettingsRepository();
if ($repository->sanitize($repository->merge_into_app_config($stored))['composioModel'] !== 'old-model') throw new RuntimeException('Legacy preference fallback changed');
// A non-provider preferences save must not copy the site-wide legacy model
// into the current user's personal selection.
foreach (['../src/Http/RestController.php'] as $file) {
    $GLOBALS['personal'] = ['mode' => 'api', 'apiTransport' => 'composio', 'composioModel' => 'selected-model'];
    $incoming = ['theme' => 'dark'];
    $config = array_replace_recursive($stored, $incoming);
    $source = file_get_contents(__DIR__ . '/' . $file);
    if (!preg_match('/extract_from_app_config\((\$\w+)\)/', $source, $match)) throw new RuntimeException('Missing settings extraction');
    $value = eval('return $repository->extract_from_app_config(' . $match[1] . ');');
    if ($value !== []) $repository->save($value);
    if ($GLOBALS['personal']['composioModel'] !== 'selected-model') throw new RuntimeException($file . ': unrelated settings save overwrote the personal model');
}
echo "provider-bootstrap-preferences: personal choices, credential exclusion and legacy fallback passed\n";
