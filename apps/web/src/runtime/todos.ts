import { todoStatusIsUnfinished, type ChatRunStatus } from '@open-design/contracts';
import type { AgentEvent } from '../types';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'stopped';

export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

/** Only a successful server receipt may advance a durable plan. Provider-native todos remain compatible. */
export function withSavedPlanEvents(events: AgentEvent[] | undefined): AgentEvent[] {
  if (!events) return [];
  const result: AgentEvent[] = [];
  const renderedCalls = new Set<string>();
  for (const event of events) {
    result.push(event);
    if (event.kind !== 'tool_result' || event.isError) continue;
    const call = events.find(e => e.kind === 'tool_use' && e.id === event.toolUseId);
    if (!call || call.kind !== 'tool_use') continue;
    const input = call.input as { tool?: string } | undefined;
    if (!/(?:^|__)pixflow_plan_(?:update|read)$/.test(call.name) && !['plan.update', 'plan.read'].includes(call.name) && !(['plan.update', 'plan.read'].includes(input?.tool ?? '') && /(?:^|__)pixflow_call$/.test(call.name))) continue;
    const receipt = savedPlanReceipt(event.content);
    if (!receipt) continue;
    renderedCalls.add(event.toolUseId);
    result.push({ kind: 'tool_use', id: `${event.toolUseId}-saved-plan`, name: 'TodoWrite', input: {
      title: receipt.title, summary: receipt.summary, todos: receipt.steps, savedPlanRevision: receipt.revision,
    } });
  }
  // Successful receipts are represented by the shared Plan card alone. Keep
  // failed tool calls visible for diagnosis, and leave stored stream events intact.
  return result.filter(event => !(event.kind === 'tool_use' && renderedCalls.has(event.id))
    && !(event.kind === 'tool_result' && renderedCalls.has(event.toolUseId)));
}

function savedPlanReceipt(value: unknown, depth = 0): { title: string; summary: string; steps: unknown[]; revision: number } | null {
  if (depth > 5) return null;
  if (typeof value === 'string') { try { return savedPlanReceipt(JSON.parse(value), depth + 1); } catch { return null; } }
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.isError || row.error || row.ok === false) return null;
  const plan = row.plan as Record<string, unknown> | undefined;
  if (row.ok === true && plan && typeof plan.title === 'string' && typeof plan.summary === 'string' && Array.isArray(plan.steps) && typeof plan.revision === 'number') return {title: plan.title, summary: plan.summary, steps: plan.steps, revision: plan.revision};
  if (Array.isArray(row.content)) for (const block of row.content) { const found = savedPlanReceipt(block?.text, depth + 1); if (found) return found; }
  return row.result ? savedPlanReceipt(row.result, depth + 1) : null;
}

export function parseTodoWriteInput(input: unknown): TodoItem[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as { plan?: unknown; todos?: unknown };
  const rawItems = Array.isArray(obj.todos)
    ? obj.todos
    : Array.isArray(obj.plan)
      ? obj.plan
      : [];
  return rawItems
    .map((todo): TodoItem | null => {
      if (!todo || typeof todo !== 'object') return null;
      const record = todo as Record<string, unknown>;
      const content =
        typeof record.content === 'string'
          ? record.content
          : typeof record.step === 'string'
            ? record.step
            : '';
      if (!content) return null;
      const status = normalizeTodoStatus(record.status);
      return {
        content,
        status,
        activeForm:
          typeof record.activeForm === 'string'
            ? record.activeForm
            : typeof record.active_form === 'string'
              ? record.active_form
              : undefined,
      };
    })
    .filter((todo): todo is TodoItem => todo !== null);
}

function normalizeTodoStatus(status: unknown): TodoStatus {
  if (status === 'completed' || status === 'in_progress' || status === 'stopped') {
    return status;
  }
  if (status === 'cancelled' || status === 'canceled' || status === 'failed') {
    return 'stopped';
  }
  return 'pending';
}

export function latestTodosFromEvents(events: AgentEvent[] | undefined): TodoItem[] {
  if (!events) return [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.kind !== 'tool_use' || !isTodoWriteToolName(event.name)) continue;
    return parseTodoWriteInput(event.input);
  }
  return [];
}

export function unfinishedTodosFromEvents(events: AgentEvent[] | undefined): TodoItem[] {
  // Durable plans span replies, approvals and handoffs. Their pending steps do
  // not mean the current provider turn stopped before fulfilling its request.
  const latest = [...(events ?? [])].reverse().find(event => event.kind === 'tool_use' && isTodoWriteToolName(event.name));
  if (latest?.kind === 'tool_use' && isSavedPlanInput(latest.input)) return [];
  return latestTodosFromEvents(events).filter((todo) => todoStatusIsUnfinished(todo.status));
}

export function isSavedPlanInput(input: unknown): boolean {
  return Boolean(input && typeof input === 'object' && typeof (input as {savedPlanRevision?: unknown}).savedPlanRevision === 'number');
}

// Walk the conversation in reverse to find the most recent TodoWrite
// tool_use, return its raw input so callers can hand it to a `PlanCard`
// without re-implementing the discovery logic. Returns `null` when no
// TodoWrite has been emitted yet in this conversation.
export function latestTodoWriteInputFromMessages(
  messages: ReadonlyArray<{ events?: AgentEvent[] | undefined }> | undefined,
): unknown | null {
  if (!messages || messages.length === 0) return null;
  for (let mi = messages.length - 1; mi >= 0; mi -= 1) {
    const events = messages[mi]?.events;
    if (!events || events.length === 0) continue;
    for (let ei = events.length - 1; ei >= 0; ei -= 1) {
      const event = events[ei];
      if (event?.kind !== 'tool_use') continue;
      if (!isTodoWriteToolName(event.name)) continue;
      return event.input;
    }
  }
  return null;
}

export function latestTodoWriteInputForPinnedCard<
  T extends {
    events?: AgentEvent[] | undefined;
    runStatus?: ChatRunStatus | undefined;
    endedAt?: number | undefined;
  },
>(
  messages: ReadonlyArray<T> | undefined,
): unknown | null {
  if (!messages || messages.length === 0) return null;
  // A durable receipt outranks provider-local todos, including after reload or
  // an older stream finishing in another tab. Equal revisions prefer the latest run.
  let saved: { input: unknown; revision: number; message: T } | undefined;
  for (const message of messages) for (const event of message.events ?? []) {
    if (event.kind !== 'tool_use' || !isTodoWriteToolName(event.name)) continue;
    const input = event.input as {savedPlanRevision?: number} | null;
    if (typeof input?.savedPlanRevision !== 'number') continue;
    if (!saved || input.savedPlanRevision >= saved.revision) saved = { input, revision: input.savedPlanRevision, message };
  }
  if (saved) return hasTerminalRunEnded(saved.message.runStatus, saved.message.endedAt) ? stoppedTodoWriteInput(saved.input) : saved.input;
  for (let mi = messages.length - 1; mi >= 0; mi -= 1) {
    const message = messages[mi];
    const events = message?.events;
    if (!events || events.length === 0) continue;
    for (let ei = events.length - 1; ei >= 0; ei -= 1) {
      const event = events[ei];
      if (event?.kind !== 'tool_use') continue;
      if (!isTodoWriteToolName(event.name)) continue;
      if (!hasTerminalRunEnded(message.runStatus, message.endedAt)) {
        return event.input;
      }
      return stoppedTodoWriteInput(event.input);
    }
  }
  return null;
}

export function isTodoWriteToolName(name: string): boolean {
  return (
    name === 'TodoWrite' ||
    name === 'todowrite' ||
    name === 'todo_write' ||
    name === 'update_plan'
  );
}

function hasTerminalRunEnded(
  runStatus: ChatRunStatus | undefined,
  endedAt: number | undefined,
): boolean {
  return (
    runStatus === 'succeeded' ||
    runStatus === 'failed' ||
    runStatus === 'canceled' ||
    runStatus === 'interrupted' ||
    (runStatus === undefined && endedAt !== undefined)
  );
}

function stoppedTodoWriteInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const obj = input as { todos?: unknown; plan?: unknown };
  const key = Array.isArray(obj.todos) ? 'todos' : Array.isArray(obj.plan) ? 'plan' : null;
  if (!key) return input;
  const items = obj[key] as unknown[];
  return {
    ...(input as Record<string, unknown>),
    [key]: items.map((todo) => {
      if (!todo || typeof todo !== 'object') return todo;
      const record = todo as Record<string, unknown>;
      if (record.status !== 'in_progress') return todo;
      return {
        ...record,
        status: 'stopped',
      };
    }),
  };
}
