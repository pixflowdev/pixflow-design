import type { AgentEvent } from '../../types';
import { activityAction } from './activity-label';
import { citationSource } from './InlineCitation';

/** Source presentation follows successful page reads, not the provider's tool brand. */
export function observedSourceUrls(events: readonly AgentEvent[]): ReadonlySet<string> {
  const urls = new Set<string>();
  const completed = new Set(events.flatMap(event => event.kind === 'tool_result' && !event.isError ? [event.toolUseId] : []));
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const url = citationSource(value);
    if (url) urls.add(url.href);
  };
  for (const event of events) {
    if (event.kind === 'activity') for (const source of event.sources ?? []) add(source.url);
    if (event.kind !== 'tool_use' || !completed.has(event.id) || !event.input || typeof event.input !== 'object') continue;
    const input = event.input as Record<string, unknown>;
    if (/(?:^|[_.:/])(?:web_?fetch|fetch_url|open_url|browser_navigate|navigate)$/i.test(event.name)) add(input.url ?? input.uri);
    if (activityAction(event.name) !== 'command' || typeof input.command !== 'string') continue;
    // Only literal HTTP-reader invocations. Printed URLs, arbitrary scripts,
    // failed requests and unrelated navigation links are not citation evidence.
    for (const read of input.command.slice(0, 32_000).matchAll(/(?:^|[;&|]\s*)(?:curl(?:\.exe)?|wget(?:\.exe)?|Invoke-WebRequest|Invoke-RestMethod)\s+([^\r\n;|]+)/gi)) {
      add(read[1]!.match(/https?:\/\/[^\s'"<>`]+/i)?.[0]);
    }
  }
  return urls;
}
