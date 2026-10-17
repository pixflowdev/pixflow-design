/**
 * Historical Stage A compatibility facade.
 *
 * Ordinary Build contracts are implemented by
 * `pixflow-build-in-bricks-context.ts`. Older persisted readers and
 * Prototype/Clone callers may continue importing the historical symbols from
 * this module, but no new Build implementation should import this facade.
 */
export * from './pixflow-build-in-bricks-context.js';
