<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('DB_ENGINE', 'sqlite');
define('ARRAY_A', 'ARRAY_A');

function sanitize_text_field($value): string { return trim((string) $value); }
function sanitize_key($value): string { return preg_replace('/[^a-z0-9_-]/', '', strtolower((string) $value)) ?: ''; }
function sanitize_title($value): string { return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower((string) $value)) ?: '', '-'); }
function get_current_user_id(): int { return 7; }
function home_url(): string { return 'http://127.0.0.1:8088'; }
function untrailingslashit($value): string { return rtrim((string) $value, '/'); }
function wp_generate_uuid4(): string { return '8584f3f8-a0d3-42b3-b975-acd490da9524'; }
function wp_json_encode($value): string { return json_encode($value, JSON_THROW_ON_ERROR); }

final class SqliteProjectWpdbStub
{
    public string $prefix = 'wp_';
    public int $insert_id = 0;

    public function insert(string $table, array $data, array $formats): bool
    {
        throw new RuntimeException('The translated wpdb insert path must not be used for SQLite project rows.');
    }

    public function prepare(string $query, ...$values): string
    {
        return str_replace('%d', (string) ((int) ($values[0] ?? 0)), $query);
    }

    public function get_row(string $query, string $format): ?array
    {
        global $project_test_pdo;
        $statement = $project_test_pdo->query($query);
        $row = $statement ? $statement->fetch(PDO::FETCH_ASSOC) : false;
        return is_array($row) ? $row : null;
    }
}

$project_test_pdo = new PDO('sqlite::memory:');
$project_test_pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$project_test_pdo->exec(<<<'SQL'
CREATE TABLE wp_pixflow_design_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'project',
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    owner_user_id INTEGER,
    site_url_hash TEXT NOT NULL,
    source_bridge_id TEXT,
    parent_project_id INTEGER,
    current_version_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    visibility TEXT NOT NULL DEFAULT 'site',
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT
)
SQL);

$GLOBALS['wpdb'] = new SqliteProjectWpdbStub();
$GLOBALS['@pdo'] = $project_test_pdo;

require_once dirname(__DIR__) . '/src/Database/Table.php';
require_once dirname(__DIR__) . '/src/Projects/ProjectRepository.php';

$repository = new PixflowDesign\WordPress\Projects\ProjectRepository();
$project = $repository->create([
    'title' => 'SQLite HTML to Bricks handoff',
    'kind' => 'prototype',
    'metadata' => ['pixflowHtmlToBricks' => true],
]);

if (($project['uuid'] ?? '') !== '8584f3f8-a0d3-42b3-b975-acd490da9524') {
    fwrite(STDERR, "SQLite project creation did not preserve the UUID.\n");
    exit(1);
}
if (($project['title'] ?? '') !== 'SQLite HTML to Bricks handoff') {
    fwrite(STDERR, "SQLite project creation did not preserve the project title.\n");
    exit(1);
}
if (($project['metadata']['pixflowHtmlToBricks'] ?? false) !== true) {
    fwrite(STDERR, "SQLite project creation did not preserve project metadata.\n");
    exit(1);
}

echo "project-repository-sqlite: ok\n";
