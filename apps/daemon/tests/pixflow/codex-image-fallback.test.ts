import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import {generateCodexFallback} from '../../src/pixflow/codex-image-fallback.js';
import type {runCodexTurn} from '../../src/pixflow/codex-turn.js';

describe('shared Codex image fallback',()=>{
  it('isolates site context, imports once, and cleans the image workspace',async()=>{
    let cwd='';
    const imported=vi.fn(async()=>({attachmentId:42,url:'https://site.test/image.png'}));
    const run:typeof runCodexTurn=async options=>{
      cwd=options.cwd;
      expect(await fs.readdir(cwd)).toEqual(['AGENTS.md']);
      expect(options.resumeSessionId).toBeNull();
      expect(options.mcpServers).toEqual({});
      expect(options.warmWorker).toBeUndefined();
      await Promise.all([options.importImage!({result:'real-bytes'},'thread'),options.importImage!({result:'real-bytes'},'thread')]);
      return 'thread';
    };
    const result=await generateCodexFallback({executable:'codex',env:{},prompt:'Jellyfish, 3:2',signal:new AbortController().signal,importImage:imported},run);
    expect(result.attachmentId).toBe(42);expect(imported).toHaveBeenCalledTimes(1);
    await expect(fs.stat(cwd)).rejects.toThrow();
  });
  it('does not treat a textual success as a generated image',async()=>{
    await expect(generateCodexFallback({executable:'codex',env:{},prompt:'Image',signal:new AbortController().signal,importImage:vi.fn()},async()=>'thread')).rejects.toThrow('did not return');
  });
  it('never starts generation when stopped',async()=>{
    const controller=new AbortController();controller.abort();const run=vi.fn();
    await expect(generateCodexFallback({executable:'codex',env:{},prompt:'Image',signal:controller.signal,importImage:vi.fn()},run)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it('cancels an active image child with its parent and cleans up',async()=>{
    const controller=new AbortController();let cwd='';
    const imported=vi.fn();
    const run:typeof runCodexTurn=async options=>{
      cwd=options.cwd;
      controller.abort(new Error('Parent stopped'));
      options.signal.throwIfAborted();
      return 'unreachable';
    };
    await expect(generateCodexFallback({executable:'codex',env:{},prompt:'Image',signal:controller.signal,importImage:imported},run)).rejects.toThrow('Parent stopped');
    expect(imported).not.toHaveBeenCalled();
    await expect(fs.stat(cwd)).rejects.toThrow();
  });
});
