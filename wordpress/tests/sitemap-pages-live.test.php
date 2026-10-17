<?php
// Run through wp eval-file on the disposable local QA site.
if (!defined('ABSPATH')) { echo "SKIP: run through WP CLI on a test site.\n"; return; }
wp_set_current_user(12);
function sitemap_assert(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$service = new \PixflowDesign\WordPress\Sitemap\SitemapPageService();
$ids = [];
$key = 'qa-sitemap-' . bin2hex(random_bytes(5));
$reading = [get_option('show_on_front'), get_option('page_on_front'), get_option('page_for_posts')];
try {
    $nodes = [
        ['id' => 'root', 'title' => 'QA Sitemap Root', 'slug' => $key, 'parentId' => null, 'order' => 0],
        ['id' => 'child', 'title' => 'QA Child', 'slug' => 'same', 'parentId' => 'root', 'order' => 2],
        ['id' => 'other', 'title' => 'QA Other', 'slug' => $key . '-other', 'parentId' => null, 'order' => 1],
    ];
    $result = $service->sync(['sitemapId' => $key, 'nodes' => $nodes, 'nodeIds' => ['child'], 'status' => 'private']);
    sitemap_assert(!is_wp_error($result) && $result['errors'] === 0, 'Initial creation failed.');
    foreach ($result['nodes'] as $item) $ids[$item['nodeId']] = $item['wpPostId'];
    sitemap_assert(get_post_status($ids['root']) === 'draft', 'Creating a private child changed ancestor publication.');
    sitemap_assert(get_post_status($ids['child']) === 'private', 'Private state was not saved.');
    $created_child = array_values(array_filter($result['nodes'], fn($item) => $item['nodeId'] === 'child'))[0];
    sitemap_assert($created_child['title'] === 'QA Child', 'Private title leaked the display prefix into saved metadata.');
    sitemap_assert(!$created_child['isBricksBuilt'], 'Empty Bricks editor mode was reported as built content.');
    sitemap_assert((int) wp_get_post_parent_id($ids['child']) === $ids['root'], 'Real parent relationship was lost.');
    $repeat = $service->sync(['sitemapId' => $key, 'nodes' => $nodes, 'nodeIds' => ['child']]);
    sitemap_assert($repeat['created'] === 0 && get_post_status($ids['child']) === 'private', 'Repeated sync duplicated or unpublished a page.');
    $other = $service->sync(['sitemapId' => $key, 'nodes' => $nodes, 'nodeIds' => ['other'], 'status' => 'draft']);
    $ids['other'] = $other['nodes'][0]['wpPostId'];
    $tree = [['id' => 'qa0001', 'name' => 'heading', 'parent' => 0, 'children' => [], 'settings' => ['text' => 'Preserve this']]];
    update_post_meta($ids['child'], '_bricks_page_content_2', $tree);
    foreach ([['published', 'publish'], ['draft', 'draft'], ['private', 'private'], ['planned', 'trash'], ['planned', 'trash'], ['draft', 'draft']] as [$state, $wp_state]) {
        $updated = $service->update_page(['wpPostId' => $ids['child'], 'status' => $state]);
        sitemap_assert(!is_wp_error($updated) && get_post_status($ids['child']) === $wp_state, 'State transition failed: ' . $state);
        sitemap_assert(get_post_meta($ids['child'], '_bricks_page_content_2', true) === $tree, 'State transition lost Bricks content.');
    }
    // Explicitly restore after Trash (duplicate associative keys cannot express a repeated transition).
    $service->update_page(['wpPostId' => $ids['child'], 'status' => 'draft']);
    sitemap_assert(get_post_status($ids['child']) === 'draft', 'Same-ID restoration failed.');
    $edited = $service->update_page(['wpPostId' => $ids['child'], 'title' => 'Renamed & retained', 'slug' => 'renamed', 'parentId' => $ids['other'], 'order' => 7]);
    sitemap_assert(!is_wp_error($edited) && $edited['page']['parentId'] === $ids['other'] && $edited['page']['menuOrder'] === 7, 'Move/order update failed.');
    sitemap_assert(is_wp_error($service->update_page(['wpPostId' => $ids['other'], 'parentId' => $ids['child']])), 'Hierarchy cycle was accepted.');
    sitemap_assert(is_wp_error($service->update_page(['wpPostId' => $ids['child'], 'status' => 'generated'])), 'Generation activity became publication state.');
    $cycle_nodes = $nodes;
    $cycle_nodes[0]['parentId'] = 'child';
    sitemap_assert(is_wp_error($service->sync(['sitemapId' => $key, 'nodes' => $cycle_nodes])), 'Sync accepted a hierarchy cycle.');
    $live_plan = (new \PixflowDesign\WordPress\Sitemap\SitemapStateRepository())->load_live();
    if ($live_plan !== null) {
        $live_child = array_values(array_filter($live_plan['nodes'], fn($node) => ($node['wpPostId'] ?? 0) === $ids['child']))[0];
        $live_parent = array_values(array_filter($live_plan['nodes'], fn($node) => ($node['wpPostId'] ?? 0) === $ids['other']))[0];
        sitemap_assert($live_child['parentId'] === $live_parent['id'] && $live_child['title'] === 'Renamed & retained', 'Server read did not rehydrate native WordPress edits.');
    }
    wp_set_current_user(0);
    sitemap_assert(is_wp_error($service->update_page(['wpPostId' => $ids['child'], 'status' => 'published'])), 'Native WordPress permissions were not respected.');
    wp_set_current_user(12);
    $direct = new \PixflowDesign\WordPress\Admin\DirectSiteWorkspace();
    $direct_result = $direct->call('sitemap.sync', ['sitemapId' => $key, 'nodes' => [
        ['id' => 'other', 'title' => 'QA Direct Imported Edit', 'slug' => $key . '-other', 'parentId' => null, 'order' => 1, 'wpPostId' => $ids['other'], 'isImportedFromWordPress' => true, 'isGeneratedByPixflow' => false],
    ]], true);
    sitemap_assert($direct_result['updated'] === 1 && get_post_field('post_title', $ids['other']) === 'QA Direct Imported Edit', 'Direct sync applied legacy imported-page restrictions.');
    $inventory = $service->inventory();
    $item = array_values(array_filter($inventory['pages'], fn($page) => $page['id'] === $ids['child']))[0];
    sitemap_assert($item['title'] === 'Renamed & retained' && $item['isBricksBuilt'], 'Inventory did not expose native page edits.');
    sitemap_assert($reading === [get_option('show_on_front'), get_option('page_on_front'), get_option('page_for_posts')], 'Page lifecycle changed reading settings.');
    echo "PASS: create ancestors, private child, idempotency, four states, same-ID restoration, Bricks preservation, rename/slug/move/order, cycle, inventory, reading settings.\n";
} finally {
    foreach (array_reverse($ids) as $id) wp_delete_post($id, true);
}
