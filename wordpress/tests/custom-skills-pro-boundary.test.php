<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require dirname(__DIR__) . '/src/autoload.php';
use PixflowDesign\WordPress\Modules\PersonalSkills;
use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Admin\NativeAbilityCatalog;
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergExtensions;
$meta = []; $user = 1;
function get_current_user_id(): int { return $GLOBALS['user']; }
function get_user_meta($id, $key, $single) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function update_user_meta($id, $key, $value) { $GLOBALS['meta'][$id][$key] = $value; return true; }
function sanitize_title($name) { return strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', $name), '-')); }
function sanitize_key($name) { return strtolower(preg_replace('/[^a-zA-Z0-9_-]/', '', $name)); }
function check($value, $message) { if (!$value) throw new RuntimeException($message); }
check(!class_exists(\PixflowDesign\WordPress\Od\PersonalSkillStore::class), 'Free must not contain personal skill implementation');
check(!class_exists(\PixflowDesign\WordPress\Admin\WpAdminAcfCapabilityService::class), 'Free must not contain ACF handler');
check(PersonalSkills::all() === [], 'Free skills discovery must exclude personal library');
try { PersonalSkills::save(['name'=>'Test','body'=>'No']); throw new LogicException('Free accepted write'); } catch (RuntimeException $expected) {}
check(NativeAbilityCatalog::allowed('core/get-site-info'), 'Core native abilities remain available');
check(!NativeAbilityCatalog::allowed('woocommerce/list-products'), 'Third-party native ability must require Pro');
check(GutenbergExtensions::support('kadence/rowlayout')['allowed'] === false, 'Free must protect existing specialist blocks');
echo "Free custom-skill and specialist ability boundaries passed.\n";
