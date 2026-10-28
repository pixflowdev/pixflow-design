import { expect, it } from 'vitest';
import { conversationBinding, conversationSessionKey } from '../../src/pixflow/conversation-address';

it('round-trips the exact Workspace address without creating a new transcript identity', () => {
  const binding = { projectId: '12345678-1234-1234-1234-123456789abc', conversationId: 'saved:chat/é' };
  expect(conversationBinding(conversationSessionKey(binding))).toEqual(binding);
});

it('leaves legacy editor addresses alone and rejects malformed addresses', () => {
  for (const key of ['bricks:123', 'pixflow-direct:site:1', 'pixflow:conversation:v1:x:y', 'pixflow:conversation:v1:%:a']) {
    expect(conversationBinding(key)).toBeNull();
  }
});
