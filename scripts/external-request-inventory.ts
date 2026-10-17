/** Read-only inventory. Literal URLs are candidates, not proof of a network request.
 * Includes untracked source additions; excludes generated/private runtime data.
 * Run: pnpm exec tsx scripts/external-request-inventory.ts > .tmp/urls.json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\0'))].filter(file =>
  /^(?:apps|packages|tools|scripts|wordpress|wordpress-pro|plugins|skills|design-templates|design-systems|prompt-templates|data|\.github)\//.test(file)
  && /\.(?:[cm]?js|tsx?|php|json|ya?ml|html|css|astro|md|sh|ps1|toml)$/.test(file)
  && !/(?:^|\/)(?:node_modules|vendor|dist|build|\.next|\.tmp|tests|test|__tests__)\/|assets\/app\/|pnpm-lock|package-lock|\.lock\.yml$|\.test\.|\.spec\./.test(file)
  && existsSync(file),
).sort();

type Reference = { file: string; line: number; kind: 'documentation' | 'resource' | 'source'; url: string };
const hosts = new Map<string, Reference[]>();
const requests: { file: string; line: number; operation: string }[] = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const kind = file.endsWith('.md') ? 'documentation' : /^(plugins|skills|design-templates|design-systems|prompt-templates|data)\//.test(file) ? 'resource' : 'source';
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    for (const match of line.matchAll(/https?:\/\/[^\s"'`<>\\)]+/g)) {
      let url: URL;
      try { url = new URL(match[0]); } catch { continue; }
      if (!url.hostname.includes('.') || url.username || url.password) continue;
      // Source query strings can contain tokens. Keep the origin/path only.
      url.search = ''; url.hash = '';
      const references = hosts.get(url.hostname) ?? [];
      references.push({ file, line: index + 1, kind, url: url.toString() });
      hosts.set(url.hostname, references);
    }
    // Record dynamic request construction too, without copying body/auth data.
    if (kind === 'source') {
      for (const match of line.matchAll(/\b(fetch|wp_(?:safe_)?remote_(?:get|post|request)|download_url|sendBeacon|WebSocket|EventSource|XMLHttpRequest|https?\.request|https?\.get)\s*\(/g)) {
        requests.push({ file, line: index + 1, operation: match[1]! });
      }
    }
  }
}
const bakeManifestPath = 'data/plugin-previews/manifest.json';
const bakedPreviews = existsSync(bakeManifestPath)
  ? Object.entries((JSON.parse(readFileSync(bakeManifestPath, 'utf8')) as { previews?: Record<string, { video?: string; poster?: string }> }).previews ?? {}).map(([id, value]) => ({ id, video: value.video, poster: value.poster }))
  : [];
console.log(JSON.stringify({
  note: 'Static inventory only. Documentation, schemas, example URLs and localhost are not necessarily requests. Dynamic endpoints require call-site review. Query strings are omitted.',
  filesScanned: files.length,
  hosts: [...hosts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([host, references]) => ({ host, references })),
  requestCallSites: requests,
  bakedPreviews,
}, null, 2));
