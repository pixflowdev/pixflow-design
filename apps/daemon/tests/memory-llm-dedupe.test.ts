import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractWithLLM, __resetMemoryTurnDedupeForTests } from '../src/memory-llm.js';
import { memoryDir, writeMemoryConfig } from '../src/memory.js';

const dataDir = path.join(process.cwd(), '.tmp', 'memory-llm-dedupe-test');
const originalFetch = globalThis.fetch;

function okResponse(): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: '{"entries":[]}' } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('memory LLM turn deduplication', () => {
  beforeEach(async () => {
    await fsp.rm(memoryDir(dataDir), { recursive: true, force: true });
    __resetMemoryTurnDedupeForTests();
    await writeMemoryConfig(dataDir, {
      extraction: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
    });
    globalThis.fetch = vi.fn(async () => okResponse()) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does not mine the same completed turn twice in one conversation', async () => {
    const turn = { userMessage: 'Keep interfaces dark.', assistantMessage: 'Understood.' };
    const options = { projectRoot: process.cwd(), conversationId: 'conversation-1' };
    await extractWithLLM(dataDir, turn, options);
    await extractWithLLM(dataDir, turn, options);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('keeps identical turns independent across conversations', async () => {
    const turn = { userMessage: 'Keep interfaces dark.', assistantMessage: 'Understood.' };
    await extractWithLLM(dataDir, turn, { projectRoot: process.cwd(), conversationId: 'a' });
    await extractWithLLM(dataDir, turn, { projectRoot: process.cwd(), conversationId: 'b' });
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it('does not permanently mark a failed extraction as complete', async () => {
    let attempts = 0;
    globalThis.fetch = vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? new Response('temporary failure', { status: 500 })
        : okResponse();
    }) as typeof fetch;
    const turn = { userMessage: 'Ship on Friday.', assistantMessage: 'Noted.' };
    const options = { projectRoot: process.cwd(), conversationId: 'retryable' };
    await extractWithLLM(dataDir, turn, options);
    await extractWithLLM(dataDir, turn, options);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });
});
