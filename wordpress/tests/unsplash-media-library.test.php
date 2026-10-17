<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
function wp_parse_url($url, $component = -1) { return parse_url($url, $component); }
$GLOBALS['allowed'] = true;
$GLOBALS['meta'] = [];
$GLOBALS['posts'] = [];
$GLOBALS['filters'] = [];
function current_user_can($cap) { return $GLOBALS['allowed']; }
function add_filter($name, $callback, $priority = 10, $args = 1) { $GLOBALS['filters'][$name] = $callback; }
function get_post_meta($id, $key, $single) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function update_post_meta($id, $key, $value) { $GLOBALS['meta'][$id][$key] = $value; }
function sanitize_text_field($text) { return trim(strip_tags($text)); }
function sanitize_title($text) { return strtolower(str_replace(' ', '-', $text)); }
function esc_url($text) { return htmlspecialchars($text, ENT_QUOTES); }
function esc_html($text) { return htmlspecialchars($text, ENT_QUOTES); }
function get_posts($args) { return array_keys(array_filter($GLOBALS['meta'], fn($meta) => ($meta[$args['meta_key']] ?? null) === $args['meta_value'])); }
function wp_insert_attachment($post, $file, $parent, $error) { $id = count($GLOBALS['posts']) + 1; $GLOBALS['posts'][$id] = $post; return $id; }
function is_wp_error($value) { return false; }
function wp_update_attachment_metadata($id, $value) { update_post_meta($id, '_wp_attachment_metadata', $value); }
function wp_get_attachment_url($id) { return ($GLOBALS['filters']['wp_get_attachment_url'])('local-default', $id); }
function get_the_title($id) { return $GLOBALS['posts'][$id]['post_title']; }
require __DIR__ . '/../src/Media/UnsplashMediaLibrary.php';
use PixflowDesign\WordPress\Media\UnsplashMediaLibrary;
function verify($value, $message) { if (!$value) throw new RuntimeException($message); }
$service = new UnsplashMediaLibrary(); $service->register();
$args = ['photo'=>['id'=>'photo-1', 'url'=>'https://images.unsplash.com/photo-1?ixid=original', 'width'=>1200, 'height'=>800, 'photographer'=>'A & B', 'photographerUrl'=>'https://unsplash.com/@artist', 'sourceUrl'=>'https://unsplash.com/photos/photo-1'], 'title'=>'Studio light', 'filename'=>'studio-light.jpg', 'altText'=>'Light falls across a studio'];
$first = $service->create($args);
verify($first['url'] === $args['photo']['url'], 'Original URL was changed');
verify(get_post_meta($first['id'], '_wp_attachment_image_alt', true) === $args['altText'], 'Alt text missing');
verify(str_contains($first['caption'], 'A &amp; B'), 'Credit not escaped');
verify($GLOBALS['posts'][$first['id']]['post_name'] === 'studio-light', 'Record slug missing');
$again = $service->create($args);
verify($again['id'] === $first['id'] && $again['reused'], 'Duplicate attachment created');
verify(wp_get_attachment_url(999) === 'local-default', 'Unrelated attachment changed');
foreach (['http://images.unsplash.com/a', 'https://images.unsplash.com.evil.test/a', 'https://user@images.unsplash.com/a', 'https://images.unsplash.com:444/a', 'file:///photo.jpg'] as $url) {
    $bad = $args; $bad['photo']['url'] = $url;
    try { $service->create($bad); throw new RuntimeException('Unsafe origin accepted'); } catch (InvalidArgumentException $expected) {}
}
$GLOBALS['allowed'] = false;
try { $service->create($args); throw new LogicException('Permission ignored'); } catch (RuntimeException $expected) {}
echo "Unsplash Media Library tests passed\n";
