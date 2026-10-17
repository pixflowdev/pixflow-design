import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', async original => ({
  ...await original<typeof import('node:child_process')>(), execFile: mocks.execFile,
}));
import { listProcessSnapshots, stopChildProcessTree } from '../src/index.js';

afterEach(() => { vi.restoreAllMocks(); mocks.execFile.mockReset(); });
function child(pid = 12345) {
  return Object.assign(new EventEmitter(), { pid, exitCode: null, signalCode: null, kill: vi.fn() }) as unknown as ChildProcess;
}
it('stops only the owned Windows process tree without a shell or process scan', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  mocks.execFile.mockImplementation((_exe, _args, _options, done) => { done(null, '', ''); });
  await stopChildProcessTree(child());
  expect(mocks.execFile).toHaveBeenCalledWith('taskkill.exe', ['/PID', '12345', '/T', '/F'],
    expect.objectContaining({ windowsHide: true, shell: false, timeout: 5000 }), expect.any(Function));
  expect(mocks.execFile).toHaveBeenCalledTimes(1);
});
it('coalesces concurrent cancellation and finalization for the same child', async () => {
  mocks.execFile.mockReset();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  let finish!: () => void;
  mocks.execFile.mockImplementation((_exe, _args, _options, done) => { finish = () => done(null, '', ''); });
  const owned = child();
  const first = stopChildProcessTree(owned);
  const second = stopChildProcessTree(owned);
  expect(mocks.execFile).toHaveBeenCalledTimes(1);
  finish(); await Promise.all([first, second]);
});
it('does not target a PID after its child has already exited', async () => {
  mocks.execFile.mockReset();
  const owned = child(); Object.defineProperty(owned, 'exitCode', { value: 0 });
  await stopChildProcessTree(owned);
  expect(mocks.execFile).not.toHaveBeenCalled();
});

it('shares only in-flight Windows process scans and fetches fresh data afterward', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  let finish!: () => void;
  mocks.execFile.mockImplementation((_exe, _args, _options, done) => {
    finish = () => done(null, JSON.stringify({ ProcessId: 123, ParentProcessId: 1, CommandLine: 'node test' }), '');
  });
  const first = listProcessSnapshots(); const second = listProcessSnapshots();
  expect(mocks.execFile).toHaveBeenCalledTimes(1);
  finish();
  expect(await first).toEqual(await second);
  const third = listProcessSnapshots();
  expect(mocks.execFile).toHaveBeenCalledTimes(2);
  finish(); await third;
});
