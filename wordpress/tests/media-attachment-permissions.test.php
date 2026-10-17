<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
$read = false; $edit = false; $writes = []; $checks = 0;
class WP_Error { public function __construct(public string $code, public string $message, public array $data) {} }
class WP_Query { public array $posts = [17]; public function __construct(array $args) {} }
function current_user_can($cap, $id = 0) { return $id === 17 && ($cap === 'read_post' ? $GLOBALS['read'] : ($cap === 'edit_post' && $GLOBALS['edit'])); }
function get_post_type($id) { return $id === 17 ? 'attachment' : 'post'; }
function get_post_mime_type($id) { return 'audio/mpeg'; }
function get_attached_file($id) { return __FILE__; }
function sanitize_file_name($v) { return basename($v); }
function sanitize_mime_type($v) { return $v; }
function sanitize_key($v) { return $v; }
function sanitize_text_field($v) { return $v; }
function sanitize_textarea_field($v) { return $v; }
function esc_url_raw($v) { return $v; }
function update_post_meta($id, $key, $value) { $GLOBALS['writes'][] = [$id, $key, $value]; }
class WP_Post { public string $post_excerpt = ''; public string $post_content = ''; public string $post_status = 'inherit'; public string $post_date_gmt = '2026-10-13'; public string $post_modified_gmt = '2026-10-13'; }
function get_post($id) { return new WP_Post(); }
function wp_get_attachment_url($id) { return 'https://site.test/test.mp3'; }
function wp_get_attachment_metadata($id) { return []; }
function get_the_title($id) { return 'Test'; }
function get_post_meta($id, $key, $single = false) { return ''; }
function delete_post_meta($id, $key) { $GLOBALS['writes'][] = [$id, $key, null]; }
function wp_update_post($value) { $GLOBALS['writes'][] = $value; }
function mysql_to_rfc3339($value) { return $value; }
function verify($ok, $message) { ++$GLOBALS['checks']; if (!$ok) throw new RuntimeException($message); }
require __DIR__ . '/../src/Media/MediaLibraryService.php';
$service = new \PixflowDesign\WordPress\Media\MediaLibraryService();
$result = $service->read_attachment_content(17);
verify($result instanceof WP_Error && $result->data['status'] === 403, 'Attachment bytes leaked without read_post');
$read = true;
$result = $service->read_attachment_content(17);
verify(is_array($result) && base64_decode($result['contentBase64']) === file_get_contents(__FILE__), 'Authorized bytes changed');
verify($service->read_attachment_content(99) instanceof WP_Error, 'Non-attachment accepted');
$result = $service->save_generated(['filename' => 'test.mp3', 'mimeType' => 'audio/mpeg', 'contentBase64' => base64_encode('known bytes'), 'title' => 'Replacement']);
verify($result instanceof WP_Error && $result->data['status'] === 403, 'Duplicate reuse bypassed edit_post');
verify($writes === [], 'Denied duplicate modified attachment metadata');
verify($service->import_wp_attachments([17]) === [] && $writes === [], 'Import modified an inaccessible attachment');
$edit = true;
$service->import_wp_attachments([17]);
verify(count($writes) === 2, 'Authorized import no longer marks the attachment');
$result = $service->save_generated(['filename' => 'test.mp3', 'mimeType' => 'audio/mpeg', 'contentBase64' => base64_encode('known bytes'), 'title' => 'Replacement']);
verify(is_array($result) && $result['reused'] === true && $result['attachmentId'] === 17, 'Authorized duplicate reuse must preserve attachment identity');
verify(in_array(['ID' => 17, 'post_title' => 'Replacement'], $writes, true), 'Authorized duplicate metadata was not updated');
echo "Media attachment permissions: $checks checks passed\n";
