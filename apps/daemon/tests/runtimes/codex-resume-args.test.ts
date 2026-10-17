import { describe, expect, it } from 'vitest';
import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import { resolveProbedInputCapabilities } from '../../src/runtimes/detection.js';
import {
  codexAgentDef,
  parseCodexDebugModels,
} from '../../src/runtimes/defs/codex.js';
import {
  getRememberedLiveModels,
  modelSupportsFastMode,
  rememberLiveModels,
} from '../../src/runtimes/models.js';

describe('codex buildArgs session resume', () => {
  const threadId = '019eef4f-7409-7c82-bebe-30504eed3959';

  it('uses plain exec with create-only path grants on a new session', () => {
    const args = codexAgentDef.buildArgs('prompt', [], ['C:/extra'], {}, {
      cwd: 'C:/project',
      newSessionId: '11111111-1111-4111-8111-111111111111',
      resumeSessionId: null,
    });
    expect(args[0]).toBe('exec');
    expect(args).not.toContain('resume');
    expect(args).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(args[args.indexOf('-C') + 1]).toBe('C:/project');
    expect(args[args.indexOf('--add-dir') + 1]).toBe('C:/extra');
  });

  it('uses the Windows-compatible unsandboxed flag when resuming a captured thread', () => {
    const args = codexAgentDef.buildArgs('prompt', [], ['C:/extra'], {
      model: 'gpt-5.5',
      reasoning: 'medium',
    }, {
      cwd: 'C:/project',
      resumeSessionId: threadId,
    });
    expect(args.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(args.at(-1)).toBe(threadId);
    expect(args).not.toContain('--sandbox');
    expect(args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(args.some((arg) => arg.startsWith('sandbox_mode='))).toBe(false);
    expect(args).not.toContain('default_permissions=":workspace"');
    expect(args).not.toContain('-C');
    expect(args).not.toContain('--add-dir');
    expect(args.indexOf('--model')).toBeLessThan(args.indexOf(threadId));
  });

  it('declares capture-style CLI session resume', () => {
    expect(codexAgentDef.resumesSessionViaCli).toBe(true);
    expect(codexAgentDef.capturesSessionIdFromStream).toBe(true);
  });

  it('forwards Fast mode as the Codex service tier alongside model and reasoning', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {
      model: 'gpt-5.6-luna',
      reasoning: 'medium',
      fastMode: true,
    }, { cwd: 'C:/project' });

    expect(args).toContain('--model');
    expect(args).toContain('gpt-5.6-luna');
    expect(args).toContain('model_reasoning_effort="medium"');
    expect(args).toContain('service_tier="fast"');
  });

  it('forwards verified native image inputs on new and resumed runs', () => {
    agentCapabilities.set('codex', { imageInput: true });
    try {
      const imagePaths = ['C:/captures/desktop.png', 'C:/captures/mobile.png'];
      const initial = codexAgentDef.buildArgs('prompt', imagePaths, [], {
        model: 'gpt-5.4',
      }, {
        cwd: 'C:/project',
      });
      const resumed = codexAgentDef.buildArgs('prompt', imagePaths, [], {
        model: 'gpt-5.4',
      }, {
        cwd: 'C:/project',
        resumeSessionId: threadId,
      });

      expect(initial.slice(initial.indexOf('--image'), initial.indexOf('--image') + 3)).toEqual([
        '--image',
        ...imagePaths,
      ]);
      expect(resumed.slice(resumed.indexOf('--image'), resumed.indexOf('--image') + 3)).toEqual([
        '--image',
        ...imagePaths,
      ]);
    } finally {
      agentCapabilities.delete('codex');
    }
  });

  it('fails closed when the installed Codex help probe did not verify --image', () => {
    agentCapabilities.set('codex', { imageInput: false });
    try {
      const args = codexAgentDef.buildArgs('prompt', ['C:/captures/mobile.png'], [], {}, {
        cwd: 'C:/project',
      });
      expect(args).not.toContain('--image');
      expect(args).not.toContain('C:/captures/mobile.png');
    } finally {
      agentCapabilities.delete('codex');
    }
  });
});

describe('Codex live model input capabilities', () => {
  it('derives Fast eligibility from the live CLI catalogue, including priority aliases', () => {
    const models = parseCodexDebugModels(JSON.stringify({
      models: [
        { slug: 'gpt-5.6-luna', additional_speed_tiers: ['fast'] },
        { slug: 'gpt-5.6-terra', service_tiers: [{ id: 'priority', name: 'Fast' }] },
        { slug: 'gpt-5.4-mini', additional_speed_tiers: [] },
      ],
    }))!;

    rememberLiveModels('codex', models);
    expect(modelSupportsFastMode(codexAgentDef, 'gpt-5.6-luna')).toBe(true);
    expect(modelSupportsFastMode(codexAgentDef, 'gpt-5.6-terra')).toBe(true);
    expect(modelSupportsFastMode(codexAgentDef, 'gpt-5.4-mini')).toBe(false);
    expect(modelSupportsFastMode(codexAgentDef, 'custom-unverified')).toBe(false);
    expect(
      getRememberedLiveModels('codex').find((model) => model.id === 'gpt-5.6-luna')
        ?.metadata?.serviceTiers,
    ).toEqual(['fast']);
  });

  it('preserves authoritative input_modalities and explicit text-only denial', () => {
    const models = parseCodexDebugModels(JSON.stringify({
      models: [
        {
          slug: 'vision-model',
          display_name: 'Vision model',
          input_modalities: ['text', 'image'],
        },
        {
          slug: 'text-model',
          display_name: 'Text model',
          input_modalities: ['text'],
        },
      ],
    }));

    expect(models?.find((model) => model.id === 'vision-model')?.metadata?.inputCapabilities).toEqual({
      text: true,
      imageInput: true,
      fileInput: true,
      source: 'runtime',
    });
    expect(models?.find((model) => model.id === 'text-model')?.metadata?.inputCapabilities).toEqual({
      text: true,
      imageInput: false,
      fileInput: false,
      source: 'runtime',
    });
  });

  it('publishes adapter support only after the installed --image probe succeeds', () => {
    expect(resolveProbedInputCapabilities(codexAgentDef, { imageInput: true }, 'codex-cli 0.145.0')).toEqual({
      text: true,
      imageInput: true,
      fileInput: true,
      source: 'verified_probe',
      revision: 'codex-cli 0.145.0',
    });
    expect(resolveProbedInputCapabilities(codexAgentDef, { imageInput: false }, 'older')).toEqual({
      text: true,
      imageInput: false,
      fileInput: false,
      source: 'verified_probe',
      revision: 'older',
    });
  });
});
