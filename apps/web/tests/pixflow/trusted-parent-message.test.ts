import { describe, expect, it } from 'vitest';
import { isTrustedPixflowParentMessage as trusted } from '../../src/pixflow/trusted-parent-message';

describe('hosted configuration messages', () => {
  const parent = {} as Window;
  const frame = { parent };
  const message = { source: parent, origin: 'https://site.test' };
  it('accepts the configured WordPress parent', () => {
    expect(trusted(message, frame, 'https://site.test/wp-json/')).toBe(true);
  });
  it('rejects a child preview, sibling, wrong origin, opaque sender and standalone window', () => {
    expect(trusted({ ...message, source: {} as Window }, frame, message.origin)).toBe(false);
    expect(trusted({ ...message, origin: 'https://attacker.test' }, frame, message.origin)).toBe(false);
    expect(trusted({ ...message, origin: 'null' }, frame, message.origin)).toBe(false);
    expect(trusted(message, frame, undefined)).toBe(false);
    const standalone = { parent: null as unknown as Window };
    standalone.parent = standalone as Window;
    expect(trusted({ ...message, source: standalone as Window }, standalone, message.origin)).toBe(false);
  });
});
