import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { configureComposioConfigStore, writeComposioConfig } from '../src/connectors/composio-config.js';
import { configureComposioSkillRoot, composioSkillPrompt } from '../src/connectors/skill.js';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pixflow-composio-absence-'));
  configureComposioConfigStore(directory);
  configureComposioSkillRoot(path.join(directory, 'absent'));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

it('fails closed when paid guidance is absent or saved configuration is unreadable', () => {
  expect(composioSkillPrompt()).toBe('');
  writeComposioConfig({ apiKey: 'local-fixture' });
  expect(composioSkillPrompt()).toBe('');
  fs.writeFileSync(path.join(directory, 'connectors', 'composio-config.json'), '{invalid');
  expect(composioSkillPrompt()).toBe('');
});
