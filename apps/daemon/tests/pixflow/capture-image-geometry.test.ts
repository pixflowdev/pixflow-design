import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { capturePixflowBrowserScreenshots, resolvePixflowCaptureBrowser } from '../../src/pixflow/browser-screenshot.js';

it('reports image intrinsic size and effective fit for both root and wrapped images', async context => {
  if (!await resolvePixflowCaptureBrowser()) { context.skip(); return; }
  const source = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="green"/></svg>')}`;
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<style>img{width:60px;height:160px}.photo img{object-fit:cover}</style>
      <img id="root" class="photo" src="${source}" alt="Root image">
      <figure class="photo"><img id="wrapped" src="${source}" alt="Wrapped image"></figure>
      <div hidden><img src="${source}" alt="Hidden image"></div>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture port');
    const result = await capturePixflowBrowserScreenshots({ url: `http://127.0.0.1:${address.port}`, waitMs: 0,
      viewports: [{ id: 'desktop', width: 800, height: 600 }] });
    expect(result.errors).toEqual([]);
    const images = result.captures[0]?.layout?.images;
    expect(images).toMatchObject({ count: 2, truncated: false, samples: [
      { selector: 'img#root.photo', naturalWidth: 120, naturalHeight: 80, objectFit: 'fill', bounds: { width: 60, height: 160 } },
      { selector: 'img#wrapped', naturalWidth: 120, naturalHeight: 80, objectFit: 'cover', bounds: { width: 60, height: 160 } },
    ] });
    expect(images?.samples.some(sample => 'passed' in sample || 'distorted' in sample)).toBe(false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}, 30000);
