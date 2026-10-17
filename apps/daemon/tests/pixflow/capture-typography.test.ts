import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { measureTextContrast } from '../../src/pixflow/text-contrast.js';

const source = readFileSync(new URL('../../src/pixflow/browser-screenshot.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function capturePixflowLayoutEvidence(');
const implementation = source.slice(start, source.indexOf('\nasync function ', start + 1));

it('reports the actual root and navigation type scale without assigning a verdict', async () => {
  const root = { tagName: 'HTML' };
  const surface = { tagName: 'SECTION', getAttribute: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 1000 }) };
  const link = {
    parentElement: surface,
    tagName: 'A', id: '', classList: ['brand-nav'], textContent: 'Studio',
    childNodes: [{ nodeType: 3, textContent: 'Studio' }],
    getAttribute: (name: string) => name === 'href' ? '/studio' : null,
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 50, bottom: 18, width: 50, height: 18 }),
    scrollWidth: 50, scrollHeight: 18, clientWidth: 50, clientHeight: 18,
  };
  const copy = { ...link, tagName: 'DIV', textContent: 'Native Bricks body copy', childNodes: [{ nodeType: 3, textContent: 'Native Bricks body copy' }] };
  const offscreen = { ...copy, textContent: 'Outside this capture', getBoundingClientRect: () => ({ x: 0, y: 900, left: 0, top: 900, right: 50, bottom: 918, width: 50, height: 18 }) };
  const context = vm.createContext({
    measureTextContrast,
    document: {
      documentElement: { clientWidth: 390, clientHeight: 844, scrollWidth: 390, scrollHeight: 844 },
      body: { scrollWidth: 390, scrollHeight: 844 },
      querySelector: () => root,
      querySelectorAll: () => [link, copy, offscreen,
        ...Array.from({ length: 240 }, (_, index) => ({ ...offscreen, textContent: `Later label ${index}` })),
        { ...offscreen, getAttribute: (name: string) => name === 'aria-hidden' ? 'true' : null },
      ],
    },
    getComputedStyle: (element: unknown) => ({
      display: 'block', visibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: 'visible',
      getPropertyValue: (name: string) => ({
        'font-size': element === root ? '10px' : element === copy ? '17px' : '7.2px',
        'line-height': '18px', 'font-family': 'Arial', color: 'rgb(185, 117, 89)', 'font-weight': '400',
        'background-color': element === surface ? 'rgb(244, 240, 231)' : 'rgba(0, 0, 0, 0)',
        'background-image': 'none', opacity: '1',
      }[name] || ''),
    }),
  });
  vm.runInContext(ts.transpileModule(implementation, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const evidence = await context.capturePixflowLayoutEvidence({ evaluate: (fn: (id: string) => unknown, id: string) => fn(id) }, { id: 'mobile' }, { consoleErrors: [], failedRequests: [] });
  expect(evidence.typography).toMatchObject({ rootFontSize: '10px', samples: [
    { text: 'Studio', fontSize: '7.2px', height: 18, color: 'rgb(185, 117, 89)', fontWeight: '400', backgroundLayers: [{ color: 'rgb(244, 240, 231)', image: 'none', opacity: '1' }] },
    { text: 'Native Bricks body copy', fontSize: '17px' },
  ] });
  expect(evidence.typography).not.toHaveProperty('passed');
  expect(evidence.typography.samples[0].contrast.ratio).toBeCloseTo(3.21, 2);
  expect(evidence.typography.samples).toHaveLength(2);
  expect(evidence.typography.documentSamples).toHaveLength(200);
  expect(evidence.typography.documentSamples).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: 'Native Bricks body copy', inViewport: true }),
    expect.objectContaining({ text: 'Outside this capture', top: 900, inViewport: false }),
  ]));
  expect(evidence.typography.documentTextCount).toBe(243);
  expect(evidence.typography.documentTruncated).toBe(true);
});
