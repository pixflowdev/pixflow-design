<?php
declare(strict_types=1);
// Run only against the local QA installation, after WordPress bootstrap.
if (!defined('ABSPATH') || !in_array(parse_url(home_url(), PHP_URL_HOST), ['127.0.0.1', 'localhost'], true)) throw new RuntimeException('Local QA only.');
use PixflowDesign\WordPress\Modules\BuilderIntegrations;
use PixflowDesign\WordPress\Admin\DirectSiteWorkspace;
use PixflowDesign\WordPress\Admin\DirectSkillCatalog;

$expected = ($argv[1] ?? '') === 'pro';
$checks = 0;
$check = static function (bool $value, string $message) use (&$checks): void {
    if (!$value) throw new RuntimeException($message);
    $checks++;
};
$check(defined('ETCH_PLUGIN_FILE'), 'Native Etch must remain active throughout the extraction test.');
$check(BuilderIntegrations::active('etch') === $expected, 'Etch availability must follow Pro.');
$help = (new DirectSiteWorkspace())->help();
$check(isset($help['tools']['etch.run']) === $expected, 'Tool catalogue must follow Pro.');
$skills = (new DirectSkillCatalog())->call('skills.list', ['query' => 'etch/']);
$check((count($skills['paths']) > 0) === $expected, 'Etch references must follow Pro.');
try { (new DirectSkillCatalog())->call('skills.read', ['path' => 'etch/live-editor.md']); $readable = true; }
catch (Throwable) { $readable = false; }
$check($readable === $expected, 'Direct skill reads must not bypass the extraction.');
$public = (new \PixflowDesign\WordPress\Mcp\PromptSkillCatalog())->all();
$check(isset($public['etch-live-editor']) === $expected, 'Cached public skill catalogue must follow Pro.');
try { new \PixflowDesign\WordPress\Admin\DirectCanvasRelay('etch'); $relay = true; }
catch (Throwable) { $relay = false; }
$check($relay === $expected, 'Etch canvas transport must be unavailable without Pro.');
$response = rest_do_request(new WP_REST_Request('GET', '/pixflow-design/v1/icons/packs/etch-collections'));
$check($response->get_status() === ($expected ? 200 : 404), 'Native icon route must follow Pro.');
$check(isset($help['tools']['wordpress.posts.list']) && isset($help['tools']['gutenberg.read']), 'Core tools remain available.');
$check(class_exists(\PixflowDesign\WordPress\Etch\EtchModule::class, false) === $expected, 'Core must not autoload Pro implementation.');
$check(class_exists(\PixflowDesign\WordPress\Etch\EtchDesignSystemCompiler::class, false) === $expected, 'Compiler must live only in Pro.');
if ($expected) {
    $check(count($skills['paths']) >= 8, 'Full skill branch must be packaged.');
    $check(in_array('etch-design-systems', array_column($skills['skills'], 'id'), true), 'Pro design-system instructions must be present.');
}
echo json_encode(['mode' => $expected ? 'core-plus-pro' : 'core-only', 'checks' => $checks, 'etchSkills' => count($skills['paths']), 'status' => 'passed']) . PHP_EOL;
