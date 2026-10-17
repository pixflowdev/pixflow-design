<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require_once __DIR__ . '/../src/autoload.php';
require __DIR__ . '/../src/Od/CatalogueCuration.php';
use PixflowDesign\WordPress\Od\CatalogueCuration;
function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
check(!CatalogueCuration::discoverable('skills', 'imagegen'), 'Upstream install stub must not appear as executable skill');
check(CatalogueCuration::discoverable('skills', 'brandkit'), 'Complete branding recipe retained');
check(CatalogueCuration::discoverable('skills', 'gsap-core'), 'Animation specialist retained');
check(!CatalogueCuration::discoverable('templates', 'clinical-case-report'), 'Unrelated template retired from discovery');
check(CatalogueCuration::discoverable('templates', 'pricing-page'), 'Website template retained');
check(!CatalogueCuration::discoverable('plugins', 'od-new-generation'), 'Old orchestration scenario hidden');
check(CatalogueCuration::discoverable('skills', 'personal-imagegen'), 'Personal content not selected for retirement');
check(CatalogueCuration::discoverable('skills', 'future-useful-skill'), 'Unknown additions remain discoverable');
check(CatalogueCuration::revision() !== '', 'Cache identity includes curation revision');

function sanitize_key(string $s): string { return strtolower(preg_replace('/[^a-zA-Z0-9_-]/', '', $s)); }
function sanitize_text_field(string $s): string { return $s; }
function sanitize_textarea_field(string $s): string { return $s; }
require __DIR__ . '/../src/Od/RegistryService.php';
$reflection = new ReflectionClass(\PixflowDesign\WordPress\Od\RegistryService::class);
$registry = $reflection->newInstanceWithoutConstructor();
$root = dirname(__DIR__, 2);
$list = $reflection->getMethod('skill_summaries')->invoke($registry, [$root . '/skills'], 'prototype');
check(!in_array('imagegen', array_column($list, 'id'), true), 'Real scanner removes stub');
check(!in_array('brandkit', array_column($list, 'id'), true), 'Free scanner does not need private branding sources');
check(in_array('agent-browser', array_column($list, 'id'), true), 'Real scanner retains essential browser guidance');
$detail = $reflection->getMethod('skill_detail')->invoke($registry, [$root . '/skills'], 'imagegen', 'prototype');
check($detail === null, 'Retired placeholder cannot be executed from a saved reference');
$templates = $reflection->getMethod('skill_summaries')->invoke($registry, [$root . '/design-templates'], 'template');
check(in_array('pricing-page', array_column($templates, 'id'), true), 'Real scanner retains web template');
check(!in_array('clinical-case-report', array_column($templates, 'id'), true), 'Real scanner hides unrelated template');
$detail = $reflection->getMethod('skill_detail')->invoke($registry, [$root . '/design-templates'], 'clinical-case-report', 'template');
check(is_array($detail), 'Saved template detail remains resolvable');
$recipes = $reflection->getMethod('skill_summaries')->invoke($registry, [$root . '/skills'], 'template', true);
check(count($recipes) > 0, 'Rendering recipes remain discoverable as templates');
foreach ($recipes as $recipe) {
    check(!in_array($recipe['id'], array_column($list, 'id'), true), 'Rendering recipe not duplicated in functional skills');
    $detail = $reflection->getMethod('skill_detail')->invoke($registry, [$root . '/skills'], $recipe['id'], 'template', true);
    check(!empty($detail['body']), 'Relocated recipe detail resolves');
}
check($reflection->getMethod('skill_detail')->invoke($registry, [$root . '/skills'], 'imagegen', 'template', true) === null, 'Template fallback does not advertise retired stubs');
echo "catalogue-curation: passed\n";
check(CatalogueCuration::pluginDestination('example-orbis-nft') === 'bricks', 'Web reference has a native Bricks destination');
check(CatalogueCuration::pluginDestination('image-template-anime-martial-arts-battle-illustration') === 'media', 'Image recipe has a media destination');
check(!CatalogueCuration::discoverable('plugins', 'unknown-workspace-project'), 'Unsupported workspace workflows are not advertised');
foreach (['example-orbis-nft', 'example-skyelite-private-jets', 'example-3d-creator-portfolio'] as $id) {
    check(!CatalogueCuration::discoverable('plugins', $id), 'Community reference retired from discovery: ' . $id);
    check(CatalogueCuration::pluginDestination($id) === 'bricks', 'Website prototype uses native Bricks: ' . $id);
}


// Product-owner removals must not reappear when the catalogue expands.
check(!CatalogueCuration::discoverable('plugins', 'example-wireframe-sketch'), 'Explicitly removed resource stays hidden: wireframe-sketch');
check(!CatalogueCuration::discoverable('plugins', 'example-waitlist-page'), 'Explicitly removed resource stays hidden: waitlist-page');
check(!CatalogueCuration::discoverable('plugins', 'example-web-prototype'), 'Explicitly removed resource stays hidden: web-prototype');
check(!CatalogueCuration::discoverable('plugins', 'example-web-prototype-taste-editorial'), 'Explicitly removed resource stays hidden: web-prototype-taste-editorial');
check(!CatalogueCuration::discoverable('plugins', 'example-web-prototype-taste-soft'), 'Explicitly removed resource stays hidden: web-prototype-taste-soft');
check(!CatalogueCuration::discoverable('plugins', 'example-pricing-page'), 'Explicitly removed resource stays hidden: pricing-page');
check(!CatalogueCuration::discoverable('plugins', 'example-saas-landing'), 'Explicitly removed resource stays hidden: saas-landing');
check(!CatalogueCuration::discoverable('plugins', 'example-social-media-dashboard'), 'Explicitly removed resource stays hidden: social-media-dashboard');
check(!CatalogueCuration::discoverable('plugins', 'example-pixflow-luxury'), 'Explicitly removed resource stays hidden: pixflow-luxury');
check(!CatalogueCuration::discoverable('plugins', 'example-pixflow-energetic'), 'Explicitly removed resource stays hidden: pixflow-energetic');
check(!CatalogueCuration::discoverable('plugins', 'example-pixflow-bento'), 'Explicitly removed resource stays hidden: pixflow-bento');
check(!CatalogueCuration::discoverable('plugins', 'example-poster-hero'), 'Explicitly removed resource stays hidden: poster-hero');
check(!CatalogueCuration::discoverable('plugins', 'example-article-magazine'), 'Explicitly removed resource stays hidden: article-magazine');
check(!CatalogueCuration::discoverable('plugins', 'example-kami-landing'), 'Explicitly removed resource stays hidden: kami-landing');
check(!CatalogueCuration::discoverable('plugins', 'example-github-dashboard'), 'Explicitly removed resource stays hidden: github-dashboard');
check(!CatalogueCuration::discoverable('plugins', 'example-gamified-app'), 'Explicitly removed resource stays hidden: gamified-app');
check(!CatalogueCuration::discoverable('plugins', 'example-flowai-live-dashboard-template'), 'Explicitly removed resource stays hidden: flowai-live-dashboard-template');
check(!CatalogueCuration::discoverable('plugins', 'example-dating-web'), 'Explicitly removed resource stays hidden: dating-web');
check(!CatalogueCuration::discoverable('plugins', 'example-dashboard-ui-glass'), 'Explicitly removed resource stays hidden: dashboard-ui-glass');
check(!CatalogueCuration::discoverable('plugins', 'example-web-prototype-taste-brutalist'), 'Explicitly removed resource stays hidden: web-prototype-taste-brutalist');
check(!CatalogueCuration::discoverable('plugins', 'example-magazine-poster'), 'Explicitly removed resource stays hidden: magazine-poster');
check(!CatalogueCuration::discoverable('plugins', 'example-blog-post'), 'Explicitly removed resource stays hidden: blog-post');
check(!CatalogueCuration::discoverable('plugins', 'example-kanban-board'), 'Explicitly removed resource stays hidden: kanban-board');
check(!CatalogueCuration::discoverable('plugins', 'example-nimbus-grid'), 'Explicitly removed resource stays hidden: nimbus-grid');
check(!CatalogueCuration::discoverable('plugins', 'example-codenest-coding-platform'), 'Explicitly removed resource stays hidden: codenest-coding-platform');
check(!CatalogueCuration::discoverable('plugins', 'example-ai-designer-portfolio'), 'Explicitly removed resource stays hidden: ai-designer-portfolio');
check(!CatalogueCuration::discoverable('plugins', 'example-cinematic-landing-page'), 'Explicitly removed resource stays hidden: cinematic-landing-page');
check(!CatalogueCuration::discoverable('plugins', 'image-template-3d-stone-staircase-evolution-infographic'), 'Explicitly removed resource stays hidden: image-template-3d-stone-staircase-evolution-infographic');
check(!CatalogueCuration::discoverable('plugins', 'image-template-e-commerce-live-stream-ui-mockup'), 'Explicitly removed resource stays hidden: image-template-e-commerce-live-stream-ui-mockup');
check(!CatalogueCuration::discoverable('plugins', 'image-template-illustrated-city-food-map'), 'Explicitly removed resource stays hidden: image-template-illustrated-city-food-map');
check(!CatalogueCuration::discoverable('plugins', 'image-template-illustration-crayon-kid-drawing-rework'), 'Explicitly removed resource stays hidden: image-template-illustration-crayon-kid-drawing-rework');
check(!CatalogueCuration::discoverable('plugins', 'image-template-infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels'), 'Explicitly removed resource stays hidden: image-template-infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels');
check(!CatalogueCuration::discoverable('plugins', 'image-template-momotaro-explainer-slide-in-hybrid-style'), 'Explicitly removed resource stays hidden: image-template-momotaro-explainer-slide-in-hybrid-style');
check(!CatalogueCuration::discoverable('plugins', 'image-template-notion-team-dashboard-live-artifact'), 'Explicitly removed resource stays hidden: image-template-notion-team-dashboard-live-artifact');
check(!CatalogueCuration::discoverable('plugins', 'image-template-profile-avatar-anime-girl-to-cinematic-photo'), 'Explicitly removed resource stays hidden: image-template-profile-avatar-anime-girl-to-cinematic-photo');
check(!CatalogueCuration::discoverable('plugins', 'image-template-profile-avatar-realistically-imperfect-ai-selfie'), 'Explicitly removed resource stays hidden: image-template-profile-avatar-realistically-imperfect-ai-selfie');
check(!CatalogueCuration::discoverable('plugins', 'image-template-social-media-post-anime-pokemon-shop-outfit-teaser-poster'), 'Explicitly removed resource stays hidden: image-template-social-media-post-anime-pokemon-shop-outfit-teaser-poster');
check(!CatalogueCuration::discoverable('plugins', 'image-template-social-media-post-confused-elf-girl-at-pastel-desk'), 'Explicitly removed resource stays hidden: image-template-social-media-post-confused-elf-girl-at-pastel-desk');
check(!CatalogueCuration::discoverable('plugins', 'image-template-social-media-post-showa-day-retro-culture-magazine-cover'), 'Explicitly removed resource stays hidden: image-template-social-media-post-showa-day-retro-culture-magazine-cover');
check(!CatalogueCuration::discoverable('plugins', 'image-template-social-media-post-social-media-fashion-outfit-generation'), 'Explicitly removed resource stays hidden: image-template-social-media-post-social-media-fashion-outfit-generation');
check(!CatalogueCuration::discoverable('plugins', 'image-template-social-media-post-vintage-sign-painter-sketch'), 'Explicitly removed resource stays hidden: image-template-social-media-post-vintage-sign-painter-sketch');
check(!CatalogueCuration::discoverable('plugins', 'image-template-vr-headset-exploded-view-poster'), 'Explicitly removed resource stays hidden: image-template-vr-headset-exploded-view-poster');
check(!CatalogueCuration::discoverable('plugins', 'example-live-dashboard'), 'Explicitly removed resource stays hidden: example-live-dashboard');
check(!CatalogueCuration::discoverable('plugins', 'video-template-beat-synced-outfit-transformation-dance'), 'Explicitly removed resource stays hidden: video-template-beat-synced-outfit-transformation-dance');
check(!CatalogueCuration::discoverable('plugins', 'video-template-retro-hk-wuxia-film-aesthetic'), 'Explicitly removed resource stays hidden: video-template-retro-hk-wuxia-film-aesthetic');
check(!CatalogueCuration::discoverable('plugins', 'video-template-sequence-and-movement-instruction-for-martial-arts-video'), 'Explicitly removed resource stays hidden: video-template-sequence-and-movement-instruction-for-martial-arts-video');
check(!CatalogueCuration::discoverable('plugins', 'video-template-toaster-rocket-jumpscare'), 'Explicitly removed resource stays hidden: video-template-toaster-rocket-jumpscare');
check(!CatalogueCuration::discoverable('plugins', 'video-template-traditional-dance-performance'), 'Explicitly removed resource stays hidden: video-template-traditional-dance-performance');
check(!CatalogueCuration::discoverable('plugins', 'video-template-viral-k-pop-dance-choreography'), 'Explicitly removed resource stays hidden: video-template-viral-k-pop-dance-choreography');

$fixture = sys_get_temp_dir() . '/pixflow-skill-priority-' . bin2hex(random_bytes(6));
mkdir($fixture . '/agent-browser', 0777, true);
file_put_contents($fixture . '/agent-browser/SKILL.md', "---\nname: agent-browser\n---\n# Obsolete legacy guidance\n");
try {
    $current = $reflection->getMethod('skill_detail')->invoke($registry, [$fixture, $root . '/skills'], 'agent-browser', 'prototype');
    check($current['body'] === file_get_contents($root . '/skills/agent-browser/SKILL.md'), 'Current Free bundle outranks obsolete preserved source');
} finally {
    unlink($fixture . '/agent-browser/SKILL.md');
    rmdir($fixture . '/agent-browser');
    rmdir($fixture);
}
