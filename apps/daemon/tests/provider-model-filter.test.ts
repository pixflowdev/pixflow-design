import { describe, expect, it } from 'vitest';

import { isOpenAiChatModelId } from '../src/providerModels.js';

describe('OpenAI-compatible chat model filtering', () => {
  it('keeps chat models', () => {
    expect(isOpenAiChatModelId('deepseek-ai/DeepSeek-V3')).toBe(true);
    expect(isOpenAiChatModelId('gpt-5.2-codex')).toBe(true);
  });

  it('excludes embedding, reranking, and media-only models', () => {
    for (const id of [
      'BAAI/bge-large-en-v1.5',
      'BAAI/bge-reranker-v2-m3',
      'text-embedding-3-large',
      'gpt-image-1',
      'whisper-1',
      'wan-2.2-t2v',
    ]) {
      expect(isOpenAiChatModelId(id), id).toBe(false);
    }
  });
});
