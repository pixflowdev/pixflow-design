import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function buildBaseline(html: string): Record<string, any> {
  const directory = mkdtempSync(join(tmpdir(), 'pixflow-class-lifecycle-'));
  temporaryDirectories.push(directory);
  const htmlFile = join(directory, 'index.html');
  writeFileSync(htmlFile, html);
  const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
  return JSON.parse(execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const { buildPixflowStageBHtmlBaseline } = await import(${JSON.stringify(bridgeModuleUrl)});
     const baseline = await buildPixflowStageBHtmlBaseline({
       htmlFile: ${JSON.stringify(htmlFile)},
       plan: {
         sourceId: 'class-lifecycle-test',
         title: 'Class lifecycle test',
         conversionProfile: 'uploaded_html',
         conversionPolicy: { conversionProfile: 'uploaded_html' },
       },
     });
     process.stdout.write(JSON.stringify(baseline));`,
  ], { encoding: 'utf8' }));
}

describe('Pixflow HTML class lifecycle', () => {
  it('prunes unreachable stylesheet classes and retains direct, rich-markup, and script-hook dependencies with reasons', () => {
    const html = `<!doctype html><html><head><style>
      .used { color: red; }
      .rich-mark { font-weight: 700; }
      .is-open { opacity: 1; }
      .unused { color: blue; }
      .unused-child .never-present { margin-top: 8px; }
    </style></head><body><main>
      <p class="used">Before <em class="rich-mark">Rich</em> after</p>
    </main><script>document.querySelector('.used')?.classList.add('is-open');</script></body></html>`;
    const baseline = buildBaseline(html);
    const names = baseline.globalClasses.map((item: Record<string, any>) => item.name);

    expect(names).toEqual(expect.arrayContaining(['used', 'rich-mark', 'is-open']));
    expect(names).not.toEqual(expect.arrayContaining(['unused', 'unused-child', 'never-present']));
    expect(baseline.classLifecycleReport).toMatchObject({
      schema: 'pixflow.html_to_bricks.class_lifecycle.v1',
      ok: true,
      orphanReferenceCount: 0,
      unexplainedUnusedClassCount: 0,
    });
    expect(baseline.classLifecycleReport.classes).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'used', disposition: 'retained', reasons: expect.arrayContaining(['direct_element_reference']) }),
      expect.objectContaining({ sourceName: 'is-open', disposition: 'retained', reasons: expect.arrayContaining(['retained_visual_script_hook']) }),
      expect.objectContaining({ sourceName: 'unused', disposition: 'pruned', reasons: expect.arrayContaining(['unreachable_from_emitted_output']) }),
    ]));
    for (const element of [...baseline.content, ...baseline.headerContent, ...baseline.footerContent]) {
      expect((element.settings?._attributes || []).some((attribute: Record<string, any>) => attribute.name === 'class')).toBe(false);
    }

    const rerun = buildBaseline(html);
    expect(rerun.globalClasses).toEqual(baseline.globalClasses);
    expect(rerun.classLifecycleReport).toEqual(baseline.classLifecycleReport);
  });

  it('deduplicates generated inline signatures but preserves distinct authored class vocabulary', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .alpha, .beta { color: red; }
    </style></head><body><main>
      <div class="alpha" style="padding: 4px">Alpha</div>
      <div class="beta" style="padding: 4px">Beta</div>
    </main></body></html>`);
    const inlineClasses = baseline.globalClasses.filter((item: Record<string, any>) => item.name.startsWith('pixflow-inline-'));

    expect(inlineClasses).toHaveLength(1);
    expect(baseline.globalClasses.map((item: Record<string, any>) => item.name)).toEqual(
      expect.arrayContaining(['alpha', 'beta']),
    );
    expect(baseline.classLifecycleReport.duplicateSignatures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        publicNames: expect.arrayContaining(['alpha', 'beta']),
        disposition: 'retained_distinct',
        reason: 'preserved_distinct_source_vocabulary',
      }),
    ]));
  });
});
