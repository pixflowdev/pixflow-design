import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeModelOption } from '../types.js';
import type { RuntimeAgentDef } from '../types.js';

const GROK_MODEL_ID_RE = /^\*?\s*-?\s*(grok-[a-z0-9][a-z0-9._-]*)(?:\s+\(default\))?\s*$/i;

/** Picker choices and CLI arguments must agree on the model's supported efforts.
 * Unknown/custom models and CLI-config defaults retain their own configuration.
 * https://docs.x.ai/developers/model-capabilities/text/reasoning
 */
function grokReasoningOptions(model: string | null | undefined): NonNullable<RuntimeModelOption['reasoningOptions']> {
  if (!model) return [];
  const levels = /^grok-4\.[67](?:-build(?:-fast)?)?$/.test(model)
    ? ['low', 'medium', 'high', 'xhigh']
    : /^grok-4\.5(?:-build)?$/.test(model)
      ? ['low', 'medium', 'high']
      : [];
  return levels.length ? [
    { id: 'default', label: 'Default (Grok)' },
    ...levels.map((id) => ({ id, label: id === 'xhigh' ? 'Extra high' : id.charAt(0).toUpperCase() + id.slice(1) })),
  ] : [];
}

export function parseGrokBuildModels(stdout: string): RuntimeModelOption[] {
  const seen = new Set<string>();
  const out: RuntimeModelOption[] = [{ ...DEFAULT_MODEL_OPTION, reasoningOptions: [] }];
  for (const rawLine of String(stdout || '').split('\n')) {
    const match = rawLine.trim().match(GROK_MODEL_ID_RE);
    const id = match?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: id, reasoningOptions: grokReasoningOptions(id) });
  }
  return out;
}

// xAI's first-party CLI agent — https://x.ai/cli — distributed as the
// `grok` binary. Installed via `curl -fsSL https://x.ai/cli/install.sh | bash`,
// which symlinks `~/.grok/bin/grok` into PATH.
//
// `grok` ships its own SuperGrok OAuth dance (same `auth.x.ai` issuer +
// loopback-redirect shape Pixflow Design's xAI Settings panel uses), so it's
// already authenticated by the time OD detects the binary; OD does not
// need to inject credentials. Users authenticate once with `grok login
// --oauth` and the resulting `~/.grok/auth.json` is what every spawned
// invocation reads.
//
// Headless mode uses `--prompt-file <PATH>` because recent Grok CLI builds
// require `-p/--single` to receive the prompt as an argv value and no longer
// read piped stdin. OD's composed prompts often exceed safe argv limits, so
// the daemon stages the prompt in a temp file and passes that path here. The
// Native streaming-json is normalized by grok-events.ts for both regular
// chat and WordPress Direct runs. Plain output cannot carry tool progress.
export const grokBuildAgentDef = {
  id: 'grok-build',
  name: 'Grok Build',
  bin: 'grok',
  versionArgs: ['--version'],
  helpArgs: ['-p', '--help'],
  // `grok models` prints status/header lines plus bullet-prefixed model ids.
  // Keep only concrete `grok-*` ids so UI pickers don't show prose such as
  // "You are logged in with grok.com" as selectable model names.
  listModels: {
    args: ['models'],
    timeoutMs: 10_000,
    parse: parseGrokBuildModels,
  },
  // A failed catalogue request must not advertise retired or unavailable models.
  fallbackModels: [{ ...DEFAULT_MODEL_OPTION, reasoningOptions: [] }],
  // Grok Build CLI v0.1.212+ enforces `-p, --single <PROMPT>` as value-
  // required, while normal OD composed prompts exceed safe argv budgets.
  // Use the CLI's explicit prompt-file transport instead.
  buildArgs: (_prompt, _imagePaths, _extra = [], options = {}, runtimeContext = {}) => {
    if (!runtimeContext.promptFilePath) {
      throw new Error('grok-build requires runtimeContext.promptFilePath');
    }
    const args = ['--prompt-file', runtimeContext.promptFilePath, '--output-format', 'streaming-json'];
    if (runtimeContext.resumeSessionId) args.push('--resume', runtimeContext.resumeSessionId);
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    if (options.reasoning && options.reasoning !== 'default' && grokReasoningOptions(options.model).some(({ id }) => id === options.reasoning)) {
      args.push('--effort', options.reasoning);
    }
    return args;
  },
  reasoningOptions: [],
  modelReasoningOptions: grokReasoningOptions,
  promptViaFile: true,
  promptViaStdin: false,
  streamFormat: 'json-event-stream',
  eventParser: 'grok-build',
  resumesSessionViaCli: true,
  capturesSessionIdFromStream: true,
  installUrl: 'https://x.ai/cli',
  docsUrl: 'https://x.ai/cli',
} satisfies RuntimeAgentDef;
