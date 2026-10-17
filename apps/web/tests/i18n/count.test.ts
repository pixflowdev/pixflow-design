import { describe, expect, it } from 'vitest';
import { countMessageKey } from '../../src/i18n/count';

describe('annotation counts', () => {
  it('uses each Arabic plural category', () => {
    for (const [count, category] of [[0, 'zero'], [1, 'one'], [2, 'two'], [3, 'few'], [11, 'many'], [100, 'other']] as const) {
      expect(countMessageKey('annotationCount', 'ar', count)).toBe(`annotationCount.${category}`);
    }
  });
  it('distinguishes Slavic counts and East Asian invariant labels', () => {
    expect(countMessageKey('annotationCount', 'pl', 2)).toBe('annotationCount.few');
    expect(countMessageKey('annotationCount', 'pl', 12)).toBe('annotationCount.many');
    expect(countMessageKey('annotationCount', 'ru', 21)).toBe('annotationCount.one');
    expect(countMessageKey('annotationCount', 'ja', 1)).toBe('annotationCount.other');
    expect(countMessageKey('annotationCount', 'en', 1)).toBe('annotationCount.one');
  });
});
