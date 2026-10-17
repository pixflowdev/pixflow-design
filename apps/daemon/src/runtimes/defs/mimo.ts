import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const mimoAgentDef = {
  id: 'mimo',
  name: 'MiMo Code',
  bin: 'mimo',
  versionArgs: ['--version'],
  fallbackModels: [DEFAULT_MODEL_OPTION],
  buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
    const args = ['run', '--format', 'json'];
    if (options.model && options.model !== 'default') args.push('--model', options.model);
    return args;
  },
  promptViaStdin: true,
  streamFormat: 'json-event-stream',
  eventParser: 'opencode',
  externalMcpInjection: 'mimo-env-content',
} satisfies RuntimeAgentDef;
