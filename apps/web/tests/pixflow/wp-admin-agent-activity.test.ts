import { describe, expect, it } from 'vitest';

import {
  completeWpAdminActivity,
  failWpAdminActivity,
  mergeWpAdminProviderEvent,
  sanitizeWpAdminProviderEvents,
  startWpAdminActivity,
  updateWpAdminResearchActivity,
} from '../../src/pixflow/wp-admin-agent-activity';

describe('WP Admin agent activity lifecycle', () => {
  it('creates and updates one durable research activity instead of a descriptive message status', () => {
    const started = startWpAdminActivity([], {
      id: 'research-1',
      phase: 'researching',
      label: 'Researching current public sources…',
    });
    expect(started).toEqual([expect.objectContaining({
      kind: 'activity', id: 'research-1', origin: 'pixflow', phase: 'researching', status: 'started',
    })]);

    const progressed = updateWpAdminResearchActivity(started, 'research-1', {
      sourceCount: 2,
      detail: '2 sources found',
    });
    expect(progressed).toHaveLength(1);
    expect(progressed[0]).toMatchObject({ status: 'progress', sourceCount: 2, detail: '2 sources found' });
  });

  it('settles active activity on success, failure, and cancellation', () => {
    const active = startWpAdminActivity([], {
      id: 'research-1', phase: 'researching', label: 'Researching…',
    });
    expect(completeWpAdminActivity(active, 'research-1', {
      label: 'Researched 1 source',
      sourceCount: 1,
      sources: [{ title: 'WordPress', url: 'https://wordpress.org/', provider: 'public-web' }],
    })[0]).toMatchObject({ status: 'succeeded', sourceCount: 1 });
    expect(failWpAdminActivity(active, 'research-1', 'Provider quota exceeded')[0])
      .toMatchObject({ status: 'failed', detail: 'Provider quota exceeded' });
    expect(failWpAdminActivity(active, 'research-1', 'Stopped.', true)[0])
      .toMatchObject({ status: 'canceled', detail: 'Stopped.' });
  });

  it('derives the same research lifecycle from any provider search tool', () => {
    const started = mergeWpAdminProviderEvent([], {
      kind: 'tool_use', id: 'tool-1', name: 'mcp__tavily__search', input: { query: 'WordPress' },
    }, 100);
    expect(started).toContainEqual(expect.objectContaining({
      kind: 'activity', id: 'provider-research:tool-1', origin: 'provider',
      phase: 'researching', status: 'started',
    }));

    const completed = mergeWpAdminProviderEvent(started, {
      kind: 'tool_result', toolUseId: 'tool-1', content: 'done', isError: false,
    }, 200);
    expect(completed).toContainEqual(expect.objectContaining({
      kind: 'activity', id: 'provider-research:tool-1', status: 'succeeded', endedAt: 200,
    }));
  });

  it('keeps provider activity but removes internal text and raw protocol payloads', () => {
    expect(sanitizeWpAdminProviderEvents([
      { kind: 'status', label: 'thinking' },
      { kind: 'text', text: '{"internal":"semantic-contract"}' },
      { kind: 'raw', value: '<transport-frame>' },
    ], 'Visible answer')).toEqual([
      { kind: 'status', label: 'thinking' },
      { kind: 'text', text: 'Visible answer' },
    ]);
  });
});
