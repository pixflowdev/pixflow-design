<?php
declare(strict_types=1);

define('ABSPATH', dirname(__DIR__) . '/');
function wp_unslash($value) { return stripslashes($value); }
function wp_parse_url($value, $component) { return parse_url($value, $component); }
function sanitize_text_field($value) { return trim(strip_tags($value)); }
require dirname(__DIR__) . '/src/Admin/WpAdminContext.php';

set_error_handler(static function (int $severity, string $message): never { throw new ErrorException($message, 0, $severity); });
$context = new \PixflowDesign\WordPress\Admin\WpAdminContext();
$path = new ReflectionMethod($context, 'request_path');
$positive = new ReflectionMethod($context, 'positive_int');
foreach ([null, [], ['post.php'], new stdClass()] as $invalid) {
    $_SERVER['REQUEST_URI'] = $invalid;
    if ($path->invoke($context) !== '') throw new RuntimeException('Malformed request path was not ignored.');
}
$_SERVER['REQUEST_URI'] = '/wp-admin/post.php?post=42&secret=private';
if ($path->invoke($context) !== '/wp-admin/post.php') throw new RuntimeException('Query parameters leaked into context.');
foreach ([[], ['42'], "42 OR 1=1", new stdClass(), -12] as $invalid) {
    if ($positive->invoke($context, $invalid) !== 0) throw new RuntimeException('Malformed object ID was accepted.');
}
if ($positive->invoke($context, '42') !== 42) throw new RuntimeException('Existing numeric object IDs changed.');
restore_error_handler();
echo "WP admin context request inputs: passed\n";
