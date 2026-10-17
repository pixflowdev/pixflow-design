<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Projects;

if (!defined('ABSPATH')) {
    exit;
}

final class ProjectService
{
    public function __construct(
        private readonly ProjectRepository $projects = new ProjectRepository(),
        private readonly ProjectVersionRepository $versions = new ProjectVersionRepository(),
        private readonly ProjectContextRepository $contexts = new ProjectContextRepository(),
        private readonly ProjectAccessRepository $access = new ProjectAccessRepository(),
        private readonly ProjectLockRepository $locks = new ProjectLockRepository(),
        private readonly ProjectPermission $permissions = new ProjectPermission(),
        private readonly ProjectStorage $storage = new ProjectStorage(),
        private readonly ProjectArchive $archive = new ProjectArchive(),
        private readonly ProjectManifest $manifest = new ProjectManifest(),
    ) {
    }

    public function list(array $args = []): array
    {
        if (!$this->permissions->can_list()) {
            return $this->failure('forbidden', 'You do not have permission to list Pixflow projects.', 403);
        }

        return [
            'ok' => true,
            'projects' => array_values(array_map([$this, 'with_related_summary'], array_filter(
                $this->projects->list($args), [$this->permissions, 'can_view']
            ))),
        ];
    }

    public function create(array $input): array
    {
        $project = $this->projects->create($input);
        if ($project === []) {
            return $this->failure('project_create_failed', 'Could not create the Pixflow project.');
        }

        $this->storage->ensure_project_dirs((string) $project['uuid']);
        $this->access->grant((int) $project['id'], (int) ($project['ownerUserId'] ?? get_current_user_id()), 'owner');

        if (is_array($input['context'] ?? null)) {
            $this->contexts->upsert((int) $project['id'], ProjectContext::from_input($input['context']));
        }

        return [
            'ok' => true,
            'project' => $this->with_related_summary($project),
        ];
    }

    public function detail(string $uuid): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_view($project)) {
            return $this->failure('forbidden', 'You do not have permission to view this Pixflow project.', 403);
        }

        return [
            'ok' => true,
            'project' => $this->with_related_summary($project),
            'versions' => array_map([$this, 'with_version_urls'], $this->versions->list_for_project((int) $project['id'], 50)),
        ];
    }

    public function delete_project(string $uuid): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_delete($project)) {
            return $this->failure('forbidden', 'You do not have permission to delete this Pixflow project.', 403);
        }

        $this->projects->mark_deleted((int) $project['id']);

        return ['ok' => true];
    }

    public function archive_project(string $uuid): array
    {
        return $this->delete_project($uuid);
    }

    public function prepare_version_paths(string $uuid, ?int $version_number = null, array $options = []): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_edit($project)) {
            return $this->failure('forbidden', 'You do not have permission to update this Pixflow project.', 403);
        }

        $conflict = $this->version_conflict_for((int) $project['id'], $options);
        if ($conflict !== null) {
            return $conflict;
        }

        $lock_conflict = $this->lock_conflict_for((int) $project['id'], $options);
        if ($lock_conflict !== null) {
            return $lock_conflict;
        }

        $version_number = $version_number !== null
            ? max(1, $version_number)
            : $this->versions->next_version_number((int) $project['id']);

        if ($this->versions->find_by_project_version((int) $project['id'], $version_number) !== null) {
            return [
                'ok' => false,
                'code' => 'version_exists',
                'message' => 'This Pixflow project version already exists. Save as a new version instead.',
                'status' => 409,
                'latestVersion' => $this->versions->latest_for_project((int) $project['id']),
            ];
        }

        $this->storage->ensure_version_dir($uuid, $version_number);

        return [
            'ok' => true,
            'project' => $project,
            'versionNumber' => $version_number,
            'archivePath' => $this->archive->archive_path($uuid, $version_number),
            'manifestPath' => $this->archive->manifest_path($uuid, $version_number),
            'previewPath' => $this->archive->preview_path($uuid),
        ];
    }

    public function download_version(string $uuid, int $version_number = 0): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_view($project)) {
            return $this->failure('forbidden', 'You do not have permission to download this Pixflow project.', 403);
        }

        $version = $version_number > 0
            ? $this->versions->find_by_project_version((int) $project['id'], $version_number)
            : $this->versions->latest_for_project((int) $project['id']);

        if ($version === null) {
            return $this->failure('version_not_found', 'Pixflow project version was not found.', 404);
        }

        $archive_path = $this->storage->absolute_upload_path((string) $version['archivePath']);
        if (!is_readable($archive_path)) {
            return $this->failure('archive_not_found', 'Pixflow project archive was not found.', 404);
        }

        return [
            'ok' => true,
            'project' => $project,
            'version' => $version,
            'path' => $archive_path,
            'filename' => sanitize_file_name((string) $project['slug'] . '-v' . (int) $version['versionNumber'] . '.zip'),
            'sizeBytes' => $this->archive->file_size($archive_path),
        ];
    }

    public function record_version(string $uuid, array $input): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_edit($project)) {
            return $this->failure('forbidden', 'You do not have permission to update this Pixflow project.', 403);
        }

        $version = $this->versions->create((int) $project['id'], [
            'version_number' => $input['version_number'] ?? null,
            'archive_path' => $this->stored_upload_path((string) ($input['archive_path'] ?? '')),
            'manifest_path' => $this->stored_upload_path((string) ($input['manifest_path'] ?? '')),
            'preview_path' => $this->stored_upload_path((string) ($input['preview_path'] ?? '')),
            'file_hash' => $input['file_hash'] ?? '',
            'size_bytes' => $input['size_bytes'] ?? 0,
            'summary' => $input['summary'] ?? '',
            'metadata' => is_array($input['metadata'] ?? null) ? $input['metadata'] : [],
        ]);

        if ($version === []) {
            return $this->failure('version_create_failed', 'Could not create the Pixflow project version.');
        }

        $this->projects->set_current_version((int) $project['id'], (int) $version['id']);
        $project = $this->projects->find((int) $project['id']) ?? $project;

        return [
            'ok' => true,
            'project' => $this->with_related_summary($project),
            'version' => $this->with_version_urls($version),
        ];
    }

    public function manifest_for(string $uuid, int $version_id = 0): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_view($project)) {
            return $this->failure('forbidden', 'You do not have permission to view this Pixflow project.', 403);
        }

        $version = $version_id > 0
            ? $this->versions->find($version_id)
            : $this->versions->latest_for_project((int) $project['id']);
        if ($version_id > 0 && ($version === null || (int) ($version['projectId'] ?? 0) !== (int) $project['id'])) {
            return $this->failure('version_not_found', 'Project version was not found.', 404);
        }
        $context = $this->contexts->find_by_project((int) $project['id']) ?? [];

        return [
            'ok' => true,
            'manifest' => $this->manifest->build($project, $version ?? [], $context),
        ];
    }

    public function lock_status(string $uuid): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_view($project)) {
            return $this->failure('forbidden', 'You do not have permission to view this Pixflow project.', 403);
        }

        return [
            'ok' => true,
            'lock' => $this->active_lock_for((int) $project['id']),
        ];
    }

    public function acquire_lock(string $uuid, array $input): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_edit($project)) {
            return $this->failure('forbidden', 'You do not have permission to lock this Pixflow project.', 403);
        }

        $session_id = sanitize_text_field((string) ($input['sessionId'] ?? $input['session_id'] ?? ''));
        if ($session_id === '') {
            return $this->failure('invalid_session', 'A lock session id is required.');
        }

        $current = $this->active_lock_for((int) $project['id']);
        if (
            is_array($current)
            && (int) ($current['userId'] ?? 0) !== get_current_user_id()
            && (string) ($current['sessionId'] ?? '') !== $session_id
        ) {
            return [
                'ok' => false,
                'code' => 'project_locked',
                'message' => 'This Pixflow project is already open by another user.',
                'status' => 409,
                'lock' => $current,
            ];
        }

        return [
            'ok' => true,
            'lock' => $this->locks->acquire(
                (int) $project['id'],
                $session_id,
                min(900, max(60, (int) ($input['ttlSeconds'] ?? $input['ttl_seconds'] ?? 180))),
                is_array($input['metadata'] ?? null) ? $input['metadata'] : []
            ),
        ];
    }

    public function release_lock(string $uuid, array $input): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_edit($project)) {
            return $this->failure('forbidden', 'You do not have permission to release this Pixflow project lock.', 403);
        }

        $session_id = sanitize_text_field((string) ($input['sessionId'] ?? $input['session_id'] ?? ''));
        if ($session_id === '') {
            return $this->failure('invalid_session', 'A lock session id is required.');
        }

        $this->locks->release((int) $project['id'], $session_id);

        return ['ok' => true];
    }

    public function grant_access(string $uuid, int $user_id, string $role): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_edit($project)) {
            return $this->failure('forbidden', 'You do not have permission to manage project access.', 403);
        }

        if ($user_id <= 0 || get_user_by('id', $user_id) === false) {
            return $this->failure('invalid_user', 'A valid WordPress user is required.');
        }

        return [
            'ok' => true,
            'access' => $this->access->grant((int) $project['id'], $user_id, $role),
        ];
    }

    public function revoke_access(string $uuid, int $user_id): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null) {
            return $this->failure('project_not_found', 'Pixflow project was not found.', 404);
        }

        if (!$this->permissions->can_edit($project)) {
            return $this->failure('forbidden', 'You do not have permission to manage project access.', 403);
        }

        $this->access->revoke((int) $project['id'], $user_id);

        return ['ok' => true];
    }

    private function with_related_summary(array $project): array
    {
        $latest = $this->versions->latest_for_project((int) $project['id']);
        $context = $this->contexts->find_by_project((int) $project['id']);
        $access = $this->access->list_for_project((int) $project['id']);

        $project['latestVersion'] = $latest ? $this->with_version_urls($latest) : null;
        $project['context'] = $context;
        $project['access'] = $access;
        $project['lock'] = $this->active_lock_for((int) $project['id']);
        $project['canEdit'] = $this->permissions->can_edit($project);
        $project['canDelete'] = $this->permissions->can_delete($project);

        return $project;
    }

    private function active_lock_for(int $project_id): ?array
    {
        $this->locks->purge_expired();
        $lock = $this->locks->find_for_project($project_id);

        return $lock !== null && !$this->locks->is_expired($lock) ? $lock : null;
    }

    private function version_conflict_for(int $project_id, array $options): ?array
    {
        if (($options['save_as_new_version'] ?? $options['saveAsNewVersion'] ?? false) === true) {
            return null;
        }

        $latest = $this->versions->latest_for_project($project_id);
        if ($latest === null) {
            return null;
        }

        $expected_version = $this->optional_positive_int($options['expected_version_number'] ?? $options['expectedVersionNumber'] ?? null);
        $expected_hash = sanitize_text_field((string) ($options['expected_file_hash'] ?? $options['expectedFileHash'] ?? ''));

        if ($expected_version === null && $expected_hash === '') {
            return null;
        }

        $version_matches = $expected_version === null || $expected_version === (int) $latest['versionNumber'];
        $hash_matches = $expected_hash === '' || hash_equals((string) ($latest['fileHash'] ?? ''), $expected_hash);
        if ($version_matches && $hash_matches) {
            return null;
        }

        return [
            'ok' => false,
            'code' => 'remote_changed',
            'message' => 'This shared Pixflow project changed after your local copy was opened.',
            'status' => 409,
            'latestVersion' => $this->with_version_urls($latest),
            'resolution' => [
                'openLatest' => true,
                'saveAsNewVersion' => true,
                'keepLocalCopy' => true,
            ],
        ];
    }

    private function lock_conflict_for(int $project_id, array $options): ?array
    {
        $lock = $this->active_lock_for($project_id);
        if ($lock === null) {
            return null;
        }

        $session_id = sanitize_text_field((string) ($options['lock_session_id'] ?? $options['lockSessionId'] ?? ''));
        $same_session = $session_id !== '' && hash_equals((string) ($lock['sessionId'] ?? ''), $session_id);
        $same_user = (int) ($lock['userId'] ?? 0) === get_current_user_id();
        if ($same_session || ($session_id === '' && $same_user)) {
            return null;
        }

        return [
            'ok' => false,
            'code' => 'project_locked',
            'message' => 'This shared Pixflow project is currently open by another user or browser session.',
            'status' => 409,
            'lock' => $lock,
        ];
    }

    private function optional_positive_int(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        return max(1, (int) $value);
    }

    private function with_version_urls(array $version): array
    {
        foreach (['archivePath', 'manifestPath', 'previewPath'] as $key) {
            $path = (string) ($version[$key] ?? '');
            try {
                $version[$key . 'Url'] = $path !== '' ? $this->storage->upload_url($path) : '';
            } catch (\InvalidArgumentException) {
                $version[$key . 'Url'] = '';
            }
        }

        return $version;
    }

    private function stored_upload_path(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            return '';
        }

        $relative = $this->storage->relative_upload_path($path);

        if ($relative === '') throw new \InvalidArgumentException('Version files must belong to private project storage.');
        return $relative;
    }

    /** Only deliver files belonging to a project the current user can view. */
    public function stored_file(string $uuid, string $relative): array
    {
        $project = $this->projects->find_by_uuid($uuid);
        if ($project === null || !$this->permissions->can_view($project)) {
            return $this->failure('project_not_found', 'Project file was not found.', 404);
        }
        try {
            $path = $this->storage->absolute_upload_path('pixflow-design/projects/' . $uuid . '/' . $relative);
        } catch (\InvalidArgumentException | \RuntimeException) {
            return $this->failure('project_file_not_found', 'Project file was not found.', 404);
        }
        if (!is_file($path) || !is_readable($path)) return $this->failure('project_file_not_found', 'Project file was not found.', 404);
        return ['ok' => true, 'path' => $path, 'filename' => basename($path), 'sizeBytes' => filesize($path)];
    }

    private function failure(string $code, string $message, int $status = 400): array
    {
        return [
            'ok' => false,
            'code' => $code,
            'message' => $message,
            'status' => $status,
        ];
    }
}
