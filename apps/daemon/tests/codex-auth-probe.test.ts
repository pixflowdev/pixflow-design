import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  extractCodexProviderEnvKey,
  normalizeCodexConfigContent,
} from '../src/codex-config-normalize.js';
import { probeAgentAuthStatus } from '../src/runtimes/auth.js';

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Codex shared config compatibility', () => {
  it('reads the selected custom provider env key without using another provider table', () => {
    const config = `model_provider = "azure"

[model_providers.openai]
env_key = "OPENAI_API_KEY"

[model_providers.azure]
env_key = "AZURE_OPENAI_API_KEY"
`;
    expect(extractCodexProviderEnvKey(config)).toBe('AZURE_OPENAI_API_KEY');
  });

  it('removes only invalid service tiers and nested feature tables', () => {
    const config = `model = "gpt-5.5"
service_tier = "priority"
[features]
web_search = true
[features.legacy]
enabled = true
[model_providers.openai]
env_key = "OPENAI_API_KEY"
`;
    expect(normalizeCodexConfigContent(config)).toBe(`model = "gpt-5.5"
[features]
web_search = true
[model_providers.openai]
env_key = "OPENAI_API_KEY"
`);
  });

  it('accepts direct and custom-provider API keys before a login-status probe', async () => {
    const def = {
      id: 'codex',
      name: 'Codex CLI',
      authProbe: { args: ['login', 'status'] },
    };
    await expect(probeAgentAuthStatus(def, 'definitely-missing-codex-bin', {
      OPENAI_API_KEY: 'configured',
    })).resolves.toEqual({ status: 'ok' });

    const codexHome = mkdtempSync(join(tmpdir(), 'pixflow-codex-home-'));
    temporaryDirs.push(codexHome);
    writeFileSync(join(codexHome, 'config.toml'), `model_provider = "azure"
[model_providers.azure]
env_key = "AZURE_OPENAI_API_KEY"
`);
    await expect(probeAgentAuthStatus(def, 'definitely-missing-codex-bin', {
      CODEX_HOME: codexHome,
      AZURE_OPENAI_API_KEY: 'configured',
    })).resolves.toEqual({ status: 'ok' });
  });
});
