import type { PixflowBuilderHandoff } from '@open-design/contracts';
import { pixflowWordPressRestFetch } from './runtime-fetch';

export async function readBuilderHandoff(query: {id: string} | {projectId: string; conversationId: string}, signal?: AbortSignal): Promise<PixflowBuilderHandoff | null> {
  const response = await pixflowWordPressRestFetch(`/builder-handoffs?${new URLSearchParams(query)}`, {signal});
  const value = await response.json();
  if (!response.ok) throw new Error(value.message || 'Could not read the builder handoff.');
  return value.handoff;
}

export async function mutateBuilderHandoff<T extends {handoff: PixflowBuilderHandoff} = {handoff: PixflowBuilderHandoff}>(body: Record<string, unknown>): Promise<T> {
  const response = await pixflowWordPressRestFetch('/builder-handoffs', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.message || 'Could not update the builder handoff.'), {status:response.status});
  return value as T;
}
