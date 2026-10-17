import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { capturePixflowBrowserScreenshots, resolvePixflowCaptureBrowser } from '../../src/pixflow/browser-screenshot.js';

it('captures a submitted native form state and text geometry inside the viewport', async context => {
  if (!await resolvePixflowCaptureBrowser()) { context.skip(); return; }
  let submitted = '';
  const server = createServer(async (request, response) => {
    if (request.url === '/submit') {
      for await (const chunk of request) submitted += chunk.toString();
      await new Promise(resolve => setTimeout(resolve, 250));
      response.end('Stored locally'); return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><style>body{background:white}#column{width:160px;display:flex;align-items:flex-start}h1{width:300px;flex-shrink:0}#result{color:rgb(17,183,107);background:rgb(230,246,237)}</style>
      <div id="column"><h1>Long heading</h1></div>
      <form><input name="name" required><select name="route"><option value="bike">Bike</option><option value="wheel">Wheel</option></select><input type="checkbox" name="consent" required><button>Submit</button></form><div id="result" hidden></div>
      <script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const r=await fetch('/submit',{method:'POST',body:new URLSearchParams(new FormData(e.target))});const box=document.querySelector('#result');box.textContent=await r.text();box.hidden=false;}</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture port');
    const result = await capturePixflowBrowserScreenshots({ url: `http://127.0.0.1:${address.port}`, waitMs: 0,
      viewports: [{ id: 'submitted', width: 800, height: 600, actions: [
        { type: 'fill', selector: '[name=name]', value: 'Synthetic QA' },
        { type: 'select', selector: '[name=route]', value: 'wheel' },
        { type: 'check', selector: '[name=consent]', checked: true },
        { type: 'click', selector: 'button' },
        { type: 'waitFor', selector: '#result', state: 'visible' },
      ] }] });
    expect(result.errors).toEqual([]);
    expect(new URLSearchParams(submitted).get('name')).toBe('Synthetic QA');
    expect(new URLSearchParams(submitted).get('route')).toBe('wheel');
    expect(new URLSearchParams(submitted).get('consent')).toBe('on');
    const samples = result.captures[0]?.layout?.typography?.documentSamples;
    expect(samples).toEqual(expect.arrayContaining([expect.objectContaining({ text: 'Stored locally', contrast: expect.objectContaining({ ratio: expect.any(Number) }) })]));
    expect(samples?.find(sample => sample.text === 'Long heading')).toMatchObject({ bounds: { width: 300 }, parentBounds: { width: 160 } });
    expect(result.captures[0]?.layout?.horizontalOverflowPx).toBe(0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}, 30000);
