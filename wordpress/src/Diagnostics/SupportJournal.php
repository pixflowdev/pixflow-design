<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Diagnostics;

use PixflowDesign\WordPress\Storage\PrivateDirectory;
if (!defined('ABSPATH')) exit;

/** Independent of WP_DEBUG. Only fixed categories, timestamps and numeric HTTP status reach disk. */
final class SupportJournal
{
    private const LIMIT = 128;
    private const AGE = 604800;
    private const AREAS = ['licence','bridge','claude','builder','tools','browser','php'];
    private const EVENTS = ['request-failed','verification-failed','transport-failed','access-denied','rest-error',
        'status-html','status-other','site-mismatch','disconnected','update-required','error','warning','fatal','recovered'];
    private static array $directories = [];

    public static function register(): void
    {
        add_filter('rest_post_dispatch', static function ($result, $server, $request) {
            if (!get_current_user_id() || !preg_match('~^/(?:pixflow-design|pixflow-ai|pixflow-design-pro)/v1/([^/]+)~', $request->get_route(), $match)
                || $match[1] === 'diagnostics' || !is_callable([$result, 'get_status'])) return $result;
            $status = $result->get_status();
            $data = $result->get_data();
            if ($status >= 400 || (is_array($data) && (($data['ok'] ?? null) === false || ($data['accepted'] ?? null) === false))) {
                $area = match ($match[1]) {
                    'license' => 'licence', 'bridge','bridge-pair' => 'bridge',
                    'bricks','etch','gutenberg','elementor','builder','editor' => 'builder', default => 'tools',
                };
                $tool = $request->get_param('tool');
                $operation = is_string($tool) && preg_match('~^(?:bricks|etch|elementor|gutenberg)\.(?:context|canvases|result|read|mutate|select|refresh|undo|redo|save|run)$~D', $tool) ? $tool : '';
                $code = is_array($data) && is_string($data['code'] ?? null) ? $data['code'] : '';
                self::record($operation ? 'builder' : $area, 'rest-error', $status, $code, $operation);
            }
            return $result;
        }, 10, 3);
        register_shutdown_function(static function () {
            $err = error_get_last();
            if ($err && in_array($err['type'], [E_ERROR,E_PARSE,E_CORE_ERROR,E_COMPILE_ERROR,E_USER_ERROR,E_RECOVERABLE_ERROR], true)
                && self::owned_file((string) $err['file'])) self::record('php', 'fatal', 0, '', '', basename($err['file']), (int) $err['line']);
        });
    }

    public static function owned_file(string $path): bool
    {
        $path = str_replace('\\', '/', $path);
        if (str_contains($path, '/../') || str_contains($path, "\0")) return false;
        foreach ([dirname(__DIR__, 2), defined('PIXFLOW_DESIGN_PRO_PLUGIN_DIR') ? PIXFLOW_DESIGN_PRO_PLUGIN_DIR : null] as $root) {
            if ($root && str_starts_with($path, rtrim(str_replace('\\', '/', $root), '/') . '/')) return true;
        }
        return false;
    }

    public static function record(string $area, string $event, int $http = 0, string $check = '', string $operation = '', string $file = '', int $line = 0): void
    {
        if (!in_array($area, self::AREAS, true) || !in_array($event, self::EVENTS, true) || $http < 0 || $http > 599) return;
        $entry = ['at'=>time(), 'area'=>$area, 'event'=>$event, 'http'=>$http];
        if (in_array($area, ['browser','php'], true) && preg_match('~^[a-zA-Z0-9._-]{1,96}\.(?:php|m?js)$~D', $file)) {
            $entry['file'] = $file;
            if ($line > 0 && $line <= 10000000) $entry['line'] = $line;
        }
        if (in_array($operation, ['licence-status','licence-features','licence-validate','licence-reset','bridge-connection','claude-status','claude-start','claude-cancel','claude-open-browser','claude-code','license_reset','license_revoked','site_deactivated','license_expired','user_suspended','invalid_challenge','installation_key_unavailable','license_authority_mismatch'], true)
            || ($area === 'builder' && preg_match('~^(?:bricks|etch|elementor|gutenberg)\.(?:context|canvases|result|read|mutate|select|refresh|undo|redo|save|run)$~D', $operation))) $entry['operation'] = $operation;
        if (preg_match('~^(?:(?:wordpress|bridge):(?:token_format|signing_key|signature|claims_format|claim_(?:iss|aud|installation_id|site_fingerprint|license_id)|subject_key_or_scope|grant_window_or_revision|installation_site|saved_licence_binding|token_missing|token_storage)|challenge:unusable|authority:unreadable_response)$~D', $check)) $entry['check'] = $check;
        if (in_array($check, ['canvas_busy','canvas_error','builder_unavailable','site_tool_error','pixflow_pro_required','rest_cookie_invalid_nonce'], true)) $entry['check'] = $check;
        self::access($entry);
    }

    public static function snapshot(): array { return self::access(null); }

    private static function access(?array $entry): array
    {
        $file = null;
        try {
            $site = get_current_blog_id();
            $directory = self::$directories[$site] ??= new PrivateDirectory('diagnostics', 'pixflow_design_private_diagnostics_root', 'PIXFLOW_DESIGN_PRIVATE_DIAGNOSTICS_DIR');
            $binding = substr(hash('sha256', wp_normalize_path(ABSPATH) . '|' . $site), 0, 16);
            $path = $directory->directory() . '/site-' . $site . '-' . $binding . '.json';
            if (is_link($path)) throw new \RuntimeException();
            if (is_link($path . '.lock')) throw new \RuntimeException();
            $file = @fopen($path . '.lock', 'c+b');
            if (!$file || !flock($file, LOCK_EX)) throw new \RuntimeException();
            $stored = is_file($path) ? json_decode((string) @file_get_contents($path, false, null, 0, 65536), true) : [];
            $rows = array_values(array_filter(is_array($stored) ? $stored : [], static fn($r) => is_array($r) && ($r['at'] ?? 0) >= time()-self::AGE));
            if ($entry !== null) {
                $last = end($rows);
                if ($last && $entry['at'] - $last['at'] < 60 && array_replace($last, ['at'=>$entry['at']]) === $entry) {
                    return ['available'=>true];
                }
                $rows[] = $entry;
                $rows = array_slice($rows, -self::LIMIT);
            }
            if ($rows !== $stored || !is_file($path)) {
                $bytes = json_encode($rows, JSON_THROW_ON_ERROR);
                $temp = $path . '.tmp';
                if (is_link($temp) || @file_put_contents($temp, $bytes) !== strlen($bytes)
                    || !@chmod($temp, 0600) || !@rename($temp, $path)) throw new \RuntimeException();
            }
            return ['available'=>true, 'retentionDays'=>7, 'maxEntries'=>self::LIMIT, 'entries'=>$rows];
        } catch (\Throwable) {
            return ['available'=>false, 'reason'=>'private-file-unavailable', 'entries'=>[]];
        } finally {
            if (is_resource($file)) fclose($file);
        }
    }
}
