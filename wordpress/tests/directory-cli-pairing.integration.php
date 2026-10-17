<?php
declare(strict_types=1);
$root = getenv('PIXFLOW_QA_WP_ROOT'); $prefix = getenv('PIXFLOW_QA_EXPECTED_PREFIX');
if (!$root) { echo "Set PIXFLOW_QA_WP_ROOT and PIXFLOW_QA_EXPECTED_PREFIX for the isolated WordPress CLI check.\n"; exit(0); }
if (!$root || !$prefix || !str_starts_with($prefix, 'qa_')) throw new RuntimeException('Explicit isolated fixture required.');
$config = file_get_contents(rtrim($root, '/\\') . '/wp-config.php');
if (!is_string($config) || !preg_match('/\$table_prefix\s*=\s*([\'"])([^\'"]+)\1\s*;/', $config, $match) || $match[2] !== $prefix) throw new RuntimeException('Refusing to bootstrap an unmatched WordPress table prefix.');
unset($config, $match);
define('WP_DISABLE_FATAL_ERROR_HANDLER', true);
require rtrim($root, '/\\') . '/wp-load.php';
global $wpdb;
if ($wpdb->prefix !== $prefix) throw new RuntimeException('Refusing unmatched database prefix.');
$users = get_users(['role'=>'administrator', 'number'=>1, 'fields'=>'ID']);
if (!$users) throw new RuntimeException('Fixture administrator missing.');
wp_set_current_user((int) $users[0]);
$pairings = new \PixflowDesign\WordPress\Admin\WpAdminPairingService();
if (($argv[1] ?? 'issue') === 'revoke') { echo wp_json_encode(['revoked'=>$pairings->revoke($argv[2] ?? '')]); }
else echo wp_json_encode($pairings->issue(null, 300));
