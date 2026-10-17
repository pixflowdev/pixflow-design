import { spawn } from 'node:child_process';
import { expect, it } from 'vitest';
import { isProcessAlive, stopChildProcessTree } from '../src/index.js';

it.skipIf(process.platform !== 'win32')('stops a real Windows child and descendant while preserving an independent process', async () => {
  const idle = 'setInterval(() => {}, 1000)';
  const treeScript = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e',${JSON.stringify(idle)}],{windowsHide:true,stdio:'ignore'}); console.log(child.pid); ${idle}`;
  const root = spawn(process.execPath, ['-e', treeScript], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const independent = spawn(process.execPath, ['-e', idle], { windowsHide: true, stdio: 'ignore' });
  try {
    const descendant = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture startup timed out')), 5000);
      root.once('error', error => { clearTimeout(timer); reject(error); });
      root.stdout.once('data', data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
    });
    expect(Number.isInteger(descendant)).toBe(true);
    expect(isProcessAlive(descendant)).toBe(true);
    await Promise.all([stopChildProcessTree(root), stopChildProcessTree(root)]);
    await expect.poll(() => isProcessAlive(root.pid)).toBe(false);
    await expect.poll(() => isProcessAlive(descendant)).toBe(false);
    expect(isProcessAlive(independent.pid)).toBe(true);
  } finally {
    await stopChildProcessTree(root);
    await stopChildProcessTree(independent);
  }
}, 15000);
