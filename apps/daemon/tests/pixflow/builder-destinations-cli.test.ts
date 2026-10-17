import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBuilderDestinationsCli } from '../../src/pixflow/builder-destinations-cli.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
const common = ['--site-url', 'https://example.com/site', '--headers-file', 'headers.json', '--json'];
const destination = { postId: 42, title: 'New page', status: 'draft', builder: 'gutenberg', editorUrl: 'https://example.com/site/wp-admin/post.php?post=42&action=edit' };
const requestId = 'new-page-request-0001';

beforeEach(() => {
  vi.mocked(readFile).mockImplementation(async path => path === 'headers.json' ? '{"Cookie":"private","X-WP-Nonce":"qa"}' : JSON.stringify({ builder: 'gutenberg', title: 'New page', requestId }));
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('site-owned builder destinations CLI', () => {
  describe.each(['etch', 'elementor'])('%s destinations', builder => {
    const editorUrl = builder === 'etch'
      ? 'https://example.com/site/?etch=magic&post_id=42'
      : 'https://example.com/site/wp-admin/post.php?post=42&action=elementor';
    const target = { ...destination, builder, editorUrl };

    it('lists existing pages through the shared read-only endpoint', async () => {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pages: [target] })));
      vi.stubGlobal('fetch', fetcher);
      await runBuilderDestinationsCli(['list', ...common, '--builder', builder]);
      expect(fetcher.mock.calls[0]![0].searchParams.get('builder')).toBe(builder);
      expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'GET', redirect: 'error' });
    });

    it('creates an empty draft with a reusable request identity', async () => {
      const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ destination: target })));
      vi.stubGlobal('fetch', fetcher);
      const args = ['create', ...common, '--builder', builder, '--title', ' New page ', '--request-id', requestId];
      await runBuilderDestinationsCli(args);
      await runBuilderDestinationsCli(args);
      expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body))).toEqual(Array(2).fill({ action: 'create', builder, title: 'New page', requestId }));
    });

    it('opens an existing page without converting or publishing it', async () => {
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ destination: target })));
      vi.stubGlobal('fetch', fetcher);
      await runBuilderDestinationsCli(['open', ...common, '--builder', builder, '--post-id', '42']);
      expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ action: 'open', builder, postId: 42 });
    });

    it('prepares the brief and assets through the shared handoff endpoint', async () => {
      const input = { requestId, projectId: 'project', conversationId: 'chat', builder, postId: 42, targetTabId: 'tab-1234567890123456', brief: 'Build a bakery page', assets: [{ projectId: 'project', path: 'reference.png' }] };
      vi.mocked(readFile).mockImplementation(async path => path === 'headers.json' ? '{}' : JSON.stringify(input));
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ handoff: { destination: target, editorUrl, status: 'ready' } })));
      vi.stubGlobal('fetch', fetcher);
      await runBuilderDestinationsCli(['handoff', ...common, '--prompt-file', 'brief.json']);
      expect(fetcher.mock.calls[0]![0].searchParams.get('rest_route')).toBe('/pixflow-design/v1/builder-handoffs');
      expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ ...input, action: 'prepare' });
    });

    it('rejects cross-site editor URLs for handoffs', async () => {
      const input = { requestId, projectId: 'project', conversationId: 'chat', builder, postId: 42, targetTabId: 'tab-1234567890123456', brief: 'Build a bakery page' };
      vi.mocked(readFile).mockImplementation(async path => path === 'headers.json' ? '{}' : JSON.stringify(input));
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ handoff: { destination: target, editorUrl: 'https://outside.example/editor', status: 'ready' } }))));
      await expect(runBuilderDestinationsCli(['handoff', ...common, '--prompt-file', 'brief.json'])).rejects.toThrow('outside the selected site');
      expect(process.stdout.write).not.toHaveBeenCalled();
    });
  });
  it('prepares an approved brief through the shared handoff endpoint without starting an external process', async () => {
    const input={requestId,projectId:'project',conversationId:'chat',builder:'gutenberg',postId:42,targetTabId:'tab-1234567890123456',brief:'Build a bakery page',assets:[]};
    vi.mocked(readFile).mockImplementation(async path=>path==='headers.json'?'{}':JSON.stringify(input));
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({handoff:{destination,editorUrl:destination.editorUrl,status:'ready'}})));
    vi.stubGlobal('fetch',fetcher);
    await runBuilderDestinationsCli(['handoff',...common,'--prompt-file','brief.json']);
    expect(fetcher.mock.calls[0]![0].searchParams.get('rest_route')).toBe('/pixflow-design/v1/builder-handoffs');
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({...input,action:'prepare'});
  });
  it('reads handoff status without mutation',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({handoff:{destination,editorUrl:destination.editorUrl,status:'accepted'}})));
    vi.stubGlobal('fetch',fetcher);
    await runBuilderDestinationsCli(['handoff-status',...common,'--handoff-id','receipt123']);
    expect(fetcher.mock.calls[0]![0].searchParams.get('id')).toBe('receipt123');
    expect(fetcher.mock.calls[0]![1].method).toBe('GET');
  });
  it('rejects internal claim operations through the user-facing handoff command',async()=>{
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({action:'claim',id:'receipt'}));
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(runBuilderDestinationsCli(['handoff',...common,'--prompt-file','brief.json'])).rejects.toThrow('Only an approved prepare');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('lists through the same permalink-independent API without mutation or redirects', async () => {
    const payload = { builders: [], pages: [destination], hasMore: false };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal('fetch', fetcher);
    await runBuilderDestinationsCli(['list', ...common, '--builder', 'gutenberg', '--search', 'New & draft']);
    const [url, options] = fetcher.mock.calls[0]! as [URL, RequestInit];
    expect(url.pathname).toBe('/site/');
    expect(url.searchParams.get('rest_route')).toBe('/pixflow-design/v1/builder-destinations');
    expect(url.searchParams.get('builder')).toBe('gutenberg');
    expect(url.searchParams.get('search')).toBe('New & draft');
    expect(options).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(options.body).toBeUndefined();
    expect(process.stdout.write).toHaveBeenCalledWith(JSON.stringify(payload) + '\n');
  });
  it('creates only an empty draft request and retains caller idempotency across retries', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ destination, created: true, reused: false })));
    vi.stubGlobal('fetch', fetcher);
    const args = ['create', ...common, '--builder', 'gutenberg', '--title', ' New page ', '--request-id', requestId];
    await runBuilderDestinationsCli(args);
    await runBuilderDestinationsCli(args);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const bodies = fetcher.mock.calls.map(call => JSON.parse(call[1].body));
    expect(bodies).toEqual([{ action: 'create', builder: 'gutenberg', title: 'New page', requestId }, { action: 'create', builder: 'gutenberg', title: 'New page', requestId }]);
    expect(fetcher.mock.calls[0]![1].redirect).toBe('error');
  });
  it('opens an existing Bricks destination without content or publish fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ destination: { ...destination, builder: 'bricks', editorUrl: 'https://example.com/site/?page_id=42&bricks=run' }, created: false, reused: false })));
    vi.stubGlobal('fetch', fetcher);
    await runBuilderDestinationsCli(['open', ...common, '--builder', 'bricks', '--post-id', '42']);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ action: 'open', builder: 'bricks', postId: 42 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('supports complete JSON requests from a file', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ destination, created: true, reused: false })));
    vi.stubGlobal('fetch', fetcher);
    await runBuilderDestinationsCli(['create', ...common, '--prompt-file', 'request.json']);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ action: 'create', builder: 'gutenberg', title: 'New page', requestId });
  });
  it('supports a JSON request piped through stdin', async () => {
    vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* () { yield JSON.stringify({ builder: 'bricks', postId: 42 }); });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ destination, created: false, reused: false })));
    vi.stubGlobal('fetch', fetcher);
    await runBuilderDestinationsCli(['open', ...common, '--prompt-file', '-']);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ action: 'open', builder: 'bricks', postId: 42 });
  });
  it.each([
    ['create', '--builder', 'gutenberg', '--title', 'New page'],
    ['create', '--builder', 'gutenberg', '--title', 'New page', '--request-id', 'short'],
    ['create', '--builder', 'gutenberg', '--title', ' ', '--request-id', requestId],
    ['open', '--builder', 'bricks', '--post-id', '42.5'],
    ['open', '--builder', 'bricks', '--post-id', '-1'],
    ['open', '--builder', 'unknown', '--post-id', '42'],
    ['list', '--post-id', '42'],
    ['create', '--prompt-file', 'request.json', '--title', 'Conflicting'],
  ])('rejects invalid/ambiguous requests before network access: %j', async (...args) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(runBuilderDestinationsCli([...args, ...common])).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects content and publish fields in JSON rather than forwarding them', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ builder: 'gutenberg', title: 'New page', requestId, content: 'overwrite', status: 'publish' }));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(runBuilderDestinationsCli(['create', ...common, '--prompt-file', 'request.json'])).rejects.toThrow('Unsupported destination field');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['http://example.com', 'https://user:password@example.com', 'https://example.com/?nonce=secret'])('rejects unsafe site URL %s before reading credentials', async site => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    vi.mocked(readFile).mockClear();
    await expect(runBuilderDestinationsCli(['list', '--site-url', site, '--headers-file', 'headers.json'])).rejects.toThrow('HTTPS');
    expect(readFile).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('reports denied requests without retrying mutations', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"message":"Pro access required"}', { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(runBuilderDestinationsCli(['open', ...common, '--builder', 'bricks', '--post-id', '42'])).rejects.toThrow('Pro access required');
    expect(fetcher).toHaveBeenCalledOnce(); expect(process.stdout.write).not.toHaveBeenCalled();
  });
  it('does not trust a cross-site destination URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ destination: { ...destination, editorUrl: 'https://another-site.test/wp-admin/' } }))));
    await expect(runBuilderDestinationsCli(['open', ...common, '--builder', 'gutenberg', '--post-id', '42'])).rejects.toThrow('outside the selected site');
    expect(process.stdout.write).not.toHaveBeenCalled();
  });
});
