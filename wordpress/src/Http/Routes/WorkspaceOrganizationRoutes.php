<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Http\Routes;

use PixflowDesign\WordPress\Modules\WorkspaceAccess;
use PixflowDesign\WordPress\Projects\ProjectPermission;
use PixflowDesign\WordPress\Projects\ProjectRepository;

if (!defined('ABSPATH')) exit;

/** Per-user, per-site navigation metadata. No chat content or credentials are copied here. */
final class WorkspaceOrganizationRoutes
{
    public function register(): void
    {
        register_rest_route('pixflow-design/v1', '/od/workspace-organization', [
            ['methods' => 'GET', 'callback' => [$this, 'read'], 'permission_callback' => [$this, 'allowed']],
            ['methods' => 'POST', 'callback' => [$this, 'mutate'], 'permission_callback' => [$this, 'allowed']],
        ]);
    }

    public function allowed(): bool
    {
        return get_current_user_id() > 0 && current_user_can('edit_posts') && WorkspaceAccess::available();
    }

    private function key(): string { return '_pixflow_workspace_organization_' . get_current_user_id(); }
    public static function empty_state(): array { return ['revision' => 0, 'projects' => [], 'chats' => [], 'sidebarCollapsed' => false]; }

    public function read(): \WP_REST_Response
    {
        return $this->response(get_option($this->key(), self::empty_state()));
    }

    private function response(array $state): \WP_REST_Response
    {
        $state['chats'] = (object) $state['chats'];
        return new \WP_REST_Response($state, 200, ['Cache-Control' => 'no-store']);
    }

    public function mutate(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $body = $request->get_json_params();
        if (!is_array($body) || !isset($body['revision']) || !is_int($body['revision']) || $body['revision'] < 0) return self::error('Invalid revision.');
        $key = $this->key();
        $previous = get_option($key, false);
        $state = is_array($previous) ? $previous : self::empty_state();
        if ($body['revision'] !== $state['revision']) return self::error('Workspace changed. Refresh and try again.', 409);
        $next = self::apply($state, $body['action'] ?? null, static function (string $id): bool {
            $chat = (new ProjectRepository())->find_by_uuid($id);
            return $chat !== null && !in_array($chat['status'] ?? '', ['deleted', 'archived'], true) && (new ProjectPermission())->can_view($chat);
        });
        if ($next instanceof \WP_Error) return $next;
        if ($previous === false) {
            // options has a unique key: simultaneous first writes cannot create duplicate user records.
            if (!add_option($key, $next, '', false)) return self::error('Workspace changed. Refresh and try again.', 409);
        } else {
            global $wpdb;
            // Compare-and-swap protects independent tabs without overwriting unrelated settings.
            $changed = $wpdb->update($wpdb->options, ['option_value' => maybe_serialize($next)], ['option_name' => $key, 'option_value' => maybe_serialize($previous)], ['%s'], ['%s', '%s']);
            wp_cache_delete($key, 'options');
            if ($changed !== 1) return self::error('Workspace changed. Refresh and try again.', 409);
        }
        return $this->response($next);
    }

    private static function valid_id(mixed $id): bool
    {
        return is_string($id) && preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/D', $id) === 1 && !in_array($id, ['constructor', 'prototype', '__proto__'], true);
    }
    private static function error(string $message, int $status = 400): \WP_Error { return new \WP_Error('pixflow_workspace_organization', $message, ['status' => $status]); }

    /** A deleted organizational group releases chats; it never deletes their data. */
    public static function apply(array $state, mixed $action, callable $can_view_chat): array|\WP_Error
    {
        if (!is_array($action) || !is_string($action['type'] ?? null)) return self::error('Invalid organization action.');
        $type = $action['type'];
        if ($type === 'collapse-section') {
            if (!in_array($action['section'] ?? null, ['pinned', 'projects', 'chats'], true) || !is_bool($action['collapsed'] ?? null)) return self::error('Invalid section state.');
            $state['collapsedSections'][$action['section']] = $action['collapsed'];
        } elseif ($type === 'collapse-sidebar') {
            if (!is_bool($action['collapsed'] ?? null)) return self::error('Invalid collapsed state.');
            $state['sidebarCollapsed'] = $action['collapsed'];
        } elseif (in_array($type, ['move-chat', 'pin-chat'], true)) {
            $id = $action['chatId'] ?? null;
            if (!self::valid_id($id) || !$can_view_chat($id)) return self::error('Chat not found.', 404);
            $chat = $state['chats'][$id] ?? ['projectId' => null, 'pinned' => false];
            if ($type === 'pin-chat') {
                if (!is_bool($action['pinned'] ?? null)) return self::error('Invalid pinned state.');
                $chat['pinned'] = $action['pinned'];
            } else {
                if (!array_key_exists('projectId', $action)) return self::error('Invalid project ID.');
                $project_id = $action['projectId'];
                if ($project_id !== null && (!self::valid_id($project_id) || !in_array($project_id, array_column($state['projects'], 'id'), true))) return self::error('Project not found.', 404);
                $chat['projectId'] = $project_id;
            }
            if (!$chat['pinned'] && $chat['projectId'] === null) unset($state['chats'][$id]);
            else $state['chats'][$id] = $chat;
            if (count($state['chats']) > 10000) return self::error('Workspace organization limit reached.');
        } else {
            $id = $action['id'] ?? null;
            if (!self::valid_id($id)) return self::error('Invalid project ID.');
            $index = array_search($id, array_column($state['projects'], 'id'), true);
            if ($type === 'create-project' || $type === 'rename-project') {
                $name = $action['name'] ?? null;
                if (!is_string($name) || trim($name) === '' || strlen(trim($name)) > 400 || preg_match('/[\x00-\x1f\x7f]/', $name)) return self::error('Project name must contain 1–100 characters.');
                $name = trim($name);
                if (preg_match_all('/./us', $name) > 100) return self::error('Project name must contain 1–100 characters.');
                if ($type === 'create-project') {
                    if ($index !== false) return self::error('Project already exists.', 409);
                    if (count($state['projects']) >= 200) return self::error('Project limit reached.');
                    $state['projects'][] = ['id' => $id, 'name' => $name, 'pinned' => false, 'collapsed' => false];
                } else {
                    if ($index === false) return self::error('Project not found.', 404);
                    $state['projects'][$index]['name'] = $name;
                }
            } else {
                if ($index === false) return self::error('Project not found.', 404);
                if ($type === 'delete-project') {
                    array_splice($state['projects'], $index, 1);
                    foreach ($state['chats'] as &$chat) if ($chat['projectId'] === $id) $chat['projectId'] = null;
                    unset($chat);
                } elseif ($type === 'pin-project' || $type === 'collapse-project') {
                    $field = $type === 'pin-project' ? 'pinned' : 'collapsed';
                    if (!is_bool($action[$field] ?? null)) return self::error('Invalid ' . $field . ' state.');
                    $state['projects'][$index][$field] = $action[$field];
                } else return self::error('Unknown organization action.');
            }
        }
        $state['revision']++;
        return $state;
    }
}
