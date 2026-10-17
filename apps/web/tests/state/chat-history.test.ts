import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rest, embedded, legacy } = vi.hoisted(() => ({rest: vi.fn(), embedded: vi.fn(), legacy: vi.fn()}));
vi.mock('../../src/pixflow/license', () => ({ requestWordPressRest: rest, isPixflowWordPressEmbed: embedded }));
vi.mock('../../src/state/projects', () => ({ listMessages: legacy }));
import { listMessagePage, prependHistoryPage } from '../../src/state/chat-history';

describe('durable Workspace history paging', () => {
  beforeEach(() => { vi.clearAllMocks(); embedded.mockReturnValue(true); });
  it('requests a bounded page with an opaque cursor', async () => {
    rest.mockResolvedValue({ok:true,body:{messages:[],nextCursor:'older',hasMore:true}});
    expect(await listMessagePage('p','c','a+b/')).toEqual({messages:[],nextCursor:'older',hasMore:true});
    expect(rest).toHaveBeenCalledWith('od/projects/p/conversations/c/messages?limit=50&before=a%2Bb%2F');
  });
  it('reports failed reads instead of replacing existing history with an empty list', async () => {
    rest.mockResolvedValue({ok:false,body:{message:'Unavailable'}});
    await expect(listMessagePage('p','c')).rejects.toThrow('Unavailable');
  });
  it('preserves the native daemon history API', async () => {
    embedded.mockReturnValue(false); legacy.mockResolvedValue([{id:'m',role:'user',content:'Keep me'}]);
    expect((await listMessagePage('p','c')).messages).toHaveLength(1);
    expect(rest).not.toHaveBeenCalled();
  });
  it('preserves live content and chronology when pages overlap or retry', () => {
    const live = [{id:'b',role:'assistant' as const,content:'New streaming text'}];
    const old = [{id:'a',role:'user' as const,content:'Original'},{id:'b',role:'assistant' as const,content:'Old'}];
    const merged = prependHistoryPage(live,old);
    expect(merged.map(m=>m.content)).toEqual(['Original','New streaming text']);
    expect(prependHistoryPage(merged,old)).toEqual(merged);
  });
  it.each([1000, 5000])('loads all %i archived Workspace messages in bounded pages without dropping or duplicating rows', async count => {
    const archive = Array.from({ length: count }, (_, index) => ({ id: `large-${index}`, role: 'assistant' as const, content: `Saved message ${index}`, historySequence: index + 1 }));
    rest.mockImplementation(async (url: string) => {
      const query = new URL(url, 'https://local.invalid').searchParams;
      expect(query.get('limit')).toBe('50');
      const end = query.has('before') ? Number(query.get('before')) : count;
      const start = Math.max(0, end - 50);
      return { ok: true, body: { messages: archive.slice(start, end), nextCursor: start ? String(start) : null, hasMore: start > 0 } };
    });
    let page = await listMessagePage('p', 'c');
    let loaded = page.messages;
    expect(loaded).toHaveLength(50);
    expect(rest).toHaveBeenCalledTimes(1);
    while (page.hasMore) {
      page = await listMessagePage('p', 'c', page.nextCursor!);
      loaded = prependHistoryPage(loaded, page.messages);
    }
    expect(loaded).toEqual(archive);
    expect(rest).toHaveBeenCalledTimes(count / 50);
    expect(legacy).not.toHaveBeenCalled();
  });
});
