import { createHash } from 'node:crypto';
import type { CodexPromptParts } from './direct-site-run.js';

export function snapshotPrompt(parts: CodexPromptParts) {
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  return {
    instructions: digest(parts.instructions),
    context: Object.fromEntries(Object.entries(parts.browser).map(([key, value]) => [key, digest(JSON.stringify(value))])),
  };
}

export function changedPrompt(parts: CodexPromptParts, snapshot: ReturnType<typeof snapshotPrompt>, previous: ReturnType<typeof snapshotPrompt>): string {
  const changes = Object.fromEntries(Object.entries(parts.browser).filter(([key]) => snapshot.context[key] !== previous.context[key]));
  const removed = Object.keys(previous.context).filter(key => !Object.hasOwn(snapshot.context, key));
  return [
    ...(snapshot.instructions === previous.instructions ? [] : [parts.instructions]),
    ...(Object.keys(changes).length || removed.length ? [`Current browser context changes: ${JSON.stringify({changes, removed})}`] : []),
    parts.request,
  ].join('\n\n');
}
