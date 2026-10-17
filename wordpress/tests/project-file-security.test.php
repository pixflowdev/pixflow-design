<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Projects {
    class ProjectRepository { public function find_by_uuid(string $uuid): array { return ['id' => 1]; } }
    class ProjectPermission { public function can_edit(array $project): bool { return true; } public function can_view(array $project): bool { return true; } }
    class ProjectStorage { public function ensure_files_dir(string $uuid): string { return $GLOBALS['root']; } }
}
namespace {
define('ABSPATH', __DIR__);
class WP_Error { public function __construct(public string $code, public string $message = '', public mixed $data = null) {} }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
function sanitize_file_name(string $value): string { return trim($value, '. '); }
function wp_normalize_path(string $value): string { return str_replace('\\', '/', $value); }
function wp_mkdir_p(string $path): bool { return is_dir($path) || mkdir($path, 0700, true); }
require __DIR__ . '/../src/Projects/ProjectFileService.php';
$type = new ReflectionClass(PixflowDesign\WordPress\Projects\ProjectFileService::class);
$service = $type->newInstanceWithoutConstructor();
$root = sys_get_temp_dir() . '/pixflow-project-security-' . bin2hex(random_bytes(8)); mkdir($root);
$failures = []; $checks = 0;
function check(bool $ok, string $message): void { $GLOBALS['checks']++; if (!$ok) $GLOBALS['failures'][] = $message; }
try {
    foreach (['payload.php', 'payload.PHP8', 'payload.phtml', 'payload.phar', 'payload.php.jpg', 'folder.php/file.txt', '.htaccess', '.user.ini', 'web.config', 'payload.cgi', '../escape.txt', 'folder/../../escape.txt', 'payload.asp', 'payload.jsp', 'payload.shtml'] as $name) {
        $result = $type->getMethod('commit')->invoke($service, $root, $name, 'inert security fixture', null);
        check(is_wp_error($result), "$name must be rejected before writing");
    }
    foreach (['index.html', 'theme.css', 'script.js', 'data.json', 'README.md', 'assets/icon.svg', 'images/photo.webp'] as $name) {
        $result = $type->getMethod('commit')->invoke($service, $root, $name, 'inert preview fixture', null);
        check(!is_wp_error($result) && file_get_contents($root . '/' . $name) === 'inert preview fixture', "$name remains supported");
    }
    check($type->getMethod('safe_child_path')->invoke($service, $root, '../escape') === null, 'Child resolver independently rejects traversal');
    touch($root . '/README.md', 1700000000);
    clearstatcache();
    $record = $type->getMethod('file_record')->invoke($service, $root . '/README.md', 'README.md');
    check($record['mtime'] === 1700000000000, 'Workspace file dates use Unix milliseconds, matching the Bridge contract');
    $folder = $type->getMethod('folder_record')->invoke($service, $root, 'fixture');
    check($folder['mtime'] === filemtime($root) * 1000, 'Workspace folder dates use Unix milliseconds');
    $service = new PixflowDesign\WordPress\Projects\ProjectFileService();
    check(is_wp_error($service->write('fixture', ['name' => 'encoded.php', 'content' => base64_encode('inert fixture'), 'encoding' => 'base64'])), 'Base64 writes cannot bypass file policy');
    check(is_wp_error($service->rename('fixture', 'README.md', 'renamed.php')), 'Rename cannot create a server program');
    check(file_get_contents($root . '/README.md') === 'inert preview fixture', 'Rejected rename preserves original');
    check(!is_wp_error($service->rename('fixture', 'README.md', 'renamed.md')), 'Normal rename is preserved');
    check(is_wp_error($service->create_folder('fixture', 'folder.php')), 'Executable path-info directories are rejected');
    check(!is_wp_error($service->create_folder('fixture', 'assets/nested')), 'Normal folders remain available');
    // Existing files remain readable and removable: the audit does not erase content.
    file_put_contents($root . '/old.php', 'inert legacy file');
    check(!is_wp_error($service->read('fixture', 'old.php')), 'Legacy file remains available for export');
    check(!is_wp_error($service->delete('fixture', 'old.php')), 'Legacy file remains removable');
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($files as $file) { if ($file->isDir()) rmdir($file->getPathname()); else unlink($file->getPathname()); }
    rmdir($root);
}
if ($failures) { fwrite(STDERR, implode("\n", $failures) . "\n"); exit(1); }
echo "project-file-security: $checks checks passed\n";
}
