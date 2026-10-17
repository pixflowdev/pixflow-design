import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const servicePath = resolve(repoRoot, 'wordpress/src/Media/MediaLibraryService.php');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runScenario(body: string): Record<string, unknown> {
  const directory = mkdtempSync(resolve(tmpdir(), 'pixflow-media-content-'));
  temporaryDirectories.push(directory);
  const script = resolve(directory, 'scenario.php');
  const phpServicePath = servicePath.replaceAll('\\', '/').replaceAll("'", "\\'");
  writeFileSync(script, `<?php
define('ABSPATH', __DIR__);
class WP_Error {
  public function __construct(private string $code, private string $message, private array $data = []) {}
  public function get_error_code() { return $this->code; }
  public function get_error_message() { return $this->message; }
  public function get_error_data() { return $this->data; }
}
$attachment_file = '';
function get_post_type($id) { return $id === 321 ? 'attachment' : null; }
function current_user_can($cap, $id) { return $cap === 'read_post' && $id === 321; }
function get_attached_file($id) { global $attachment_file; return $attachment_file; }
function get_post_mime_type($id) { return 'text/html'; }
function sanitize_file_name($value) { return (string) $value; }
function sanitize_mime_type($value) { return (string) $value; }
require '${phpServicePath}';
use PixflowDesign\\WordPress\\Media\\MediaLibraryService;
$service = new MediaLibraryService();
${body}
`, 'utf8');
  return JSON.parse(execFileSync('php', [script], { encoding: 'utf8' })) as Record<string, unknown>;
}

describe('WordPress attachment content service', () => {
  it('reads Unicode-named HTML attachments through PHP instead of the static web server', () => {
    const result = runScenario(`
$attachment_file = __DIR__ . '/Billow-⋅-Run-on-facts.html';
$content = '<!doctype html><title>Billow</title>';
file_put_contents($attachment_file, $content);
$result = $service->read_attachment_content(321);
echo json_encode($result);
`);

    expect(result).toEqual(expect.objectContaining({
      filename: 'Billow-⋅-Run-on-facts.html',
      mimeType: 'text/html',
      contentBase64: Buffer.from('<!doctype html><title>Billow</title>').toString('base64'),
      sizeBytes: 36,
    }));
  });
});
