<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectPermission
{
    public function __construct(
        private readonly ProjectAccessRepository $access_repository = new ProjectAccessRepository(),
    ) {
    }

    public function can_list(int $user_id = 0): bool
    {
        $user_id = $user_id > 0 ? $user_id : get_current_user_id();

        return $user_id > 0 && current_user_can('edit_posts');
    }

    public function can_view(array $project, int $user_id = 0): bool
    {
        $user_id = $user_id > 0 ? $user_id : get_current_user_id();
        if ($user_id <= 0) {
            return false;
        }

        if (current_user_can('manage_options')) {
            return true;
        }

        if ((int) ($project['ownerUserId'] ?? 0) === $user_id) {
            return true;
        }

        if (($project['visibility'] ?? '') === 'site' && current_user_can('edit_posts')) {
            return true;
        }

        return $this->access_repository->find_for_user((int) ($project['id'] ?? 0), $user_id) !== null;
    }

    public function can_edit(array $project, int $user_id = 0): bool
    {
        $user_id = $user_id > 0 ? $user_id : get_current_user_id();
        if ($user_id <= 0) {
            return false;
        }

        if (current_user_can('manage_options')) {
            return true;
        }

        if ((int) ($project['ownerUserId'] ?? 0) === $user_id && current_user_can('edit_posts')) {
            return true;
        }

        $access = $this->access_repository->find_for_user((int) ($project['id'] ?? 0), $user_id);
        $role = (string) ($access['role'] ?? '');

        return in_array($role, ['owner', 'editor'], true) && current_user_can('edit_posts');
    }

    public function can_delete(array $project, int $user_id = 0): bool
    {
        $user_id = $user_id > 0 ? $user_id : get_current_user_id();

        return current_user_can('manage_options')
            || ((int) ($project['ownerUserId'] ?? 0) === $user_id && current_user_can('delete_posts'));
    }
}
