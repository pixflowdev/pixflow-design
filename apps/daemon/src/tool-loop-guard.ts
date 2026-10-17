/**
 * Detects autonomous agents that repeatedly execute failing tool calls.
 *
 * The guard is run-scoped and consumes the normalized tool_use/tool_result
 * events shared by every CLI adapter. Warn mode is deliberately the default:
 * users see a useful warning without a heuristic terminating their work.
 * Operators can opt into a bounded hard stop with OD_TOOL_LOOP_GUARD=halt.
 */
export type ToolLoopReason = 'consecutive-errors' | 'repeated-failure';
export type ToolLoopAction = 'warn' | 'halt';
export type ToolLoopMode = 'off' | 'warn' | 'halt';

export interface ToolLoopVerdict {
  type: 'tool_loop';
  reason: ToolLoopReason;
  action: ToolLoopAction;
  toolName: string;
  signature: string;
  count: number;
}

export interface ToolLoopGuardOptions {
  warnConsecutive?: number;
  haltConsecutive?: number;
  warnRepeat?: number;
  haltRepeat?: number;
  mode?: ToolLoopMode;
}

export interface ToolLoopGuard {
  observeToolUse(id: string, name: string, input: unknown): void;
  observeToolResult(toolUseId: string, isError: boolean, content?: string): ToolLoopVerdict | null;
  readonly warned: boolean;
  readonly halted: boolean;
}

const DEFAULTS = {
  warnConsecutive: 5,
  haltConsecutive: 10,
  warnRepeat: 4,
  haltRepeat: 8,
} as const;
const MAX_TRACKED = 512;
const SIGNATURE_MAX_LENGTH = 160;

const READ_ONLY_TOOLS = new Set([
  'read',
  'glob',
  'ls',
  'grep',
  'notebookread',
  'webfetch',
  'websearch',
  'todowrite',
  'askuserquestion',
]);
const SHELL_TOOLS = new Set([
  'bash',
  'shell',
  'sh',
  'run_command',
  'run_terminal_cmd',
  'execute_command',
  'terminal',
]);
const READ_ONLY_BINARIES = new Set([
  'cat',
  'ls',
  'grep',
  'rg',
  'egrep',
  'fgrep',
  'head',
  'tail',
  'pwd',
  'echo',
  'printf',
  'which',
  'type',
  'wc',
  'stat',
  'file',
  'tree',
  'diff',
  'jq',
  'awk',
  'date',
  'test',
  'true',
  'false',
  'basename',
  'dirname',
  'realpath',
  'readlink',
  'cut',
  'sort',
  'uniq',
  'column',
  'cmp',
]);

function compact(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function shellHead(segment: string): string {
  const match = segment.trim().match(/^[A-Za-z0-9_./-]+/u);
  return (match?.[0] ?? '').toLowerCase().replace(/^.*\//u, '');
}

function unwrapEnvPrefix(segment: string): string {
  let rest = segment.trim();
  while (shellHead(rest) === 'env') {
    const tokens = rest.replace(/^\s*(?:[A-Za-z0-9_./-]*\/)?env\b/u, '').trim().split(/\s+/u);
    let index = 0;
    while (index < tokens.length) {
      const token = tokens[index] ?? '';
      if (token === '-u' || token === '--unset') {
        index += 2;
      } else if (token.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
        index += 1;
      } else {
        break;
      }
    }
    const next = tokens.slice(index).join(' ');
    if (next === rest) break;
    rest = next;
  }
  return rest;
}

export function isReadOnlyShellCommand(command: string): boolean {
  const source = String(command ?? '').trim();
  if (!source) return false;
  const redirections = source
    .replace(/\d*>\s*\/dev\/null/gu, '')
    .replace(/\d*>&\d+/gu, '');
  if (/>/u.test(redirections)) return false;

  for (const rawSegment of source.split(/\|\||&&|[;|]/u)) {
    const segment = unwrapEnvPrefix(rawSegment);
    if (!segment) continue;
    const head = shellHead(segment);
    if (!head) return false;
    if (head === 'find') {
      if (/\s-(?:delete|exec|execdir|ok|okdir|fprint\w*|fls)\b/u.test(segment)) return false;
      continue;
    }
    if (head === 'sed' || head === 'perl') {
      if (/\s-[a-z]*i|\s--in-place/iu.test(segment)) return false;
      continue;
    }
    if (head === 'git') {
      if (/\bgit\s+(status|diff|log|show|branch|ls-files|rev-parse|describe|blame|cat-file|remote)\b/u.test(segment)) {
        continue;
      }
      return false;
    }
    if (!READ_ONLY_BINARIES.has(head)) return false;
  }
  return true;
}

export function computeToolSignature(name: string, input: unknown): string {
  const toolName = name || 'tool';
  let detail = '';
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const command = record.command;
    const filePath = record.file_path ?? record.filePath ?? record.path;
    const oldString = record.old_string ?? record.oldString;
    if (typeof command === 'string') {
      detail = command;
    } else if (typeof filePath === 'string') {
      detail = typeof oldString === 'string' ? `${filePath} :: ${oldString}` : filePath;
    } else {
      try {
        const serialized = JSON.stringify(record) ?? '';
        detail = serialized === '{}' ? '' : serialized;
      } catch {
        detail = '';
      }
    }
  } else if (typeof input === 'string') {
    detail = input;
  }
  return detail ? `${toolName} ${compact(detail)}` : toolName;
}

export function isProgressSuccess(name: string, signature: string): boolean {
  const lowerName = String(name ?? '').trim().toLowerCase();
  if (READ_ONLY_TOOLS.has(lowerName)) return false;
  if (!SHELL_TOOLS.has(lowerName)) return true;
  const prefix = `${name} `;
  const command = signature.startsWith(prefix) ? signature.slice(prefix.length) : signature;
  return !isReadOnlyShellCommand(command);
}

function displaySignature(signature: string): string {
  return signature.length > SIGNATURE_MAX_LENGTH
    ? `${signature.slice(0, SIGNATURE_MAX_LENGTH - 1)}…`
    : signature;
}

function evictOldest<K, V>(map: Map<K, V>): void {
  while (map.size > MAX_TRACKED) {
    const oldest = map.keys().next().value as K | undefined;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function createToolLoopGuard(options: ToolLoopGuardOptions = {}): ToolLoopGuard {
  const mode = options.mode ?? 'warn';
  const warnConsecutive = options.warnConsecutive ?? DEFAULTS.warnConsecutive;
  const haltConsecutive = options.haltConsecutive ?? DEFAULTS.haltConsecutive;
  const warnRepeat = options.warnRepeat ?? DEFAULTS.warnRepeat;
  const haltRepeat = options.haltRepeat ?? DEFAULTS.haltRepeat;
  const uses = new Map<string, { name: string; signature: string }>();
  const failureCounts = new Map<string, number>();
  let consecutiveErrors = 0;
  let warned = false;
  let halted = false;

  return {
    get warned() {
      return warned;
    },
    get halted() {
      return halted;
    },
    observeToolUse(id, name, input) {
      if (mode === 'off' || halted || !id) return;
      uses.set(id, { name: name || 'tool', signature: computeToolSignature(name, input) });
      evictOldest(uses);
    },
    observeToolResult(toolUseId, isError, content) {
      if (mode === 'off' || halted) return null;
      const use = toolUseId ? uses.get(toolUseId) : undefined;
      if (toolUseId) uses.delete(toolUseId);

      if (!isError) {
        consecutiveErrors = 0;
        if (use && isProgressSuccess(use.name, use.signature)) failureCounts.clear();
        else if (use) failureCounts.delete(use.signature);
        return null;
      }

      const toolName = use?.name ?? 'tool';
      const signature = use?.signature
        ?? computeToolSignature(toolName, typeof content === 'string' ? content : undefined);
      consecutiveErrors += 1;
      const repeatCount = (failureCounts.get(signature) ?? 0) + 1;
      failureCounts.set(signature, repeatCount);
      evictOldest(failureCounts);

      if (mode === 'halt' && (repeatCount >= haltRepeat || consecutiveErrors >= haltConsecutive)) {
        warned = true;
        halted = true;
        const repeated = repeatCount >= haltRepeat;
        return {
          type: 'tool_loop',
          reason: repeated ? 'repeated-failure' : 'consecutive-errors',
          action: 'halt',
          toolName,
          signature: displaySignature(signature),
          count: repeated ? repeatCount : consecutiveErrors,
        };
      }
      if (!warned && (repeatCount >= warnRepeat || consecutiveErrors >= warnConsecutive)) {
        warned = true;
        const repeated = repeatCount >= warnRepeat;
        return {
          type: 'tool_loop',
          reason: repeated ? 'repeated-failure' : 'consecutive-errors',
          action: 'warn',
          toolName,
          signature: displaySignature(signature),
          count: repeated ? repeatCount : consecutiveErrors,
        };
      }
      return null;
    },
  };
}

export function resolveToolLoopMode(env: NodeJS.ProcessEnv = process.env): ToolLoopMode {
  const raw = String(env.OD_TOOL_LOOP_GUARD ?? '').trim().toLowerCase();
  return raw === 'off' || raw === 'warn' || raw === 'halt' ? raw : 'warn';
}
