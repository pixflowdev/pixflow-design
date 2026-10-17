import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function convertSource(html: string, sourceId: string): Record<string, any> {
  const directory = mkdtempSync(join(tmpdir(), 'pixflow-build-in-bricks-compat-'));
  tempDirectories.push(directory);
  const htmlFile = join(directory, 'index.html');
  writeFileSync(htmlFile, html);
  const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const { buildPixflowStageBHtmlBaseline } = await import(${JSON.stringify(bridgeModuleUrl)}); const result = await buildPixflowStageBHtmlBaseline({ htmlFile: ${JSON.stringify(htmlFile)}, plan: { sourceId: ${JSON.stringify(sourceId)}, title: 'HTML-first compatibility', conversionProfile: 'uploaded_html', conversionPolicy: { conversionProfile: 'uploaded_html' } } }); process.stdout.write(JSON.stringify(result));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function convertModernSource(): Record<string, any> {
  return convertSource(`<!doctype html><html><head><style>
    :root { --site-accent: #d65a31; }
    .editorial { display: grid; grid-template-columns: 1.3fr .7fr; gap: clamp(1rem, 3vw, 4rem); position: relative; }
    .editorial__visual { display: flex; position: sticky; top: 2rem; aspect-ratio: 4 / 3; background: linear-gradient(135deg, var(--site-accent), #111); clip-path: inset(0 round 18px); }
    .editorial__visual::before { content: ""; position: absolute; inset: -1rem; mask-image: radial-gradient(#000, transparent); }
    .editorial__item:nth-child(2) { transform: rotate(-3deg); }
    @media (max-width: 991px) { .editorial { grid-template-columns: 1fr; } .editorial__visual { position: relative; top: auto; } }
    @container (max-width: 700px) { .editorial__item { padding: 1rem; } }
    @keyframes editorial-pulse { from { opacity: .7; } to { opacity: 1; } }
    .editorial__item { animation: editorial-pulse 1s ease-in-out infinite; }
  </style></head><body><main><section class="editorial"><article class="editorial__item"><h1>Editorial</h1><p>Normal web source.</p></article><div class="editorial__visual" aria-hidden="true"></div></section></main><script>document.querySelector('.editorial')?.addEventListener('click', () => {});</script></body></html>`, 'build-in-bricks-compat');
}

describe('Build in Bricks HTML-first converter compatibility', () => {
  it('preserves modern web source through native controls or scoped/page CSS fallback', () => {
    const baseline = convertModernSource();
    const css = [
      baseline.pageSettings?.customCss || '',
      baseline.content?.map((item: Record<string, any>) => item.settings?._cssCustom || '').join('\n') || '',
      baseline.globalClasses?.map((item: Record<string, any>) => item.settings?._cssCustom || '').join('\n') || '',
    ].join('\n');
    expect(baseline.styleOwnershipReport).toMatchObject({ ok: true, silentLossCount: 0 });
    expect(css).toContain('clip-path');
    expect(css).toContain('mask-image');
    expect(css).toContain('@keyframes editorial-pulse');
    expect(css).toContain('@container');
    expect(css).toContain('nth-child');
    expect(baseline.content.some((item: Record<string, any>) => item.name === 'section')).toBe(true);
  });

  it('consumes historical inline head CSS and body rules as page-level conversion input', () => {
    const baseline = convertSource(
      '<!doctype html><html><head><style>body { color: #123456; background-color: #abcdef; }</style></head><body><main><section>Legacy</section></main></body></html>',
      'historical-shell-semantics',
    );
    expect(baseline.themeStylePayload.ownership.declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: 'body', property: 'color', value: '#123456' }),
      expect.objectContaining({ selector: 'body', property: 'background-color', value: '#abcdef' }),
    ]));
    expect(baseline.styleOwnershipReport).toMatchObject({ ok: true, silentLossCount: 0 });
  });
});
