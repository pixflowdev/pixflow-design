import type {
  AgentActivityPhase,
  AgentActivitySource,
  PersistedAgentEvent,
} from '@open-design/contracts';
import {
  completeAgentActivity,
  failAgentActivity,
  mergeProviderAgentEvent,
  sanitizeAgentAssistantEvents,
  settleActiveAgentActivities,
  startAgentActivity,
  updateAgentResearchActivity,
} from './agent-activity-lifecycle';

export const mergeWpAdminProviderEvent = mergeProviderAgentEvent;
export const sanitizeWpAdminProviderEvents = sanitizeAgentAssistantEvents;

export function startWpAdminActivity(
  events: PersistedAgentEvent[],
  input: { id: string; phase: AgentActivityPhase; label: string; detail?: string },
  now = Date.now(),
): PersistedAgentEvent[] {
  return startAgentActivity(events, input, now);
}

export function updateWpAdminResearchActivity(
  events: PersistedAgentEvent[],
  id: string,
  input: { sourceCount: number; detail?: string; sources?: AgentActivitySource[] },
): PersistedAgentEvent[] {
  return updateAgentResearchActivity(events, id, input);
}

export function completeWpAdminActivity(
  events: PersistedAgentEvent[],
  id: string,
  input: { label?: string; detail?: string; sourceCount?: number; sources?: AgentActivitySource[] } = {},
  now = Date.now(),
): PersistedAgentEvent[] {
  return completeAgentActivity(events, id, input, now);
}

export function failWpAdminActivity(
  events: PersistedAgentEvent[],
  id: string,
  detail: string,
  canceled = false,
  now = Date.now(),
): PersistedAgentEvent[] {
  return failAgentActivity(events, id, detail, canceled, now);
}

export function settleActiveWpAdminActivities(
  events: PersistedAgentEvent[],
  status: 'failed' | 'canceled',
  detail: string,
): PersistedAgentEvent[] {
  return settleActiveAgentActivities(events, status, detail);
}
