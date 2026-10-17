// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { applyBuilderContext, builderClient, registerBuilderClient } from '../../src/pixflow/builder-client-extensions';

afterEach(() => { delete (window as any).pixflowBuilderExtensions; });
it('runs core without loading an absent add-on and fails explicitly for a premium service', () => {
  const context = { editor: 'gutenberg', object: { id: 42 } };
  expect(applyBuilderContext(context)).toBe(context);
  expect(() => builderClient('etch')).toThrow('Activate Pixflow Design Pro');
});
it.each(['etch', 'elementor'] as const)('uses the originating %s contribution without changing another editor context', builder => {
  const change = vi.fn(context => ({ ...context, object: { id: 90 } }));
  registerBuilderClient(builder, { context: change });
  expect(applyBuilderContext({ editor: builder, object: { id: 42 } }).object.id).toBe(90);
  expect(applyBuilderContext({ editor: 'gutenberg', object: { id: 42 } }).object.id).toBe(42);
  expect(change).toHaveBeenCalledTimes(1);
  expect(() => registerBuilderClient(builder, {})).toThrow('already registered');
});
