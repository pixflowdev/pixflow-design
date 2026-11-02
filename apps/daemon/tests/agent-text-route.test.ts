import express from 'express';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
const generate = vi.hoisted(() => vi.fn());
vi.mock('../src/runtimes/text-generation.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/runtimes/text-generation.js')>(),
  generateAgentText: generate,
}));
import { registerAgentTextRoute } from '../src/routes/agent-text.js';

let server: Server | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined; generate.mockReset();
});
async function start() {
  const app = express(); app.use(express.json());
  registerAgentTextRoute(app, (req, res, next) => {
    if (req.headers.authorization !== 'fixture') res.sendStatus(403);
    else next();
  }, '.', () => ({}));
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const port = (server.address() as { port: number }).port;
  return (body: unknown, authorized = true, method = 'POST') => fetch(`http://127.0.0.1:${port}/api/agents/text`, {
    method, headers: { 'Content-Type': 'application/json', ...(authorized ? {Authorization:'fixture'} : {}) }, ...(method === 'GET' ? {} : {body:JSON.stringify(body)}),
  });
}
const request = { agentId:'claude', model:'default', prompt:'Translate fixture text.' };
describe('agent text HTTP boundary', () => {
  it('checks capability without launching an agent and retains authorization', async () => {
    const send=await start();
    expect((await send(null,false,'GET')).status).toBe(403);
    const response=await send(null,true,'GET');
    expect(await response.json()).toEqual({available:true});
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(generate).not.toHaveBeenCalled();
  });
  it('denies unauthorized and invalid requests before launching a runtime', async () => {
    const send = await start();
    expect((await send(request, false)).status).toBe(403);
    expect((await send({...request, model:'--shell'})).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
  it('serializes requests and releases the slot after completion', async () => {
    let finish!: (value: unknown) => void;
    let entered!: () => void; const started = new Promise<void>(resolve => {entered=resolve;});
    generate.mockImplementationOnce(() => {entered();return new Promise(resolve => {finish=resolve;});});
    const send=await start(); const first=send(request); await started;
    expect((await send(request)).status).toBe(409);
    finish({text:'Translated',source:'desktop'});
    const response=await first; expect(await response.json()).toEqual({text:'Translated',source:'desktop'});
    expect(response.headers.get('cache-control')).toBe('no-store');
    generate.mockResolvedValueOnce({text:'Next',source:'cli'});
    expect((await send(request)).status).toBe(200);
  });
  it('redacts runtime failures and permits explicit retry', async () => {
    generate.mockRejectedValueOnce(new Error('secret-native-output'));
    const send=await start();const response=await send(request);
    expect(response.status).toBe(502);expect(await response.text()).not.toContain('secret-native-output');
    generate.mockResolvedValueOnce({text:'Recovered',source:'cli'});
    expect((await send(request)).status).toBe(200);
  });
});
