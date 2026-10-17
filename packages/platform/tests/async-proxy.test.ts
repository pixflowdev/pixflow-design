import { expect, it, vi } from 'vitest';
import { resolveSystemProxyEnvAsync } from '../src/index.js';

it('reads Windows proxy values in one asynchronous command and preserves routing', async () => {
  const runCommand = vi.fn(async () => 'ProxyEnable REG_DWORD 0x1\nProxyServer REG_SZ proxy.example:8080\nProxyOverride REG_SZ localhost;127.*');
  const env = await resolveSystemProxyEnvAsync({ platform: 'win32', runCommand });
  expect(runCommand).toHaveBeenCalledTimes(1);
  expect(env.HTTP_PROXY).toContain('proxy.example:8080');
  expect(env.HTTPS_PROXY).toContain('proxy.example:8080');
  expect(env.NO_PROXY).toContain('localhost');
});

it('does not hold up the event loop while the OS lookup is pending', async () => {
  let finish!: (value: string) => void;
  let settled = false;
  const pending = resolveSystemProxyEnvAsync({ platform: 'darwin', runCommand: () => new Promise(resolve => { finish = resolve; }) }).then(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(settled).toBe(false);
  finish('');
  await pending;
});

it('treats unavailable OS settings as no proxy', async () => {
  await expect(resolveSystemProxyEnvAsync({ platform: 'win32', runCommand: async () => { throw new Error('not installed'); } })).resolves.toEqual({});
});
