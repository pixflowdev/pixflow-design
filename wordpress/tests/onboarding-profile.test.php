<?php
declare(strict_types=1);

define('ABSPATH', __DIR__);
$profiles = [];
$legacy = [];
function get_user_option($key, $id) { return $GLOBALS['profiles'][$id] ?? false; }
function update_user_option($id, $key, $value, $global = false) { $GLOBALS['profiles'][$id] = $value; return true; }
function get_option($key, $default = false) { return $GLOBALS['legacy']; }
function sanitize_text_field($value) { return strip_tags((string) $value); }
function sanitize_key($value) { return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)); }
require_once __DIR__ . '/../src/Onboarding/UserOnboardingProfile.php';

function check($condition, $message) { if (!$condition) throw new RuntimeException($message); }
$service = new \PixflowDesign\WordPress\Onboarding\UserOnboardingProfile();
check(!$service->get(1)['completed'], 'New user starts incomplete');
$service->save(1, ['step' => 3, 'runtimeMode' => 'none']);
check($service->get(1)['step'] === 3 && !$service->get(1)['completed'], 'Progress does not complete onboarding');
check($service->get(1)['runtimeMode'] === 'none', 'No-AI route survives reload');
check($service->get(2)['step'] === 0, 'User progress is isolated');
$service->save(1, ['completed' => true]);
check($service->get(1)['completed'] && $service->get(1)['runtimeMode'] === 'none', 'Completion retains route');
$legacy = ['onboardingCompleted' => true];
check($service->get(3)['completed'], 'Legacy completed installations retain completion');
$service->reset(1);
check(!$service->get(1)['completed'] && $service->get(1)['step'] === 0 && $service->get(1)['runtimeMode'] === null, 'Reset clears progress without rerunning migration');
$service->save(1, ['step' => 999, 'apiKey' => 'must-not-persist']);
check($service->get(1)['step'] === 3 && !isset($profiles[1]['apiKey']), 'Only supported progress fields are persisted');
echo "PASS: onboarding progress, completion, reset, migration and user isolation\n";
