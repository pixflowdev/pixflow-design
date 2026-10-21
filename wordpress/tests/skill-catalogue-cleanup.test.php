<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
define('PIXFLOW_DESIGN_PLUGIN_DIR', dirname(__DIR__) . '/');
require dirname(__DIR__) . '/src/autoload.php';
use PixflowDesign\WordPress\Modules\SkillAccess;
use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Admin\DirectSkillCatalog;
function check($ok, $message) { if (!$ok) throw new RuntimeException($message); }
function get_option($key, $default = false) { return $default; }
function wp_json_encode($value) { return json_encode($value); }
function sanitize_key($value) { return strtolower(preg_replace('/[^a-zA-Z0-9_-]/', '', $value)); }
function get_transient($key) { return [['id'=>'screenshot'], ['id'=>'data-report'], ['id'=>'frontend-design'], ['id'=>'agent-browser']]; }
$catalog = new DirectSkillCatalog();
try { $catalog->call('skills.read', ['path'=>'bundled/data-report/SKILL.md']); throw new LogicException('Retired report remains executable'); }
catch (RuntimeException $error) { check(str_contains($error->getMessage(), 'retired'), 'Retired read explains why unavailable'); }
$policy = SkillAccess::policy();
foreach ($policy['skills'] as $entry) {
    $status = $entry['status'] ?? 'bundled';
    if ($status === 'retired') {
        check(!SkillAccess::skill_allowed(['id'=>$entry['id']]), 'Retired ID denied: '.$entry['id']);
        $legacy = dirname(__DIR__,2).'/skills/'.$entry['folder'].'/SKILL.md';
        check(!is_readable($legacy) || !SkillAccess::reference_allowed($legacy), 'Legacy source unavailable or denied');
    }
    if ($status === 'alias') {
        if ($entry['edition'] === 'pro') {
            check(!SkillAccess::skill_allowed(['id'=>$entry['id']]), 'Private alias unavailable without its contribution');
            continue;
        }
        $read = $catalog->call('skills.read', ['path'=>'bundled/'.$entry['folder'].'/SKILL.md']);
        $target = SkillAccess::entry($entry['aliasOf']);
        check($read['content'] === file_get_contents(dirname(__DIR__,2).'/skills/'.$target['folder'].'/SKILL.md'), 'Alias returns canonical instructions');
        $mentions = $catalog->call('skills.list', ['ids'=>[$entry['id'], $entry['folder']]])['mentions'];
        foreach ($mentions as $mention) check(count($mention['paths']) > 0, 'Old mention resolves');
    }
}
$list = $catalog->call('skills.list', []);
$search = $catalog->call('skills.list', ['query'=>'gutenberg wordpress']);
check(in_array('wp-admin/gutenberg/SKILL.md', $search['paths'], true), 'Multi-word skill search matches terms across path and title');
check($catalog->call('skills.list', ['query'=>'zz-no-such-skill-zz'])['paths'] === [], 'Unknown search does not expose unrelated skills');
foreach ($list['paths'] as $path) {
    $body = $catalog->call('skills.read', ['path'=>$path])['content'];
    check(!str_contains($body, 'This catalogue entry advertises the skill'), 'No stub readable');
}
$registry = new PixflowDesign\WordPress\Od\RegistryService();
check(array_column($registry->skills(), 'id') === ['agent-browser'], 'Cached retired/alias and private rows filtered');
FeatureContributions::add('custom-skills', static fn(): string => '', ['personalSkills'=>static fn(): array => ['personal-screenshot'=>['id'=>'personal-screenshot','name'=>'Screenshot','body'=>'My unchanged instructions','description'=>'Personal']]]);
check($catalog->call('skills.read',['path'=>'personal/personal-screenshot/SKILL.md'])['content'] === 'My unchanged instructions', 'Personal same-name skill untouched');
foreach (['bundled/screenshot/../../frontend-design/SKILL.md','bundled/screenshot/references/missing.md'] as $path) {
    try { $catalog->call('skills.read',['path'=>$path]); throw new LogicException('Alias accepted arbitrary suffix'); } catch (RuntimeException $expected) {}
}
FeatureContributions::authorize_using(static fn(): bool => false);
check(str_contains($catalog->call('skills.read',['path'=>'bundled/screenshot/SKILL.md'])['content'], 'Browser verification'), 'Free screenshot replacement works');
foreach (['image-to-code','design-taste-frontend','frontend-design'] as $id) check(!SkillAccess::skill_allowed(['id'=>$id]), 'Expired Pro alias denied');
check(str_contains($catalog->call('skills.read',['path'=>'wp-admin/gutenberg/SKILL.md'])['content'],'Gutenberg'), 'Native Gutenberg remains available');
echo "Skill catalogue cleanup and aliases: passed\n";
