import type { Dict } from '../../i18n/types';

type Translate = (key: keyof Dict) => string;
export type ActivityAction = 'browser' | 'edit' | 'read' | 'search' | 'command' | 'tools';
type Action = ActivityAction;
const aliases: Record<string, Action> = {
  bash: 'command', shell: 'command', run_shell_command: 'command', exec_command: 'command', shell_command: 'command', execute_command: 'command', run_terminal_cmd: 'command',
  execute: 'command', run_command: 'command', run_in_terminal: 'command', terminal: 'command',
  write_to_file: 'edit', replace_file_content: 'edit', edit: 'edit', write: 'edit', write_file: 'edit', create_file: 'edit', apply_patch: 'edit',
  str_replace_edit: 'edit', str_replace: 'edit', search_replace: 'edit', replace: 'edit', multiedit: 'edit',
  read: 'read', read_file: 'read', read_many_files: 'read', view_file: 'read',
  glob: 'search', grep: 'search', search: 'search', list_files: 'search',
  websearch: 'search', web_search: 'search', search_files: 'search',
  browser: 'browser',
};
function record(input: unknown): Record<string, unknown> {
  return input != null && typeof input === 'object' ? input as Record<string, unknown> : {};
}
function short(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}
export function activityAction(name: string): Action {
  const normalized = name.toLowerCase();
  if (/(?:^|[._:/-])(?:browser|playwright|puppeteer|cua)(?:[._:/-]|$)/.test(normalized)) return 'browser';
  return aliases[normalized] ?? aliases[normalized.split(/__|[.:/]/).at(-1)!] ?? 'tools';
}
/** Uses event metadata only; never exposes a shell command or guesses its outcome. */
export function liveActivityLabel(name: string, input: unknown, t: Translate): string {
  const data = record(input);
  const description = short(data.description) || short(data.title);
  if (description) return description;
  const action = activityAction(name);
  if (action === 'command' && typeof data.command === 'string') {
    // Codex CLI supplies a command but no desktop-style parsed command metadata.
    // Recognize literal read targets only; dynamic expressions remain generic.
    const command = data.command.trim();
    const shellBody = /\s-(?:Command|c)\s+['"]([\s\S]*)['"]$/i.exec(command)?.[1] ?? command;
    const read = /^(?:\$[\w]+\s*=\s*)?(?:Get-Content|cat|type)(?:\s+-(?:Raw|LiteralPath|Path))*\s+([\w./\\:-]+)(?=\s|['";|&]|$)/i.exec(shellBody);
    if (read) return `${t('assistant.verbReading')} ${read[1]!.split(/[\\/]/).at(-1)}`;
  }
  const path = short(data.file_path ?? data.filePath ?? data.path ?? data.AbsolutePath ?? data.TargetFile);
  const target = path.split(/[\\/]/).at(-1);
  if (target && (action === 'edit' || action === 'read')) {
    return `${t(action === 'edit' ? 'assistant.verbEditing' : 'assistant.verbReading')} ${target}`;
  }
  return t(`activity.live.${action}`);
}
/** Only confirmed tool results contribute to a past-tense summary. */
export function completedActivityLabel(names: string[], t: Translate): string {
  return [...new Set(names.map(activityAction))].map(action => t(`activity.completed.${action}`)).join(', ')
    || t('tool.done');
}
