import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
const tempDirectories: string[] = [];
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function convertGridSource(options: {
  sourceContract?: string;
  sourceFidelityClone?: boolean;
  semanticTags?: string[];
  explicitConstraint?: string;
} = {}): Record<string, any> {
  const directory = mkdtempSync(join(tmpdir(), 'pixflow-build-grid-projection-'));
  tempDirectories.push(directory);
  const htmlFile = join(directory, 'index.html');
  const tags = options.semanticTags ?? ['div', 'div', 'div', 'div'];
  const titles = ['Spatial Audit', 'Material Synthesis', 'Detail Engineering', 'On-Site Stewardship'];
  const descriptions = [
    'Deep analysis of volumetric capacity, light orientation, and functional requirements.',
    'Development of physical material boards, tactile samples, and lighting schemes.',
    'Rigorous architectural documentation, millwork drawings, and threshold detailing.',
    'Continuous collaboration with specialist artisans, stone masons, and master joiners.',
  ];
  const cards = tags.map((tag, index) => (
    `<${tag} class="process-card${index === 0 && options.explicitConstraint ? ' constrained' : ''}">`
      + `<div class="process-card__header"><span>PHASE 0${index + 1}</span></div>`
      + `<h3>${titles[index]}</h3><p>${descriptions[index]}</p>`
      + `</${tag}>`
  )).join('');
  writeFileSync(htmlFile, `<!doctype html><html><head><style>
    .process-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
    .process-card { display: flex; flex-direction: column; gap: 16px; padding: 32px; }
    .constrained { ${options.explicitConstraint ?? ''} }
    @media (max-width: 991px) { .process-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 478px) { .process-grid { grid-template-columns: 1fr; } }
  </style></head><body><main><section><div class="process-grid">${cards}</div></section></main></body></html>`);
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const { buildPixflowStageBHtmlBaseline } = await import(${JSON.stringify(bridgeModuleUrl)});`
      + `const result = await buildPixflowStageBHtmlBaseline({ htmlFile: ${JSON.stringify(htmlFile)}, plan: ${JSON.stringify({
        sourceId: 'checkpoint-a-process-grid',
        title: 'Checkpoint A process grid',
        conversionProfile: 'uploaded_html',
        sourceContract: options.sourceContract,
        sourceFidelityClone: options.sourceFidelityClone,
        conversionPolicy: {
          conversionProfile: 'uploaded_html',
          sourceContract: options.sourceContract,
          stageASource: options.sourceFidelityClone ? { sourceFidelityClone: true } : undefined,
        },
      })} }); process.stdout.write(JSON.stringify(result));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function projectedGrid(result: Record<string, any>): {
  grid: Record<string, any>;
  cards: Record<string, any>[];
  diagnostics: Record<string, any>[];
} {
  const gridClass = result.globalClasses.find((item: Record<string, any>) => item.name === 'process-grid');
  const grid = result.content.find((item: Record<string, any>) => (
    item.settings?._cssGlobalClasses?.includes(gridClass.id)
  ));
  return {
    grid,
    cards: result.content.filter((item: Record<string, any>) => item.parent === grid.id),
    diagnostics: result.structureReport?.diagnostics ?? [],
  };
}

function nativeFixtureHtml(result: Record<string, any>, genuineOverflow = false): string {
  const { cards } = projectedGrid(result);
  const cardMarkup = cards.map((card, index) => {
    const minWidth = card.settings?._widthMin;
    const constraint = minWidth !== undefined ? `min-width:${minWidth};` : '';
    const title = ['Spatial Audit', 'Material Synthesis', 'Detail Engineering', 'On-Site Stewardship'][index];
    const body = genuineOverflow && index === 0
      ? '<p class="genuine-overflow">AUTHORED-CONTENT-THAT-MUST-REMAIN-WIDER-THAN-THE-TRACK</p>'
      : '<p>Continuous collaboration with specialist artisans and master joiners.</p>';
    return `<div class="brxe-block process-card" style="${constraint}">`
      + `<div class="brxe-div process-card__header"><span class="brxe-text-basic">PHASE 0${index + 1}</span></div>`
      + `<h3 class="brxe-heading">${title}</h3>${body}</div>`;
  }).join('');
  return `<!doctype html><html><head><style>
    *, :before, :after, html { box-sizing: border-box; }
    [class*="brxe-"] { max-width: 100%; }
    .brxe-block { align-items: flex-start; display: flex; flex-direction: column; width: 100%; }
    body { margin: 0; }
    .page { width: calc(100% - 60px); margin: 0 30px; }
    .process-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
    .process-card { gap: 16px; padding: 32px; }
    .process-card > * { width: 100%; }
    .brxe-heading { font: 750 32px/1.02 Inter, sans-serif; margin: 0; }
    .brxe-text-basic, p { font: 15px/1.4 Inter, sans-serif; margin: 0; }
    .genuine-overflow { min-width: 1200px; white-space: nowrap; }
    @media (max-width: 991px) { .process-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 478px) { .process-grid { grid-template-columns: 1fr; } }
  </style></head><body><div class="page"><div class="brxe-block process-grid">${cardMarkup}</div></div></body></html>`;
}

async function measureFixture(html: string, width: number): Promise<Record<string, any>> {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(html);
    return await page.evaluate(() => {
      const grid = document.querySelector('.process-grid') as HTMLElement;
      const cards = [...grid.children] as HTMLElement[];
      const gridRect = grid.getBoundingClientRect();
      return {
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        gridWidth: gridRect.width,
        gridScrollWidth: grid.scrollWidth,
        tracks: getComputedStyle(grid).gridTemplateColumns,
        cards: cards.map((card) => {
          const rect = card.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, minWidth: getComputedStyle(card).minWidth };
        }),
      };
    });
  } finally {
    await page.close();
  }
}

describe('Canonical Build native grid-item projection', () => {
  it('neutralizes only the converter-introduced automatic minimum on unsized native grid children', () => {
    const result = convertGridSource({
      sourceContract: 'build-in-bricks-html-first',
      semanticTags: ['article', 'div', 'section', 'div'],
    });
    const projection = projectedGrid(result);

    expect(projection.cards).toHaveLength(4);
    expect(projection.cards.map((item) => item.name)).toEqual(['block', 'block', 'section', 'block']);
    expect(projection.cards.every((item) => item.settings._widthMin === '0')).toBe(true);
    expect(projection.diagnostics.filter((item) => item.code === 'native_grid_item_auto_minimum_normalized')).toHaveLength(4);
  });

  it('keeps explicit authored grid-item sizing authoritative', () => {
    const result = convertGridSource({
      sourceContract: 'build-in-bricks-html-first',
      explicitConstraint: 'min-width: 420px; width: 460px; max-width: 520px;',
    });
    const { cards } = projectedGrid(result);
    const sourceClass = result.globalClasses.find((item: Record<string, any>) => item.name === 'constrained');

    expect(sourceClass.settings).toMatchObject({ _widthMin: '420px', _width: '460px', _widthMax: '520px' });
    expect(cards[0].settings._widthMin).toBeUndefined();
    expect(cards.slice(1).every((item) => item.settings._widthMin === '0')).toBe(true);
  });

  it('leaves Website Clone and generic HTML-to-Bricks projection policy unchanged', () => {
    const htmlToBricks = projectedGrid(convertGridSource());
    const websiteClone = projectedGrid(convertGridSource({ sourceFidelityClone: true }));

    for (const projection of [htmlToBricks, websiteClone]) {
      expect(projection.cards.every((item) => item.settings._widthMin === undefined)).toBe(true);
      expect(projection.diagnostics.some((item) => item.code === 'native_grid_item_auto_minimum_normalized')).toBe(false);
    }
  });

  it('preserves the live four-card geometry at 992, 990, and 390 pixels', async () => {
    const result = convertGridSource({ sourceContract: 'build-in-bricks-html-first' });
    const html = nativeFixtureHtml(result);

    for (const width of [992, 990, 390]) {
      const measured = await measureFixture(html, width);
      expect(measured.documentWidth, `${width}px document overflow: ${JSON.stringify(measured)}`).toBeLessThanOrEqual(measured.viewport);
      expect(measured.cards.every((card: Record<string, number>) => card.right <= 30 + measured.gridWidth + 0.5)).toBe(true);
    }
  });

  it('does not hide genuine authored overflow', async () => {
    const result = convertGridSource({ sourceContract: 'build-in-bricks-html-first' });
    const measured = await measureFixture(nativeFixtureHtml(result, true), 992);

    expect(measured.documentWidth).toBeGreaterThan(measured.viewport);
    expect(measured.gridScrollWidth).toBeGreaterThan(measured.gridWidth);
  });
});
