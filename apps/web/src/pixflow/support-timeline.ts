import { getPixflowWordPressConfig } from './wordpress-context';
import { pixflowWordPressRestFetch } from './runtime-fetch';

const operations = ['licence-status','licence-features','licence-validate','licence-reset','bridge-connection',
  'claude-status','claude-start','claude-cancel','claude-open-browser','claude-code'] as const;
type Operation = typeof operations[number];
const outcomes = ['json','html','other','proxied','network-error','connected-direct','connected-extension',
  'connected','disconnected','site-mismatch','update-required'] as const;
type Outcome = typeof outcomes[number];
type Entry = { at: number; operation: Operation; outcome: Outcome; http: number };
let recent: Entry[] = [];
export function supportTimeline() { return recent.slice(); }
export function persistBrowserEvent(area: string, event: string, http = 0, operation?: Operation, file?: string, line?: number) {
  if (!getPixflowWordPressConfig()?.restNonce) return;
  void pixflowWordPressRestFetch('/diagnostics/event', { method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area, event, http, operation, file, line }),
  }).catch(() => {});
}
export function observeSupport(operation: Operation, outcome: Outcome, http = 0) {
  const last = recent.slice().reverse().find(entry => entry.operation === operation);
  if (last?.outcome === outcome && last.http === http) return;
  recent = [...recent, { at: Date.now(), operation, outcome, http }].slice(-32);
  const failed = (value: Outcome, status: number) => status >= 400 || ['html','network-error','site-mismatch','disconnected','update-required'].includes(value);
  const isFailure = failed(outcome, http);
  if (!isFailure && !(last && failed(last.outcome, last.http))) return;
  const area = operation.startsWith('licence-') ? 'licence' : operation.startsWith('claude-') ? 'claude' : 'bridge';
  const event = !isFailure ? 'recovered' : outcome === 'html' ? 'status-html'
    : ['site-mismatch','disconnected','update-required'].includes(outcome) ? outcome : 'request-failed';
  persistBrowserEvent(area, event, http, operation);
}
const licencePaths: Record<string, Operation> = {
  'license/status':'licence-status', 'license/features':'licence-features',
  'license/validate':'licence-validate', 'license/reset':'licence-reset',
};
export async function observeLicenceRequest<T extends { ok: boolean; status: number }>(
  path: string, request: () => Promise<T>, media: (response: T) => Outcome,
): Promise<T> {
  const key = path.replace(/^\//, '');
  const operation = Object.hasOwn(licencePaths, key) ? licencePaths[key] : null;
  if (!operation) return request();
  try {
    const response = await request();
    observeSupport(operation, media(response), response.status);
    return response;
  } catch (error) { observeSupport(operation, 'network-error'); throw error; }
}
export function responseFormat(response: Response): Outcome {
  const type = response.headers?.get?.('content-type') ?? '';
  return type.includes('json') ? 'json' : type.includes('html') ? 'html' : 'other';
}
