import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { createPixflowSharedAppConfigNotification } from '../../src/pixflow/shared-app-config-notification';

it('publishes saved workspace execution choices to other tabs, without credentials or failed writes', async () => {
  const source = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function syncPixflowWordPressAppConfig('), source.indexOf('function mergeAmrModelsIntoAgents('));
  const publish = vi.fn();
  const request = vi.fn(async () => ({ ok: true, body: {} }));
  const window = { dispatchEvent: vi.fn() };
  const save = runInNewContext(ts.transpileModule(fn + '\nsyncPixflowWordPressAppConfig;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    window, CustomEvent, isPixflowWordPressEmbed: () => true, getPixflowBuilderPostId: () => null,
    requestWordPressRest: request, buildPixflowWordPressAppConfigPrefs: (value: unknown) => value,
    createPixflowSharedAppConfigNotification, publishPixflowSharedAppConfigNotification: publish,
  });
  await save({ mode: 'api', model: 'selected-model', apiKey: 'private' });
  expect(publish).toHaveBeenCalledOnce();
  expect(publish.mock.calls[0]?.[0]?.patch).toEqual({ mode: 'api', model: 'selected-model' });
  request.mockResolvedValueOnce({ ok: false, body: {} });
  await expect(save({ mode: 'daemon' })).rejects.toThrow('Could not save');
  expect(publish).toHaveBeenCalledOnce();
});

it('relays incoming tab preferences to the host Bridge and mounted controls', () => {
  const source = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const unsubscribeSharedConfig = subscribePixflowSharedAppConfigNotifications(');
  const subscription = source.slice(start, source.indexOf('return () => {', start));
  const dispatchEvent = vi.fn();
  runInNewContext(subscription, {
    window: { dispatchEvent }, CustomEvent, APP_CONFIG_CHANGED_EVENT: 'open-design:app-config-changed',
    subscribePixflowSharedAppConfigNotifications: (receive: (value: unknown) => void) => receive({ patch: { mode: 'daemon' } }),
  });
  expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: 'open-design:app-config-changed', detail: { mode: 'daemon' } });
});
