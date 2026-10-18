import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

function payloadWithoutDiagnostics(text: string): Record<string, unknown> {
  const payload = JSON.parse(text) as Record<string, unknown>;
  // Normalization counters describe work performed during this invocation;
  // only the delivered content, styles and sidecars must remain idempotent.
  delete payload.diagnostics;
  return payload;
}

function inheritanceHelperId(kind: string, patch: Record<string, unknown>): string {
  const hash = createHash('sha256').update(`stage-b-inherited-${kind}:${JSON.stringify(patch)}`).digest('hex');
  return Array.from({ length: 6 }, (_, index) => (
    String.fromCharCode(97 + (parseInt(hash.slice(index * 2, index * 2 + 2), 16) % 26))
  )).join('');
}

describe('Pixflow Stage B split-source handoff', () => {
  it('preserves source assets at the relative path used by the accepted compiled artifact', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-split-media-'));
    const stageA = path.join(root, 'stage-a');
    const output = path.join(root, 'stage-b');
    const repoRoot = path.resolve(import.meta.dirname, '../../..');

    try {
      await fs.mkdir(path.join(stageA, 'drafts'), { recursive: true });
      await fs.mkdir(path.join(stageA, 'source', 'assets'), { recursive: true });
      await fs.writeFile(
        path.join(stageA, 'drafts', 'index.html'),
        '<!doctype html><html><body><main><section><h1>Split source</h1><img src="../source/assets/device.svg" alt="Device"></section></main></body></html>',
      );
      await fs.writeFile(path.join(stageA, 'source', 'assets', 'device.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
      await fs.writeFile(path.join(stageA, 'metadata.json'), JSON.stringify({ sourceId: 'split-source-media', title: 'Split source media' }));

      await execFileAsync(
        process.execPath,
        [
          'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
          'run-stage-b',
          '--stage-a-workspace',
          stageA,
          '--workspace',
          output,
          '--runner',
          'deterministic',
          '--skip-status-preflight',
          '--force',
          '--allow-low-stage-b-qa',
          '--json',
        ],
        { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
      );

      await expect(
        fs.readFile(path.join(output, 'split-source-media', 'stage-a', 'source', 'assets', 'device.svg'), 'utf8'),
      ).resolves.toContain('<svg');
      const result = JSON.parse(await fs.readFile(path.join(output, 'split-source-media', 'bricks-result.json'), 'utf8')) as {
        content?: Array<{ name?: string; settings?: { image?: { url?: string } } }>;
      };
      const image = result.content?.find((element) => element.name === 'image');
      expect(image?.settings?.image?.url).toBe('../source/assets/device.svg');

      // A repair model must not be allowed to replace an accepted local
      // source asset with a generic remote placeholder. The deterministic
      // repair boundary owns source-media identity and restores it by the
      // compiler-stable Bricks element ID.
      if (!image?.settings?.image) throw new Error('Expected the baseline image element.');
      image.settings.image = {
        ...image.settings.image,
        url: 'https://placehold.co/1200x750?text=Device',
      };
      const resultPath = path.join(output, 'split-source-media', 'bricks-result.json');
      await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);

      await execFileAsync(
        process.execPath,
        [
          'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
          'repair-stage-b',
          '--workspace',
          path.join(output, 'split-source-media'),
          '--repair-attempts',
          '0',
          '--allow-low-stage-b-qa',
          '--json',
        ],
        { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
      );

      const repaired = JSON.parse(await fs.readFile(resultPath, 'utf8')) as {
        content?: Array<{ name?: string; settings?: { image?: { url?: string } } }>;
        diagnostics?: { sourceMediaRestoration?: { restored?: number } };
      };
      const repairedImage = repaired.content?.find((element) => element.name === 'image');
      expect(repairedImage?.settings?.image?.url).toBe('../source/assets/device.svg');
      expect(repaired.diagnostics?.sourceMediaRestoration?.restored).toBe(1);

      await execFileAsync(
        process.execPath,
        [
          'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
          'repair-stage-b',
          '--workspace',
          path.join(output, 'split-source-media'),
          '--repair-attempts',
          '0',
          '--allow-low-stage-b-qa',
          '--json',
        ],
        { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
      );
      const normalizedAgain = JSON.parse(await fs.readFile(resultPath, 'utf8')) as {
        diagnostics?: { sourceMediaRestoration?: { restored?: number } };
      };
      expect(normalizedAgain.diagnostics?.sourceMediaRestoration?.restored).toBe(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('accepts a responsive control that is hidden by default and becomes flex at a breakpoint', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-responsive-flex-'));
    const stageA = path.join(root, 'stage-a');
    const output = path.join(root, 'stage-b');
    const repoRoot = path.resolve(import.meta.dirname, '../../..');

    try {
      await fs.mkdir(path.join(stageA, 'drafts'), { recursive: true });
      await fs.writeFile(
        path.join(stageA, 'drafts', 'index.html'),
        [
          '<!doctype html><html><head><style>',
          '.menu-toggle{display:none;flex-direction:column;gap:8px}',
          '.menu-toggle[aria-expanded="true"] span:first-child{transform:translateY(4px) rotate(20deg)}',
          '@media(max-width:767px){.menu-toggle{display:flex}}',
          '</style></head><body><main><section><h1>Menu</h1>',
          '<button class="menu-toggle" aria-expanded="false"><span></span><span></span></button>',
          '</section></main></body></html>',
        ].join(''),
      );
      await fs.writeFile(path.join(stageA, 'metadata.json'), JSON.stringify({ sourceId: 'responsive-flex', title: 'Responsive flex' }));

      const { stdout } = await execFileAsync(
        process.execPath,
        [
          'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
          'run-stage-b',
          '--stage-a-workspace', stageA,
          '--workspace', output,
          '--runner', 'deterministic',
          '--skip-status-preflight',
          '--force',
          '--json',
        ],
        { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
      );

      const result = JSON.parse(stdout) as { stageBQa?: { issues?: Array<{ id?: string }> } };
      expect(result.stageBQa?.issues?.map((issue) => issue.id)).not.toContain('stage_b_flex_controls_without_display');
      expect(result.stageBQa?.issues?.map((issue) => issue.id)).not.toContain('stage_b_custom_css_contains_supported_declarations');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('uses the Bricks non-nestable flex-direction control for headings and text elements', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-non-nestable-flex-'));
    const stageA = path.join(root, 'stage-a');
    const output = path.join(root, 'stage-b');
    const repoRoot = path.resolve(import.meta.dirname, '../../..');

    try {
      await fs.mkdir(path.join(stageA, 'drafts'), { recursive: true });
      await fs.writeFile(
        path.join(stageA, 'drafts', 'index.html'),
        '<!doctype html><html><head><style>.hero-title{display:flex;flex-direction:column}.hero-title span{display:block}</style></head><body><main><section><h1 class="hero-title"><span>One</span><span>Two</span></h1></section></main></body></html>',
      );
      await fs.writeFile(path.join(stageA, 'metadata.json'), JSON.stringify({ sourceId: 'non-nestable-flex', title: 'Non-nestable flex' }));

      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'run-stage-b',
        '--stage-a-workspace', stageA,
        '--workspace', output,
        '--runner', 'deterministic',
        '--skip-status-preflight',
        '--force',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

      const result = JSON.parse(await fs.readFile(path.join(output, 'non-nestable-flex', 'bricks-result.json'), 'utf8')) as {
        content?: Array<{ name?: string; settings?: { _cssGlobalClasses?: string[] } }>;
        global_classes?: Array<{ id?: string; settings?: Record<string, unknown> }>;
      };
      const heading = result.content?.find((element) => element.name === 'heading');
      const classIds = heading?.settings?._cssGlobalClasses || [];
      const headingClasses = result.global_classes?.filter((entry) => classIds.includes(entry.id || '')) || [];
      expect(headingClasses.some((entry) => entry.settings?._flexDirection === 'column')).toBe(true);
      expect(headingClasses.some((entry) => entry.settings?._direction === 'column')).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('materializes ancestor foreground colors on Bricks leaf elements', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-inherited-foreground-'));
    const stageA = path.join(root, 'stage-a');
    const output = path.join(root, 'stage-b');
    const repoRoot = path.resolve(import.meta.dirname, '../../..');

    try {
      await fs.mkdir(path.join(stageA, 'drafts'), { recursive: true });
      await fs.writeFile(
        path.join(stageA, 'drafts', 'index.html'),
        '<!doctype html><html><head><style>:root{--paper:#f5f1e8}.dark{background:#111;color:var(--paper)}.dark p{font-size:18px}</style></head><body><main><footer class="dark"><p>Inherited foreground</p></footer></main></body></html>',
      );
      await fs.writeFile(path.join(stageA, 'metadata.json'), JSON.stringify({
        sourceId: 'inherited-foreground',
        title: 'Inherited foreground',
      }));

      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'run-stage-b',
        '--stage-a-workspace', stageA,
        '--workspace', output,
        '--runner', 'deterministic',
        '--skip-status-preflight',
        '--force',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

      const resultPath = path.join(output, 'inherited-foreground', 'bricks-result.json');
      const result = JSON.parse(await fs.readFile(resultPath, 'utf8')) as {
        content?: Array<{ id?: string; parent?: string; name?: string; settings?: { _cssGlobalClasses?: string[] } }>;
        global_classes?: Array<{ id?: string; name?: string; settings?: { _width?: string; _typography?: { color?: { raw?: string } } } }>;
      };
      const leaf = result.content?.find((element) => element.name === 'text-basic');
      const parent = result.content?.find((element) => element.id === leaf?.parent);
      if (!leaf?.settings || !parent?.settings || !result.global_classes) {
        throw new Error('Expected a deterministic text leaf with a parent and global classes.');
      }
      const colorClassIds = new Set(result.global_classes
        .filter((entry) => entry.settings?._typography?.color)
        .map((entry) => entry.id)
        .filter(Boolean));
      leaf.settings._cssGlobalClasses = (leaf.settings._cssGlobalClasses || [])
        .filter((classId) => !colorClassIds.has(classId));
      const parentColor = result.global_classes.find((entry) => (
        parent.settings?._cssGlobalClasses?.includes(entry.id || '') && entry.settings?._typography?.color?.raw
      ))?.settings?._typography?.color?.raw;
      if (!parentColor) throw new Error('Expected the authored parent foreground color.');
      // A model can imitate the compiler's exact name/hash. Such a helper is
      // still untrusted unless this pass derives its patch from the ancestor.
      const forgedPatch = { _typography: { color: { raw: '#123456' } } };
      const forgedId = inheritanceHelperId('foreground', forgedPatch);
      result.global_classes.push({ id: forgedId, name: `pixflow-inherited-foreground-${forgedId}`, settings: forgedPatch });
      leaf.settings._cssGlobalClasses.push(forgedId);
      const priorHelper = result.global_classes.find((entry) => entry.name?.startsWith('pixflow-inherited-foreground-') && entry.id !== forgedId);
      if (priorHelper?.settings) priorHelper.settings._width = '999px';
      await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);

      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'repair-stage-b',
        '--workspace', path.join(output, 'inherited-foreground'),
        '--repair-attempts', '0',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

      const normalized = JSON.parse(await fs.readFile(resultPath, 'utf8')) as typeof result;
      const normalizedLeaf = normalized.content?.find((element) => element.id === leaf.id);
      const leafClassIds = normalizedLeaf?.settings?._cssGlobalClasses || [];
      const leafClasses = normalized.global_classes
        ?.filter((entry) => leafClassIds.includes(entry.id || '')) || [];
      const leafColors = leafClasses
        .map((entry) => entry.settings?._typography?.color?.raw)
        .filter(Boolean);
      expect(leafColors).toContain(parentColor);
      expect(normalized.global_classes?.some((entry) => entry.id === forgedId)).toBe(false);
      expect(leafClasses.some((entry) => entry.settings?._width === '999px')).toBe(false);

      const onceNormalized = await fs.readFile(resultPath, 'utf8');
      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'repair-stage-b',
        '--workspace', path.join(output, 'inherited-foreground'),
        '--repair-attempts', '0',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });
      const twiceNormalized = await fs.readFile(resultPath, 'utf8');
      expect(payloadWithoutDiagnostics(twiceNormalized)).toEqual(payloadWithoutDiagnostics(onceNormalized));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves inline sup semantics and source SVG stroke intent in Bricks leaves', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-inline-icon-'));
    const stageA = path.join(root, 'stage-a');
    const output = path.join(root, 'stage-b');
    const repoRoot = path.resolve(import.meta.dirname, '../../..');

    try {
      await fs.mkdir(path.join(stageA, 'drafts'), { recursive: true });
      await fs.writeFile(
        path.join(stageA, 'drafts', 'index.html'),
        '<!doctype html><html><head><style>.fixture-root{display:block}</style></head><body><main><section class="fixture-root"><h1>Fixture</h1></section></main></body></html>',
      );
      await fs.writeFile(path.join(stageA, 'metadata.json'), JSON.stringify({ sourceId: 'inline-icon', title: 'Inline icon' }));

      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'run-stage-b',
        '--stage-a-workspace', stageA,
        '--workspace', output,
        '--runner', 'deterministic',
        '--skip-status-preflight',
        '--force',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

      const workspace = path.join(output, 'inline-icon');
      const resultPath = path.join(workspace, 'bricks-result.json');
      const result = JSON.parse(await fs.readFile(resultPath, 'utf8')) as {
        content?: Array<Record<string, any>>;
        global_classes?: Array<Record<string, any>>;
      };
      const parent = result.content?.find((element) => Array.isArray(element.children));
      if (!parent || !result.content || !result.global_classes) {
        throw new Error('Expected deterministic content and global classes.');
      }
      const sourceIconClass = result.global_classes.find((entry) => entry.name === 'fixture-root');
      if (!sourceIconClass) throw new Error('Expected the authored wrapper class.');
      sourceIconClass.settings._cssCustom = '%root% svg { fill: var(--fixture-black); }';
      const iconPatch = { icon: { stroke: { raw: 'var(--fixture-black)' } } };
      const iconHelperId = inheritanceHelperId('icon-style', iconPatch);
      const forgedIconPatch = { icon: { stroke: { raw: '#123456' } } };
      const forgedIconId = inheritanceHelperId('icon-style', forgedIconPatch);
      parent.children.push('inlwrp', 'icnbtn');
      result.global_classes.push(
        { id: 'supcss', name: 'fixture-sup', settings: { _cssCustom: '%root% sup { font-size: .25em; }' } },
        // Even an exact compiler identity must have its settings rebuilt from
        // the source patch. A different, correctly hashed patch is untrusted.
        { id: iconHelperId, name: `pixflow-inherited-icon-style-${iconHelperId}`, settings: { ...iconPatch, _width: '999px' } },
        { id: forgedIconId, name: `pixflow-inherited-icon-style-${forgedIconId}`, settings: forgedIconPatch },
      );
      result.content.push(
        { id: 'inlwrp', name: 'div', parent: parent.id, children: ['txtone', 'supbrn'], settings: { _cssGlobalClasses: ['supcss'] } },
        { id: 'txtone', name: 'text-basic', parent: 'inlwrp', children: [], settings: { text: 'Ramos' } },
        { id: 'supbrn', name: 'div', parent: 'inlwrp', children: ['suptxt'], settings: {} },
        { id: 'suptxt', name: 'text-basic', parent: 'supbrn', children: [], settings: { text: '&reg;' } },
        { id: 'icnbtn', name: 'block', parent: parent.id, children: ['icnsvg'], settings: { _cssGlobalClasses: [sourceIconClass.id] } },
        { id: 'icnsvg', name: 'icon', parent: 'icnbtn', children: [], settings: { _cssGlobalClasses: [iconHelperId, forgedIconId], icon: { icon: 'pixflow:tabler-outline:arrow-up-right', library: 'pixflow' } } },
      );
      await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);

      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'repair-stage-b',
        '--workspace', workspace,
        '--repair-attempts', '0',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

      const normalized = JSON.parse(await fs.readFile(resultPath, 'utf8')) as typeof result;
      expect(normalized.content?.find((element) => element.id === 'txtone')?.settings?.text)
        .toBe('Ramos<sup>&reg;</sup>');
      expect(normalized.content?.some((element) => element.id === 'supbrn' || element.id === 'suptxt')).toBe(false);
      expect(normalized.content?.find((element) => element.id === 'inlwrp')?.children).toEqual(['txtone']);
      const icon = normalized.content?.find((element) => element.id === 'icnsvg');
      const iconClasses = normalized.global_classes?.filter((entry) => icon?.settings?._cssGlobalClasses?.includes(entry.id)) || [];
      expect(iconClasses.some((entry) => entry.settings?.icon?.stroke?.raw === 'var(--fixture-black)')).toBe(true);
      expect(normalized.global_classes?.some((entry) => entry.id === forgedIconId)).toBe(false);
      expect(iconClasses.find((entry) => entry.id === iconHelperId)?.settings).toEqual(iconPatch);

      const onceNormalized = await fs.readFile(resultPath, 'utf8');
      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'repair-stage-b',
        '--workspace', workspace,
        '--repair-attempts', '0',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });
      expect(payloadWithoutDiagnostics(await fs.readFile(resultPath, 'utf8'))).toEqual(payloadWithoutDiagnostics(onceNormalized));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps an accepted local webfont as an installable Bricks font sidecar', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-local-font-'));
    const stageA = path.join(root, 'stage-a');
    const output = path.join(root, 'stage-b');
    const repoRoot = path.resolve(import.meta.dirname, '../../..');

    try {
      await fs.mkdir(path.join(stageA, 'drafts'), { recursive: true });
      await fs.mkdir(path.join(stageA, 'source', 'assets', 'fonts'), { recursive: true });
      await fs.writeFile(path.join(stageA, 'source', 'assets', 'fonts', 'ExactSans.woff2'), 'fixture-font');
      await fs.writeFile(
        path.join(stageA, 'drafts', 'index.html'),
        '<!doctype html><html><head><style>@font-face{font-family:"Exact Sans";src:url("../source/assets/fonts/ExactSans.woff2") format("woff2");font-style:normal;font-weight:100 900}body{font-family:"Exact Sans",sans-serif}</style></head><body><main><section><h1>Exact local type</h1></section></main></body></html>',
      );
      await fs.writeFile(path.join(stageA, 'metadata.json'), JSON.stringify({ sourceId: 'local-font', title: 'Local font' }));

      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'run-stage-b',
        '--stage-a-workspace', stageA,
        '--workspace', output,
        '--runner', 'deterministic',
        '--skip-status-preflight',
        '--force',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

      const workspace = path.join(output, 'local-font');
      const fontSystem = JSON.parse(await fs.readFile(path.join(workspace, 'stage-b-font-system.json'), 'utf8')) as {
        fonts?: Array<{ family?: string; provider?: string; sourceRefs?: string[] }>;
      };
      expect(fontSystem.fonts).toContainEqual(expect.objectContaining({
        family: 'Exact Sans',
        provider: 'local_asset',
        sourceRefs: ['../source/assets/fonts/ExactSans.woff2'],
      }));

      const result = JSON.parse(await fs.readFile(path.join(workspace, 'bricks-result.json'), 'utf8')) as {
        global_classes?: Array<{ settings?: { _typography?: { 'font-family'?: string } } }>;
        stage_b_theme_style_payload?: { settings?: { css?: { stylesheet?: string } } };
      };
      // Classless body typography belongs to the page foundation. It must
      // remain effective without manufacturing a global class for the font.
      const stylesheet = result.stage_b_theme_style_payload?.settings?.css?.stylesheet || '';
      expect(stylesheet).toContain('#brx-content.pixflow-generated-page { font-family: "Exact Sans",sans-serif; }');
      const families = result.global_classes
        ?.map((entry) => entry.settings?._typography?.['font-family'])
        .filter(Boolean);
      expect(families).not.toContain('Arial');
      expect(stylesheet).not.toMatch(/font-family:\s*["']?Arial\b/i);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('restores compiler-owned color sidecars after a model rewrites payload tokens', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-color-sidecar-'));
    const stageA = path.join(root, 'stage-a');
    const output = path.join(root, 'stage-b');
    const workspace = path.join(output, 'color-sidecar');
    const repoRoot = path.resolve(import.meta.dirname, '../../..');

    try {
      await fs.mkdir(path.join(stageA, 'drafts'), { recursive: true });
      await fs.writeFile(
        path.join(stageA, 'drafts', 'index.html'),
        '<!doctype html><html><head><style>:root{--brand:#ef5533}.hero{color:var(--brand)}.field input{color:var(--brand)}</style></head><body><main><section class="hero"><h1>Color sidecar</h1><form class="field"><input type="text" name="name"></form></section></main></body></html>',
      );
      await fs.writeFile(path.join(stageA, 'metadata.json'), JSON.stringify({ sourceId: 'color-sidecar', title: 'Color sidecar' }));

      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'prepare-stage-b',
        '--stage-a-workspace', stageA,
        '--workspace', output,
        '--runner', 'deterministic',
        '--skip-status-preflight',
        '--force',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

      const authoritative = JSON.parse(await fs.readFile(path.join(workspace, 'stage-b-color-system.json'), 'utf8')) as Record<string, unknown>;
      const resultPath = path.join(workspace, 'bricks-result.json');
      const result = JSON.parse(await fs.readFile(resultPath, 'utf8')) as Record<string, unknown>;
      result.stage_b_color_system = {
        ...authoritative,
        tokenAliases: { '--corrupted-target': '--corrupted-target' },
        variables: [{ sourceCssVariable: '--corrupted-target', cssVariable: '--corrupted-target' }],
      };
      await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);

      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'repair-stage-b',
        '--workspace', workspace,
        '--repair-attempts', '0',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

      const normalized = JSON.parse(await fs.readFile(resultPath, 'utf8')) as Record<string, unknown>;
      const qa = JSON.parse(await fs.readFile(path.join(workspace, 'stage-b-qa.json'), 'utf8')) as {
        issues?: Array<{ id?: string }>;
      };
      expect(normalized.stage_b_color_system).toEqual(authoritative);
      expect(normalized.color_system).toEqual(authoritative);
      expect(qa.issues?.map((issue) => issue.id)).not.toContain('stage_b_source_color_variable_leaked');

      const onceNormalized = await fs.readFile(resultPath, 'utf8');
      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'repair-stage-b',
        '--workspace', workspace,
        '--repair-attempts', '0',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });
      const twiceNormalized = await fs.readFile(resultPath, 'utf8');
      expect(payloadWithoutDiagnostics(twiceNormalized)).toEqual(payloadWithoutDiagnostics(onceNormalized));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('counts nested semantic buttons as source action affordances', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-action-count-'));
    const stageA = path.join(root, 'stage-a');
    const output = path.join(root, 'stage-b');
    const repoRoot = path.resolve(import.meta.dirname, '../../..');

    try {
      await fs.mkdir(path.join(stageA, 'drafts'), { recursive: true });
      await fs.writeFile(
        path.join(stageA, 'drafts', 'index.html'),
        '<!doctype html><html><body><main><section><h1>Actions</h1><a href="#one">One</a><a href="#two">Two</a><a href="#three">Three</a><a href="#four">Four</a><button><span>One</span></button><button><span>Two</span></button><button><span>Three</span></button><button><span>Four</span></button></section></main></body></html>',
      );
      await fs.writeFile(path.join(stageA, 'metadata.json'), JSON.stringify({ sourceId: 'action-count', title: 'Action count' }));

      await execFileAsync(process.execPath, [
        'tools/pixflow-design-bridge/bricks-handoff-cli.mjs',
        'run-stage-b',
        '--stage-a-workspace', stageA,
        '--workspace', output,
        '--runner', 'deterministic',
        '--skip-status-preflight',
        '--force',
        '--allow-low-stage-b-qa',
        '--json',
      ], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

      const qa = JSON.parse(await fs.readFile(path.join(output, 'action-count', 'stage-b-qa.json'), 'utf8')) as {
        issues?: Array<{ id?: string }>;
      };
      expect(qa.issues?.map((issue) => issue.id)).not.toContain('stage_b_source_links_missing');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);
});
