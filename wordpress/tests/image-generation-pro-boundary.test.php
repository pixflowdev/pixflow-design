<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
define('PIXFLOW_DESIGN_PLUGIN_DIR', dirname(__DIR__).'/');
require dirname(__DIR__) . '/src/autoload.php';
use PixflowDesign\WordPress\Modules\ImageGenerationAccess;
use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Admin\DirectSiteWorkspace;
use PixflowDesign\WordPress\Admin\DirectSkillCatalog;
function get_option($key, $fallback = false) { return $fallback; }
function current_user_can(string $capability): bool { return true; }
function wp_json_encode($value) { return json_encode($value); }
function get_transient($key) { return [['id'=>'imagegen','category'=>'image-generation'],['id'=>'wordpress-content']]; }
function check($value, $message) { if (!$value) throw new RuntimeException($message); }
function sanitize_key($value) { return strtolower(preg_replace('/[^a-zA-Z0-9_-]/', '', $value)); }
class WP_Error { public function __construct(public string $code, public string $message, public array $data) {} }
$workspace = new DirectSiteWorkspace();
$catalog = new DirectSkillCatalog();
check(!ImageGenerationAccess::available(), 'Free has no image generation');
$registry = new PixflowDesign\WordPress\Od\RegistryService();
check(array_column($registry->skills(), 'id') === ['wordpress-content'], 'Free filters a cached Pro catalogue');
check(ImageGenerationAccess::skill_allowed(['id'=>'screenshot','mode'=>'image','category'=>'screenshots']), 'Keep screenshot/reference functionality separate');
check(ImageGenerationAccess::skill_allowed(['id'=>'wordpress-content']), 'Keep ordinary WordPress skills');
check(!ImageGenerationAccess::skill_allowed(['id'=>'imagegen']), 'Hide old imagegen references');
check(!ImageGenerationAccess::skill_allowed(['id'=>'brandkit','category'=>'image-generation']), 'Hide category-based image skills');
check(!isset($workspace->help()['tools']['media.import']), 'Do not advertise generated-image import');
check(isset($workspace->help()['tools']['gutenberg.read']), 'Keep core editing');
try { $workspace->call('media.import', [], true); throw new LogicException('Free imported generated media'); } catch (RuntimeException $error) { check(str_contains($error->getMessage(),'Pro'), 'Specific Pro error'); }
try { $catalog->call('skills.read', ['path'=>'bundled/imagegen/SKILL.md']); throw new LogicException('Free read imagegen'); } catch (RuntimeException $error) { check(str_contains($error->getMessage(),'retired'), 'Reject retired placeholder read'); }
check(ImageGenerationAccess::reference_allowed(dirname(__DIR__,2).'/skills/screenshot/SKILL.md'), 'Keep screenshot reference');
$result = (new PixflowDesign\WordPress\Media\MediaGenerationService())->generate(['surface'=>'IMAGE']);
check($result instanceof WP_Error && $result->code==='pixflow_pro_image_generation_required' && $result->data['status']===403, 'Reject generation before entitlement/network calls');
FeatureContributions::add('assets', static fn(): string => '');
FeatureContributions::add('creative-skills', static fn(): string => '');
check(ImageGenerationAccess::available(), 'Restore Pro image generation');
check(!in_array('imagegen', array_column($registry->skills(), 'id'), true), 'Pro does not restore a retired cached placeholder');
check(isset($workspace->help()['tools']['media.import']), 'Restore Pro generated-image tool');
try { $catalog->call('skills.read', ['path'=>'bundled/imagegen/SKILL.md']); throw new LogicException('Pro read retired placeholder'); } catch (RuntimeException $error) { check(str_contains($error->getMessage(),'retired'), 'Pro retains image tools without a fake install skill'); }
FeatureContributions::authorize_using(static fn(): bool => false);
check(!ImageGenerationAccess::available() && !ImageGenerationAccess::skill_allowed(['id'=>'imagegen']), 'Expiry removes access immediately');
check(!in_array('imagegen', array_column($registry->skills(), 'id'), true), 'Expiry filters the same cached catalogue immediately');
echo "image-generation-pro-boundary: passed\n";
