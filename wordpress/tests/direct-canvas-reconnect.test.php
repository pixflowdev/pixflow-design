<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin\Gutenberg {
    final class GutenbergEntity {
        public static function validate(array $entity): array {
            if ($entity !== ['type' => 'page', 'id' => '10']) throw new \RuntimeException('Builder-managed content requires its dedicated capability.');
            return $entity;
        }
    }
}

namespace {
    define('ABSPATH', __DIR__);
    $options = [];
    function get_option($key) { return $GLOBALS['options'][$key] ?? false; }
    function update_option($key, $value, $autoload = false) { $GLOBALS['options'][$key] = $value; }
    function delete_option($key) { unset($GLOBALS['options'][$key]); }
    function get_current_user_id() { return 1; }
    function get_current_blog_id() { return 1; }
    function current_user_can($capability, $id) { return $id === 10; }
    require dirname(__DIR__) . '/src/Admin/DirectCanvasRelay.php';

    function check(bool $ok, string $message): void { if (!$ok) throw new \RuntimeException($message); }
    function rejected(callable $action, string $message): void {
        try { $action(); } catch (\RuntimeException $error) {
            check(str_contains($error->getMessage(), $message), 'Unexpected rejection: ' . $error->getMessage());
            return;
        }
        throw new \RuntimeException('Expected rejection: ' . $message);
    }
    $id = str_repeat('a', 32);
    $key = 'pixflow_gutenberg_canvas_' . $id;
    $old = ['userId' => 1, 'blogId' => 1, 'postId' => 14, 'entity' => ['type' => 'page', 'id' => '14'], 'seenAt' => 1];
    $entity = ['type' => 'page', 'id' => '10'];
    $relay = new \PixflowDesign\WordPress\Admin\DirectCanvasRelay('gutenberg');
    $options[$key] = $old;
    $options[$key . '_context'] = ['postId' => 14];
    $result = $relay->register(10, $id, false, $entity);
    check($result === ['canvasId' => $id, 'postId' => 10], 'Reconnect must accept the current valid document.');
    check($options[$key]['entity'] === $entity, 'Reconnect must replace the stale document identity.');
    check(!isset($options[$key . '_context']), 'Previous document context must be discarded.');
    rejected(fn() => $relay->target($id, 14, $old['entity']), 'changed documents');
    check($relay->target($id, 10, $entity)['postId'] === 10, 'Current target remains accessible.');

    $before = $options;
    rejected(fn() => $relay->register(14, $id, false, $old['entity']), 'Builder-managed');
    check($options === $before, 'Invalid current document must not change the mailbox.');
    foreach (['userId', 'blogId'] as $field) {
        $options[$key] = array_replace($old, [$field => 2]);
        $before = $options;
        rejected(fn() => $relay->register(10, $id, false, $entity), 'site/user');
        check($options === $before, 'Reconnect must preserve another owner’s mailbox.');
    }
    echo "direct-canvas-reconnect: ok\n";
}
