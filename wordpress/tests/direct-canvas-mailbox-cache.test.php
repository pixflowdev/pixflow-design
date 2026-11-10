<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\Modules {
    final class BuilderIntegrations {
        public static function active(string $builder): bool { return $builder === 'bricks'; }
        public static function get(string $builder, string $key, mixed $default = null): mixed {
            return match ($key) {
                'commands' => ['bricks.read', 'bricks.run', 'bricks.save'],
                'legacyOptionalPostId' => true,
                default => $default,
            };
        }
    }
}
namespace {
    define('ABSPATH', __DIR__ . '/');
    $options = $cached = $transients = [];
    function get_current_user_id(): int { return 7; }
    function get_current_blog_id(): int { return 1; }
    function current_user_can(string $cap, int $post = 0): bool { return true; }
    function maybe_serialize(mixed $value): string { return serialize($value); }
    function maybe_unserialize(mixed $value): mixed { return $value === null ? false : unserialize($value); }
    function get_option(string $key): mixed { return array_key_exists($key, $GLOBALS['cached']) ? $GLOBALS['cached'][$key] : ($GLOBALS['options'][$key] ?? false); }
    function update_option(string $key, mixed $value, bool $autoload = false): void { $GLOBALS['options'][$key] = $value; unset($GLOBALS['cached'][$key]); }
    function add_option(string $key, mixed $value, string $deprecated = '', bool $autoload = false): bool {
        if (array_key_exists($key, $GLOBALS['options'])) return false;
        update_option($key, $value);
        return true;
    }
    function delete_option(string $key): void { unset($GLOBALS['options'][$key], $GLOBALS['cached'][$key]); }
    function wp_cache_delete(string $key, string $group): void { unset($GLOBALS['cached'][$key]); }
    function get_transient(string $key): mixed { return $GLOBALS['transients'][$key] ?? false; }
    function set_transient(string $key, mixed $value, int $ttl): void { $GLOBALS['transients'][$key] = $value; }
    function check(bool $value, string $message): void { if (!$value) throw new \RuntimeException($message); }
    $wpdb = new class {
        public string $options = 'wp_options';
        public string $last_error = '';
        public bool $failRead = false;
        public function prepare(string $query, mixed ...$args): array { return [$query, $args]; }
        public function esc_like(string $value): string { return $value; }
        public function get_col(array $query): array { return array_filter(array_keys($GLOBALS['options']), fn($key) => str_starts_with($key, rtrim($query[1][0], '%'))); }
        public function get_var(array $query): ?string {
            if ($this->failRead) { $this->last_error = 'Synthetic database failure'; return null; }
            $this->last_error = '';
            return array_key_exists($query[1][0], $GLOBALS['options']) ? maybe_serialize($GLOBALS['options'][$query[1][0]]) : null;
        }
        public function query(array $query): int {
            [$sql, $args] = $query;
            if (str_starts_with($sql, 'INSERT IGNORE')) {
                if (array_key_exists($args[0], $GLOBALS['options'])) return 0;
                $GLOBALS['options'][$args[0]] = maybe_unserialize($args[1]);
                return 1;
            }
            if (str_starts_with($sql, 'DELETE FROM')) {
                if (!array_key_exists($args[0], $GLOBALS['options']) || maybe_serialize($GLOBALS['options'][$args[0]]) !== $args[1]) return 0;
                unset($GLOBALS['options'][$args[0]]);
                return 1;
            }
            throw new \RuntimeException('Unexpected SQL');
        }
    };
    require dirname(__DIR__) . '/src/Admin/DirectCanvasRelay.php';
    $relay = new \PixflowDesign\WordPress\Admin\DirectCanvasRelay();
    $id = $relay->register(12)['canvasId'];
    $key = 'pixflow_canvas_' . $id . '_command';
    $session = ['writable' => true, 'expiresAt' => time() + 600];
    set_transient('session', $session, 600);

    $first = $relay->submit($id, 'bricks.read', [], $session, 'session');
    // Another request can write a negative cache entry AFTER reserve invalidated it.
    $cached[$key] = false;
    check(($relay->poll($id)['command']['id'] ?? null) === $first['commandId'], 'A stale negative cache hides a queued command.');
    $cached[$key . '_claimed_' . $first['commandId']] = false;
    check($relay->poll($id)['command'] === null, 'A stale negative claim cache replays a command.');
    check($relay->complete($id, $first['commandId'], ['ok' => true])['accepted'], 'A stale negative cache rejects completion.');
    check($relay->result($first['commandId'], 'session')['ok'], 'Completed result unavailable.');

    // Expired, never-delivered work is settled without running it or losing edits.
    $expired = $relay->submit($id, 'bricks.run', ['code' => 'return 1'], $session, 'session');
    $options[$key]['expiresAt'] = time() - 1;
    $cached[$key] = false;
    check($relay->poll($id)['command'] === null, 'Expired hidden command was executed.');
    check(!$relay->result($expired['commandId'], 'session')['ok'], 'Expired command did not settle.');
    check(!isset($options[$key]), 'Expired command still blocks the mailbox.');

    $next = $relay->submit($id, 'bricks.read', [], $session, 'session');
    $old = $options[$key];
    check($relay->complete($id, $next['commandId'], ['ok' => true])['accepted'], 'Read did not complete.');
    // A stale positive cache must not recreate/replay an already completed command.
    $cached[$key] = $old;
    $cached[$key . '_claimed_' . $next['commandId']] = false;
    check($relay->poll($id)['command'] === null, 'Stale positive cache replayed completed work.');
    $new = $relay->submit($id, 'bricks.save', [], $session, 'session');
    check(!$relay->complete($id, $next['commandId'], ['ok' => true])['accepted'], 'Late completion removed newer work.');
    check($options[$key]['id'] === $new['commandId'], 'Newer mailbox lost.');
    $cached[$key . '_claimed_' . $new['commandId']] = 'stale-positive';
    check($relay->poll($id)['command']['id'] === $new['commandId'], 'Stale cache blocked the following command.');
    $cached[$key] = false;
    $cached[$key . '_claimed_' . $new['commandId']] = false;
    $relay->register(12, $id);
    check(!$relay->result($new['commandId'], 'session')['ok'], 'Reload lost an uncertain claimed command behind stale cache.');
    $wpdb->failRead = true;
    try {
        $relay->poll($id);
        throw new \LogicException('Failed SQL read was treated as an empty mailbox.');
    } catch (\RuntimeException $error) {
        check($error->getMessage() === 'The live builder mailbox could not be read.', 'Unexpected read failure.');
    }
    echo "Canvas mailbox ignores stale negative/positive caches, settles expiry and never replays work.\n";
}
