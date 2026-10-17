import path from 'node:path';

import { DEFAULT_MODEL_OPTION, execAgentFile } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

const ANTIGRAVITY_MODEL_IDS = [
  'gemini-3.6-flash-high',
  'gemini-3.6-flash-medium',
  'gemini-3.6-flash-low',
  'gemini-3.5-flash-high',
  'gemini-3.5-flash-medium',
  'gemini-3.5-flash-low',
  'gemini-3.1-pro-high',
  'gemini-3.1-pro-low',
  'claude-sonnet-4-6',
  'claude-opus-4-6-thinking',
  'gpt-oss-120b-medium',
] as const;

const LEGACY_MODEL_IDS: Record<string, string> = {
  'Gemini 3.1 Pro (High)': 'gemini-3.1-pro-high',
  'Gemini 3.1 Pro (Low)': 'gemini-3.1-pro-low',
  'Gemini 3.5 Flash (High)': 'gemini-3.5-flash-high',
  'Gemini 3.5 Flash (Medium)': 'gemini-3.5-flash-medium',
  'Gemini 3.5 Flash (Low)': 'gemini-3.5-flash-low',
  'Claude Sonnet 4.6 (Thinking)': 'claude-sonnet-4-6',
  'Claude Opus 4.6 (Thinking)': 'claude-opus-4-6-thinking',
  'GPT-OSS 120B (Medium)': 'gpt-oss-120b-medium',
};

function normalizeAntigravityModelId(model: string): string {
  return LEGACY_MODEL_IDS[model] ?? model;
}

function modelOptionsFromOutput(stdout: string): RuntimeModelOption[] | null {
  const seen = new Set<string>();
  const models = String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[a-z0-9][a-z0-9._-]+$/i.test(line))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => ({ id, label: id }));
  return models.length > 0 ? [DEFAULT_MODEL_OPTION, ...models] : null;
}

export const antigravityAgentDef = {
  id: 'antigravity',
  name: 'Antigravity',
  bin: 'agy',
  versionArgs: ['--version'],
  fetchModels: async (resolvedBin, env) => {
    try {
      const { stdout } = await execAgentFile(resolvedBin, ['models'], {
        env,
        // Agent detection has a 7s fault-isolation budget. agy model
        // enumeration is a comparatively expensive cold start (and may
        // consult the authenticated account), so fail open to the complete
        // native fallback list before a slow model scan can incorrectly
        // mark the otherwise-invocable CLI as unavailable.
        timeout: 5_000,
        maxBuffer: 1024 * 1024,
      });
      return modelOptionsFromOutput(String(stdout));
    } catch {
      return null;
    }
  },
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    ...ANTIGRAVITY_MODEL_IDS.map((id) => ({ id, label: id })),
  ],
  supportsCustomModel: false,
  reasoningOptions: [
    { id: 'default', label: 'Default' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
  ],
  buildArgs: (
    _prompt,
    _imagePaths,
    extraAllowedDirs = [],
    options = {},
    runtimeContext = {},
  ) => {
    const promptFilePath = runtimeContext.promptFilePath;
    if (!promptFilePath || !path.isAbsolute(promptFilePath)) {
      throw new Error('Antigravity requires an absolute daemon-managed prompt file.');
    }

    const args: string[] = ['--output-format', 'stream-json'];
    if (runtimeContext.agentLogFilePath) {
      args.push('--log-file', runtimeContext.agentLogFilePath);
    }
    args.push(
      '-p',
      `Read the complete user request from this UTF-8 file and follow it exactly: ${promptFilePath}`,
      '--dangerously-skip-permissions',
    );

    // agy treats the first --add-dir as its primary writable workspace even
    // when the child process cwd points at the managed project. Keep the
    // canonical project first; otherwise source files land beside the
    // daemon-managed prompt in a temporary directory that is deleted after
    // the run. The prompt directory remains available for read access.
    const allowedDirs = [
      runtimeContext.cwd,
      path.dirname(promptFilePath),
      ...extraAllowedDirs,
    ]
      .filter((value): value is string => typeof value === 'string' && path.isAbsolute(value));
    for (const dir of [...new Set(allowedDirs)]) {
      args.push('--add-dir', dir);
    }

    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', normalizeAntigravityModelId(options.model));
    }
    if (options.reasoning && options.reasoning !== 'default') {
      args.push('--effort', options.reasoning);
    }
    return args;
  },
  // agy 1.1.5 requires the value of `-p` in argv and ignores stdin. The
  // daemon-owned prompt file keeps large workspace/skill prompts out of the
  // Windows command line while the short argv instruction remains stable.
  promptViaFile: true,
  streamFormat: 'json-event-stream',
  installUrl: 'https://antigravity.google/cli',
  docsUrl: 'https://antigravity.google/docs/cli-overview',
} satisfies RuntimeAgentDef;
