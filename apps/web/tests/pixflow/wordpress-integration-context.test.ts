import { afterEach, expect, it, vi } from 'vitest';
import { getPixflowWordPressConfig } from '../../src/pixflow/wordpress-context';
afterEach(() => vi.unstubAllGlobals());
it.each([['', false], ['1', true], [false, false], [true, true]])('normalizes the localized module flag %s', (flag, expected) => {
  vi.stubGlobal('window', { __PIXFLOW_DESIGN_WORDPRESS__: { runtime: 'wordpress', bricksIntegrationActive: flag }, sessionStorage: { setItem() {} } });
  expect(getPixflowWordPressConfig()?.bricksIntegrationActive).toBe(expected);
});
