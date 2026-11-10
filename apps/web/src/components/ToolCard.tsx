import { IconListCheck, IconCircle } from '@tabler/icons-react';
import { Button } from '@open-design/components';
import { CodeBlock, CodeBlockHeader, CodeBlockTitle, CodeBlockContent } from './chat/CodeBlock';
import type { ReactNode } from 'react';
import { Trace, TraceIcon, TraceLine, TraceTitle, TraceDescription, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent } from './chat/Trace';

import { useT as usePixflowUiTranslation } from '../i18n';
/**
 * Renders a single tool_use (optionally paired with its tool_result) as an
 * inline card in the assistant message stream. Lookup order:
 *
 *   1. user-registered renderer in `tool-renderers` (the extension point
 *      analogous to CopilotKit's `useCopilotAction({ render })`)
 *   2. hardcoded family card for tools we ship with (TodoWrite / Write /
 *      Edit / Read / Bash / Glob / Grep / WebFetch / WebSearch)
 *   3. generic command/output fallback
 */
import { useMemo, useState } from 'react';
import styles from './ToolCard.module.css';
import { useT } from '../i18n';
import { isTodoWriteToolName, parseTodoWriteInput } from '../runtime/todos';
import { getToolRenderer, toRenderProps } from '../runtime/tool-renderers';
import type { AgentEvent } from '../types';
import { Icon } from './Icon';

interface Props {
  use: Extract<AgentEvent, { kind: 'tool_use' }>;
  result?: Extract<AgentEvent, { kind: 'tool_result' }> | undefined;
  // True while the parent run is still streaming. Forwarded to registered
  // renderers via `status` so they can show live execution.
  runStreaming?: boolean;
  // True when the parent run reached a successful terminal status. Missing
  // tool results in successful completed turns are rendered as done.
  runSucceeded?: boolean;
  // Set of file names that exist in the project folder. When the tool's
  // `file_path`/`path` argument's basename appears in this set we surface
  // an "open" button on the card. Pass `undefined` to skip the existence
  // check (the button is then always shown for file-shaped tools).
  projectFileNames?: Set<string>;
  // Lifts a basename up to ProjectView so it can focus the matching tab
  // in FileWorkspace.
  onRequestOpenFile?: (name: string) => void;
}

export function ToolCard({
  use,
  result,
  runStreaming,
  runSucceeded,
  projectFileNames,
  onRequestOpenFile,
}: Props) {
  const name = use.name;
  const isStreaming = runStreaming ?? false;
  const isSucceeded = runSucceeded ?? false;
  const custom = getToolRenderer(name);
  if (custom) {
    // A misbehaving third-party renderer must not take down the whole
    // assistant message — catch synchronous throws and fall through to the
    // built-in family card. (React's own error boundaries still cover
    // throws raised inside the returned tree once it's mounted.)
    try {
      const node = custom(toRenderProps(use, result, isStreaming, isSucceeded));
      if (node !== undefined && node !== null && node !== false) return <>{node}</>;
    } catch (err) {
      console.error(`[ToolCard] custom renderer for "${name}" threw; falling back`, err);
    }
  }
  const ctx: FileToolCtx = { projectFileNames, onRequestOpenFile };
  if (isTodoWriteToolName(name)) return <TodoCard input={use.input} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'Write' || name === 'write' || name === 'create_file')
    return <FileWriteCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (name === 'Edit' || name === 'str_replace_edit')
    return <FileEditCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (name === 'Read' || name === 'read_file')
    return <FileReadCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (name === 'Bash') return <BashCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'Glob' || name === 'list_files') return <GlobCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'Grep') return <GrepCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'WebFetch' || name === 'web_fetch' || name === 'webfetch') return <WebFetchCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'WebSearch' || name === 'web_search' || name === 'websearch') return <WebSearchCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (isAskUserQuestionName(name))
    return <LegacyAskUserQuestionCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  return <GenericCard name={name} input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
}

// The interactive `AskUserQuestion` mechanism was retired in favor of the
// unified `<question-form>` flow, but chat history survives app upgrades, so
// existing projects still carry persisted `AskUserQuestion` tool_use events.
// Without a dedicated renderer they fall through to GenericCard and surface
// the raw `{"questions":[...]}` JSON payload under an "AskUserQuestion" title.
// This read-only card renders those historical turns as an inert question
// summary — no submit path, no interactive answer route — so old history stays
// legible after the cleanup.
export function isAskUserQuestionName(name: string): boolean {
  return name === 'AskUserQuestion' || name === 'ask_user_question';
}

type LegacyAuqQuestion = { question: string; header?: string; options: string[] };

// Minimal, defensive parse of the legacy AUQ input shape
// `{ questions: [{ question, header, options: [{ label }] | [string] }] }`.
// Kept inline (the dedicated parser module was deleted with the mechanism);
// this only needs enough to render a read-only summary.
function parseLegacyAskUserQuestion(input: unknown): LegacyAuqQuestion[] {
  const obj = (input ?? {}) as { questions?: unknown };
  if (!Array.isArray(obj.questions)) return [];
  const out: LegacyAuqQuestion[] = [];
  for (const raw of obj.questions) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as Record<string, unknown>;
    const question = typeof q.question === 'string' ? q.question : '';
    if (!question) continue;
    const header = typeof q.header === 'string' && q.header.trim() ? q.header.trim() : undefined;
    const options: string[] = [];
    if (Array.isArray(q.options)) {
      for (const opt of q.options) {
        if (typeof opt === 'string') {
          if (opt) options.push(opt);
          continue;
        }
        if (opt && typeof opt === 'object' && typeof (opt as { label?: unknown }).label === 'string') {
          const label = (opt as { label: string }).label;
          if (label) options.push(label);
        }
      }
    }
    out.push(header ? { question, header, options } : { question, options });
  }
  return out;
}

// Recover the user's persisted answer from a completed AUQ `tool_result`. The
// retired interactive card serialized answers as one `${question}\n${answer}`
// block per question, blocks joined by a blank line, with multi-select answers
// written as `- option` bullet lines. Surfacing it keeps old conversations
// auditable — two different answers no longer render identically.
function parseLegacyAuqAnswer(content: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!content) return map;
  for (const block of content.split('\n\n')) {
    const nl = block.indexOf('\n');
    if (nl === -1) continue;
    const q = block.slice(0, nl).trim();
    const a = block
      .slice(nl + 1)
      .split('\n')
      .map((s) => s.replace(/^- /, '').trim())
      .filter(Boolean)
      .join(', ');
    if (q && a) map.set(q, a);
  }
  return map;
}

function LegacyAskUserQuestionCard({
  input,
  result,
  runStreaming,
  runSucceeded,
}: {
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
}) {
  const questions = parseLegacyAskUserQuestion(input);
  const first = questions[0];
  // Unparseable payload → defer to the generic card rather than inventing UI.
  if (!first)
    return <GenericCard name="AskUserQuestion" input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  // Title + summary are model-authored text (already in the user's locale), so
  // no new i18n keys are needed for this historical-only surface.
  const title = first.header ?? truncate(first.question, 60);
  const answers = result && !result.isError ? parseLegacyAuqAnswer(result.content) : new Map<string, string>();
  // Surface the persisted pick(s) so completed history shows the actual answer,
  // not just the prompt. Falls back to the bare prompt when no answer is stored.
  const summary = questions
    .map((q) => {
      const answer = answers.get(q.question);
      return answer ? `${q.question} → ${answer}` : q.question;
    })
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="op-card op-generic">
      <div className="op-card-head">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{title}</span>
        {summary ? <span className="op-meta">{truncate(summary, 240)}</span> : null}
      </div>
    </div>
  );
}

interface FileToolCtx {
  projectFileNames?: Set<string> | undefined;
  onRequestOpenFile?: ((name: string) => void) | undefined;
}

function OpenInTabButton({ filePath, ctx }: { filePath: string; ctx: FileToolCtx }) {
  const t = useT();
  if (!ctx.onRequestOpenFile) return null;
  if (!filePath || filePath === '(unnamed)') return null;
  // The agent uses absolute paths; the project-file API keys on basename.
  const baseName = filePath.split(/[\\/]/).pop() ?? filePath;
  if (!baseName) return null;
  if (ctx.projectFileNames && !ctx.projectFileNames.has(baseName)) return null;
  const open = ctx.onRequestOpenFile;
  return (
    <button
      type="button"
      className="op-open"
      onClick={() => open(baseName)}
      title={t('tool.openInTab', { name: baseName })}
    >
      {t('tool.open')}
    </button>
  );
}

export function TodoCard({ input, runStreaming, runSucceeded, onDismiss }: { input: unknown; runStreaming: boolean; runSucceeded: boolean; onDismiss?: () => void }) {
  const t = useT();
  const todos = parseTodoWriteInput(input);
  // Mirror the pattern other agent UIs (Cursor, Codex) use: default the
  // todo list to expanded while there is in-progress work or anything
  // pending, collapse it to a one-line summary when everything is done.
  // The user can flip it manually via the header button — that local
  // override sticks for the lifetime of this card.
  const hasInProgress = todos.some((todo) => todo.status === 'in_progress');
  const hasPending = todos.some((todo) => todo.status === 'pending' || todo.status === 'in_progress');
  const defaultExpanded = todos.length > 0 && (hasInProgress || hasPending || runStreaming);
  const [overrideExpanded, setOverrideExpanded] = useState<boolean | null>(null);
  const expanded = overrideExpanded ?? defaultExpanded;
  if (todos.length === 0) return <GenericCard name="TodoWrite" input={input} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  // The counter reads as "active progress / total" — a task that is
  // currently in_progress counts toward the numerator alongside completed
  // ones, matching how Cursor / Codex tally tasks. Without this the user
  // sees 0/4 the entire time the first task is being worked, which is
  // confusing because something is clearly underway.
  const inProgressTodo = todos.find((todo) => todo.status === 'in_progress');
  const completed = todos.filter((todo) => todo.status === 'completed').length;
  const done = todos.filter(
    (todo) => todo.status === 'completed' || todo.status === 'in_progress',
  ).length;
  // All-complete state surfaces the Done dismiss button (when wired) so the
  // pinned task list can be cleared once the whole plan is finished.
  const allComplete = completed === todos.length;
  const showDismiss = !!onDismiss && allComplete;
  return (
    <Trace className="op-todo" data-trace-kind="plan">
      <TraceCollapsible open={expanded} onOpenChange={setOverrideExpanded}>
        <div className={styles.planHeading}>
          <TraceCollapsibleTrigger title={expanded ? t('tool.todosCollapse') : t('tool.todosExpand')}>
            <TraceLine><TraceIcon><IconListCheck size={14} /></TraceIcon>
              <TraceTitle>{t('tool.todos')}</TraceTitle><TraceDescription>{done}/{todos.length}</TraceDescription>
              {!expanded && inProgressTodo ? <TraceDescription>{inProgressTodo.activeForm || inProgressTodo.content}</TraceDescription> : null}
            </TraceLine>
          </TraceCollapsibleTrigger>
          {showDismiss ? <Button variant="subtle" onClick={() => onDismiss?.()} title={t('tool.todosDismiss')}>{t('tool.todosDone')}</Button> : null}
        </div>
        <TraceCollapsibleContent keepMounted>
          <ul className="todo-list">
            {todos.map((todo, i) => <li key={i} className={`todo-item todo-${todo.status}`}>
              <TraceLine className={styles.planItem} status={todo.status === 'in_progress' ? 'running' : todo.status === 'stopped' ? 'error' : todo.status === 'pending' ? 'pending' : undefined}>
                <TraceIcon>{todo.status === 'pending' ? <IconCircle size={14} /> : <Icon name={todo.status === 'completed' ? 'check' : todo.status === 'in_progress' ? 'spinner' : 'close'} size={14} />}</TraceIcon>
                <TraceTitle>{todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}</TraceTitle>
              </TraceLine>
            </li>)}
          </ul>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}

function FileWriteCard({
  input,
  result,
  runStreaming,
  runSucceeded,
  ctx,
}: {
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
  ctx: FileToolCtx;
}) {
  const t = useT();
  const obj = (input ?? {}) as { file_path?: string; filePath?: string; path?: string; content?: string };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const baseName = file.split(/[\\/]/).pop() ?? file;
  const lines = typeof obj.content === 'string' ? obj.content.split('\n').length : null;
  return <ToolTrace title={t('tool.write')} description={<>{baseName}{lines !== null ? ` · ${t('tool.lines', { n: lines })}` : ''}</>} result={result}
    runStreaming={runStreaming} runSucceeded={runSucceeded} detail={() => (<><code className="op-path">{file}</code><OpenInTabButton filePath={file} ctx={ctx} /></>)} />;
}

function FileEditCard({
  input,
  result,
  runStreaming,
  runSucceeded,
  ctx,
}: {
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
  ctx: FileToolCtx;
}) {
  const t = useT();
  const obj = (input ?? {}) as {
    file_path?: string;
    filePath?: string;
    path?: string;
    old_string?: string;
    new_string?: string;
    edits?: { old_string?: string; new_string?: string }[];
  };
  const parsed = useMemo(() => {
    const content = result?.content;
    if (!content || result.isError || content.length > 262144 || !content.trimStart().startsWith('[')) return [];
    try { return fileChanges(JSON.parse(content)); } catch { return []; }
  }, [result]);
  const changes = parsed.length ? parsed : fileChanges((input as { changes?: unknown } | null)?.changes);
  const first = changes[0]?.path ?? [obj.file_path, obj.filePath, obj.path].find(path => typeof path === 'string' && path.trim());
  const count = changes.length || obj.edits?.length || (first ? 1 : 0);
  return <ToolTrace title={t('tool.edit')} description={first ? <>{first.split(/[\\/]/).pop()} · {count} {t(count === 1 ? 'tool.changeSingular' : 'tool.changePlural')}</> : null}
    result={result} hideOutput={parsed.length > 0} runStreaming={runStreaming} runSucceeded={runSucceeded}
    detail={first ? () => changes.length ? changes.map((row, index) => <div key={index}>
      <code className="op-path">{row.path}</code>{typeof row.kind?.type === 'string' && <> · {row.kind.type}</>}<OpenInTabButton filePath={row.path} ctx={ctx} />
      {row.diff && <pre className="op-output">{truncate(row.diff, 4000)}</pre>}
    </div>) : <><code className="op-path">{first}</code><OpenInTabButton filePath={first} ctx={ctx} /></> : undefined} />;
}

function fileChanges(value: unknown): { path: string; diff?: string; kind?: { type?: string } }[] {
  if (!Array.isArray(value) || !value.every(row => row && typeof row.path === 'string' && row.path.trim()
    && (row.diff === undefined || typeof row.diff === 'string'))) return [];
  return value;
}

function FileReadCard({
  input,
  result,
  runStreaming,
  runSucceeded,
  ctx,
}: {
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
  ctx: FileToolCtx;
}) {
  const t = useT();
  const obj = (input ?? {}) as { file_path?: string; filePath?: string; path?: string };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const baseName = file.split(/[\\/]/).pop() ?? file;
  return <ToolTrace title={t('tool.read')} description={baseName} result={result}
    runStreaming={runStreaming} runSucceeded={runSucceeded} detail={() => (<><code className="op-path">{file}</code><OpenInTabButton filePath={file} ctx={ctx} /></>)} />;
}

function BashCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { command?: string; description?: string };
  const command = obj.command ?? '';
  const desc = obj.description;
  return <ToolTrace title={desc || t('chat.designToolbox.context.terminal')} result={result}
    runStreaming={runStreaming} runSucceeded={runSucceeded} detail={() => (<CodeBlock><CodeBlockContent><pre className="op-command"><code>{truncate(command, 400)}</code></pre></CodeBlockContent></CodeBlock>)} />;
}

function GlobCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const translateUi = usePixflowUiTranslation();
  const t = useT();
  const obj = (input ?? {}) as { pattern?: string; path?: string };
  return <ToolTrace title={t('tool.glob')} description={<>{obj.pattern ?? '*'}{obj.path ? translateUi("ui.toolCard.in", { value1: obj.path }) : ''}</>} result={result}
    runStreaming={runStreaming} runSucceeded={runSucceeded} />;
}

function GrepCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const translateUi = usePixflowUiTranslation();
  const t = useT();
  const obj = (input ?? {}) as { pattern?: string; path?: string; glob?: string };
  return <ToolTrace title={t('tool.grep')} description={<>{obj.pattern ?? ''}{obj.path ? translateUi("ui.toolCard.in", { value1: obj.path }) : ''}</>} result={result}
    runStreaming={runStreaming} runSucceeded={runSucceeded} />;
}

function WebFetchCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { url?: string };
  return <ToolTrace title={t('tool.fetch')} description={obj.url} result={result}
    runStreaming={runStreaming} runSucceeded={runSucceeded} />;
}

function WebSearchCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { query?: string };
  return <ToolTrace title={t('tool.search')} description={obj.query} result={result}
    runStreaming={runStreaming} runSucceeded={runSucceeded} />;
}

function GenericCard({
  name,
  input,
  result,
  runStreaming,
  runSucceeded,
}: {
  name: string;
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
}) {
  const summary = describeInput(input);
  return <ToolTrace title={name} description={summary ? truncate(summary, 200) : undefined} result={result}
    runStreaming={runStreaming} runSucceeded={runSucceeded} />;
}

/** A tool only expands when there is real input detail or output to inspect.
 * Keep large output unmounted until requested; source events remain untouched. */
function ToolTrace({ title, description, result, runStreaming, runSucceeded, detail, hideOutput }: {
  title: string; description?: ReactNode; result?: Props['result']; runStreaming: boolean;
  runSucceeded: boolean; detail?: (() => ReactNode) | undefined; hideOutput?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const status = result?.isError ? 'error' : !result && runStreaming ? 'running' : undefined;
  const label = result?.isError ? `${title} · ${t('tool.error')}` : title;
  const line = <TraceLine status={status}>
    <ResultBadge className={styles.status} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
    <TraceTitle title={label}>{label}</TraceTitle>
    {description ? <TraceDescription>{description}</TraceDescription> : null}
  </TraceLine>;
  if (!detail && !result?.content) return <div data-trace-kind="tool">{line}</div>;
  return <TraceCollapsible data-trace-kind="tool" open={open}
    onOpenChange={setOpen}>
    <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
    <TraceCollapsibleContent className={styles.detail}>
      {detail ? <ToolInput render={detail} /> : null}
      {result?.content && !hideOutput ? <ToolOutput content={result.content} /> : null}
    </TraceCollapsibleContent>
  </TraceCollapsible>;
}

function ToolInput({ render }: { render: () => ReactNode }) {
  return <div className={styles.input}>{render()}</div>;
}

// Formatting is presentation-only: persisted provider output is never rewritten.
// Bound parsing as well as rendering so unusually large results cannot stall a stream.
function ToolOutput({ content }: { content: string }) {
  const t = useT();
  const formatted = useMemo(() => {
    let value = content;
    if (content.length <= 32_768 && /^\s*[\[{]/.test(content)) {
      try { value = JSON.stringify(JSON.parse(content), null, 2); } catch { /* Plain tool output stays verbatim. */ }
    }
    return truncate(value, 4000);
  }, [content]);
  return <CodeBlock className={styles.output} size="sm">
    <CodeBlockHeader><CodeBlockTitle className={styles.outputLabel}>{t('tool.output')}</CodeBlockTitle></CodeBlockHeader>
    <CodeBlockContent><pre className="op-output"><code>{formatted}</code></pre></CodeBlockContent>
  </CodeBlock>;
}

function ResultBadge({ result, runStreaming, runSucceeded, className = '' }: { result?: Props['result']; runStreaming: boolean; runSucceeded: boolean; className?: string }) {
  const t = useT();
  if (!result && runStreaming) return <span className={`op-status op-status-running ${className}`} title={t('tool.running')}><Icon name="spinner" size={14} /></span>;
  if (!result && !runSucceeded) return <span className={`op-status op-status-error ${className}`} title={t('tool.error')}><Icon name="close" size={14} /></span>;
  if (result?.isError) return <span className={`op-status op-status-error ${className}`} title={t('tool.error')}><Icon name="close" size={14} /></span>;
  return <span className={`op-status op-status-ok ${className}`} title={t('tool.done')}><Icon name="check" size={14} /></span>;
}

function describeInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (typeof input !== 'object') return String(input);
  const obj = input as Record<string, unknown>;
  // Empty argument payloads carry no useful user-facing description.
  if (Object.keys(obj).length === 0) return '';
  for (const key of ['file_path', 'path', 'pattern', 'url', 'query', 'name', 'command']) {
    const v = obj[key];
    if (typeof v === 'string') return v;
  }
  try {
    return JSON.stringify(obj);
  } catch {
    return '';
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
