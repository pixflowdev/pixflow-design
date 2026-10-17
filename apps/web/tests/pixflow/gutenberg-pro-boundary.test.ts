// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { assertIntegrationTree, integrationInput, prepareIntegrationBlocks, integrationStyles } from '../../src/pixflow/gutenberg-extensions';
afterEach(() => { delete (window as Window & { PixflowGutenbergExtensions?: unknown }).PixflowGutenbergExtensions; });
it('Free preserves reading but rejects GenerateBlocks authoring without loading its implementation', async () => {
  const original = { color: 'green' };
  expect(integrationInput('core/heading', original, true)).toBe(original);
  expect(() => integrationInput('generateblocks/text', {}, true)).toThrow('Pro');
  expect(() => assertIntegrationTree([{name:'core/group',innerBlocks:[{name:'generateblocks-pro/tabs'}]}])).toThrow('Pro');
  await expect(prepareIntegrationBlocks([{name:'generateblocks/query'}])).rejects.toThrow('Pro');
  expect(() => integrationStyles({} as any, {action:'list'})).toThrow('Pro');
});
