import { describe, expect, it } from 'vitest';
import { validateBoundedJsonObject } from '../src/live-artifacts/schema.js';

describe('connector text bodies', () => {
  it('allows bounded text bodies only in connector inputs', () => {
    const input = { title: 'QA', body: 'Temporary integration test — steering verified.' };
    expect(validateBoundedJsonObject(input, 'input', { allowTextBody: true }).ok).toBe(true);
    expect(validateBoundedJsonObject(input, 'input').ok).toBe(false);
  });
  it.each([
    { body: { headers: { authorization: 'secret' } } },
    { body: 'x'.repeat(100_000) },
    { body: 'QA', token: 'secret' },
    JSON.parse('{"__proto__":{"admin":true}}'),
  ])('retains bounds and reserved-key protections: %j', input => {
    expect(validateBoundedJsonObject(input, 'input', { allowTextBody: true }).ok).toBe(false);
  });
});
