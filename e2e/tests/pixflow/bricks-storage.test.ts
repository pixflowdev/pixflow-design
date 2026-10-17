import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// The native Bricks implementation belongs to the explicitly paired Pro checkout.
const proRoot = process.env.PIXFLOW_DESIGN_PRO_ROOT;
const source = proRoot ? readFileSync(resolve(proRoot, 'wordpress-pro/assets/pixflow-design-builder.js'), 'utf8') : '';
function harness() {
  const values = new Map<string, string>();
  const sessionStorage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  const localStorage = { ...sessionStorage, getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } };
  const settings = { retention: 'on_device' };
  const config = { restBaseUrl: 'https://example.test/wp-json/pixflow', userId: 1 };
  const context = {
    window: { sessionStorage, localStorage, location: { origin: 'https://example.test', pathname: '/' } }, config,
    state: { bricksAgentWorkingMemorySettings: settings, bricksAgentWorkingMemory: {}, bricksAgentRetainedBuildProjectId: '', bricksAgentRetainedBuildGenerationScope: '' },
    resolveCurrentBricksPostId: () => 12, readBricksAgentMemorySettings: () => settings,
    bricksAgentMemoryStorage: () => settings.retention === 'session_only' ? null : localStorage,
    sanitizeBricksAgentMemoryMessages: (value: unknown) => value || [], sanitizeBricksAgentWorkingMemory: (value: unknown) => value || {},
    normalizeBricksAgentRetainedBuildProjectId: () => '', normalizeBricksAgentRetainedBuildGenerationScope: () => '',
    bricksAgentConversationSummary: () => '', BRICKS_AGENT_DEVICE_MEMORY_TTL_MS: 7 * 86400000,
    BRICKS_AGENT_MEMORY_TTL_MS: 86400000, BRICKS_AGENT_MEMORY_BYTE_LIMIT: 262144, BRICKS_AGENT_WORKING_MEMORY_SCHEMA: 'test',
  };
  const scope = source.slice(source.indexOf('function bricksAgentMemoryScope()'), source.indexOf('function readBricksAgentMemorySettings()'));
  const reader = source.slice(source.indexOf('function readBricksAgentMemoryEnvelope()'), source.indexOf('function readBricksAgentMemoryMessages()'));
  const writer = source.slice(source.indexOf('function writeBricksAgentMemoryMessages('), source.indexOf('// The builder-mounted React panel'));
  const api = runInNewContext(`${scope}\n${reader}\n${writer}\n({write:writeBricksAgentMemoryMessages,read:readBricksAgentMemoryEnvelope});`, context) as { write: (value: unknown[]) => void; read: () => {messages: unknown[]} };
  return { api, config, settings };
}
describe.skipIf(!proRoot)('native Bricks transcript storage (explicit Pro source)', () => {
  it('retains a whole streamed answer, provider identity and attachment ownership after sanitization', () => {
    const start = source.indexOf('function compactBricksAgentTranscriptValue(');
    const end = source.indexOf('function sanitizeBricksAgentIntentScalar(', start);
    const sanitize = runInNewContext(`${source.slice(start, end)}\nsanitizeBricksAgentMemoryMessages;`, {
      BRICKS_AGENT_MESSAGE_EVENT_LIMIT: 32, BRICKS_AGENT_MESSAGE_EVENT_CHAR_LIMIT: 1200,
      BRICKS_AGENT_TRANSCRIPT_MESSAGE_CHAR_LIMIT: 12000, BRICKS_AGENT_MEMORY_LIMIT: 24,
      normalizeBricksAgentSessionMode: () => 'design', sanitizeBricksAgentMessageOriginContext: () => null,
    }) as (messages: unknown[]) => Array<{content: string; events: Array<{kind: string; text?: string}>; agentId?: string; agentName?: string; attachments?: unknown[]}>;
    const content = 'A full answer with its beginning intact. '.repeat(70);
    const attachments = [{id:'file',name:'reference.html',path:'uploads/reference.html',projectId:'project'}];
    const result = sanitize([{id:'answer',role:'assistant',agentId:'codex',agentName:'Codex',content,
      attachments,events:Array.from(content, text=>({kind:'text',text}))}])[0]!;
    // Renderers prefer events when present: a clipped tail must never replace content.
    expect(result.events.length ? result.events.filter(e=>e.kind==='text').map(e=>e.text).join('') : result.content).toBe(content);
    expect(result.agentId).toBe('codex');
    expect(result.agentName).toBe('Codex');
    expect(result.attachments).toEqual(attachments);
    const legacy = sanitize([{id:'legacy',role:'assistant',content,events:[{kind:'text',text:'intact. '}]}])[0]!;
    expect(legacy.events).toEqual([]);
    expect(legacy.content).toBe(content.trim());
  });
  it('retains completed text through reload when device storage is full', () => {
    const { api } = harness();
    api.write([{ id: 'owned', role: 'assistant', content: 'Current answer', status: 'complete' }]);
    expect(api.read().messages).toEqual([{ id: 'owned', role: 'assistant', content: 'Current answer', status: 'complete' }]);
  });
  it('does not restore another user or override disabled retention', () => {
    const { api, config, settings } = harness();
    api.write([{ role: 'assistant', content: 'Private thread' }]);
    config.userId = 2;
    expect(api.read().messages).toEqual([]);
    config.userId = 1;
    settings.retention = 'session_only';
    expect(api.read().messages).toEqual([]);
  });
});
