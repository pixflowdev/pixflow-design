export const MID_TURN_TRUNCATION_STOP_REASONS: ReadonlySet<string> = new Set([
  'max_tokens',
  'max_output_tokens',
]);

export function stopReasonIsTruncation(stopReason: unknown): boolean {
  return typeof stopReason === 'string'
    && MID_TURN_TRUNCATION_STOP_REASONS.has(stopReason);
}

export function todoStatusIsUnfinished(status: unknown): boolean {
  return status !== 'completed';
}

export function todoSnapshotHasUnfinishedWork(todos: unknown): boolean {
  if (!Array.isArray(todos)) return false;
  return todos.some((todo) =>
    Boolean(todo)
    && typeof todo === 'object'
    && todoStatusIsUnfinished((todo as { status?: unknown }).status));
}

function todoItemsFromToolInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as { todos?: unknown; plan?: unknown };
  if (Array.isArray(record.todos)) return record.todos;
  if (Array.isArray(record.plan)) return record.plan;
  return undefined;
}

export function isTodoWriteToolName(name: unknown): boolean {
  return name === 'TodoWrite'
    || name === 'todowrite'
    || name === 'todo_write'
    || name === 'update_plan';
}

export function eventsEndedWithUnfinishedWork(events: unknown): boolean {
  if (!Array.isArray(events)) return false;
  for (const event of events) {
    if (
      event
      && typeof event === 'object'
      && (event as { kind?: unknown }).kind === 'usage'
      && stopReasonIsTruncation((event as { stopReason?: unknown }).stopReason)
    ) return true;
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      !event
      || typeof event !== 'object'
      || (event as { kind?: unknown }).kind !== 'tool_use'
      || !isTodoWriteToolName((event as { name?: unknown }).name)
    ) continue;
    return todoSnapshotHasUnfinishedWork(
      todoItemsFromToolInput((event as { input?: unknown }).input),
    );
  }
  return false;
}

export function todoItemsFromTodoWriteInput(input: unknown): unknown {
  return todoItemsFromToolInput(input);
}
