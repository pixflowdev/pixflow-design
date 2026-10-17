import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), stopTree: vi.fn(async () => {}) }));
vi.mock('@open-design/platform', async original => ({ ...await original<typeof import('@open-design/platform')>(), stopChildProcessTree: mocks.stopTree }));
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<typeof import('node:child_process')>(), spawn: mocks.spawn }));
import { runCodexVoice, voiceProgress } from '../../src/pixflow/codex-voice.js';
import { codexNeedsDangerFullAccessSandbox } from '../../src/runtimes/defs/codex.js';

describe('native Codex voice', () => {
  afterEach(() => vi.clearAllMocks());
  it('maps command progress to the canonical tool completion contract', () => {
    expect(voiceProgress('item/started', { item: { type: 'commandExecution', id: 'a', command: 'node site-tool.mjs help' } })).toMatchObject({ type: 'tool_use', id: 'a', name: 'Bash' });
    expect(voiceProgress('item/completed', { item: { type: 'commandExecution', id: 'a', exitCode: 1, aggregatedOutput: 'failed' } })).toEqual({ type: 'tool_result', toolUseId: 'a', content: 'failed', isError: true });
    expect(voiceProgress('item/reasoning/textDelta', { delta: 'private' })).toBeNull();
    expect(voiceProgress('thread/realtime/transcript/done', { role: 'user', text: 'Hello' })).toEqual({ type: 'voice_transcript', role: 'user', text: 'Hello' });
    expect(voiceProgress('thread/realtime/item/completed', { item: { id: 'v3', type: 'transcriptSegment', role: 'assistant', text: 'Hello back' } })).toEqual({ type: 'voice_transcript', role: 'assistant', text: 'Hello back', id: 'v3' });
  });

  function native(error = false, hold = false) {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
    const requests: any[] = [];
    child.stdin.on('data', chunk => {
      const request = JSON.parse(chunk.toString()); requests.push(request);
      if (!request.id) return;
      queueMicrotask(() => {
        child.stdout.write(JSON.stringify({ id: request.id, result: request.method === 'thread/start' ? { thread: { id: 'native-1' } } : {} }) + '\n');
        if (request.method === 'thread/realtime/start') {
          child.stdout.write(JSON.stringify({ method: error ? 'thread/realtime/error' : 'thread/realtime/sdp', params: error ? { message: 'Voice not enabled for this account' } : { sdp: 'answer' } }) + '\n');
          if (!error && !hold) child.stdout.write(JSON.stringify({ method: 'thread/realtime/closed', params: {} }) + '\n');
        }
        if (request.method === 'thread/realtime/stop') child.stdout.write(JSON.stringify({method:'thread/realtime/closed',params:{}})+'\n');
      });
    });
    mocks.spawn.mockReturnValue(child);
    return { child, requests };
  }
  const options = () => ({ executable: 'app-codex', env: {}, cwd: 'workspace', sdp: 'offer', instructions: 'site context', model: 'gpt-6.1-sol', reasoning: 'medium', writable: false, expiresAt: Date.now() + 60_000, signal: new AbortController().signal, onChild: vi.fn(), onEvent: vi.fn(), onSdp: vi.fn() });
  it('uses WebRTC through native auth and keeps SDP out of progress/history', async () => {
    const { child, requests } = native(); const input = options(); await runCodexVoice({...input,voice:'cove'});
    expect(mocks.spawn).toHaveBeenCalledWith('app-codex', ['app-server', '--stdio'], expect.objectContaining({ windowsHide: true }));
    expect(requests.find(item => item.method === 'thread/start').params).toMatchObject({ sandbox: codexNeedsDangerFullAccessSandbox(process.platform,{}) ? 'danger-full-access' : 'workspace-write', model: 'gpt-6.1-sol', developerInstructions: expect.stringContaining('site context') });
    expect(requests.find(item => item.method === 'thread/realtime/start').params).toMatchObject({ version: 'v3', voice:'cove', transport: { type: 'webrtc', sdp: 'offer' }, outputModality: 'audio' });
    expect(input.onSdp).toHaveBeenCalledWith('answer'); expect(input.onEvent).not.toHaveBeenCalled(); expect(mocks.stopTree).toHaveBeenCalledWith(child);
  });
  it('passes the Bridge MCP configuration to the voice thread', async () => {
    const {requests}=native();
    const mcpServers={docs:{url:'https://example.com/mcp',enabled:true}};
    await runCodexVoice({...options(),mcpServers});
    expect(requests.find(item=>item.method==='thread/start').params.config.mcp_servers).toEqual(mcpServers);
  });
  it('surfaces account errors and releases the native process', async () => {
    const { child } = native(true); await expect(runCodexVoice(options())).rejects.toThrow('Voice not enabled'); expect(mocks.stopTree).toHaveBeenCalledWith(child);
  });
  it('interrupts work only when the agent invokes cancellation, leaving audio alive', async () => {
    const {child,requests} = native(false,true); const input = options(); const controller = new AbortController();
    const running = runCodexVoice({...input, signal: controller.signal});
    await vi.waitFor(()=>expect(input.onSdp).toHaveBeenCalled());
    child.stdout.write(JSON.stringify({ method: 'turn/started', params: {turn:{id:'busy'}} })+'\n');
    child.stdout.write(JSON.stringify({ method: 'thread/realtime/transcript/done', params: {role:'user',text:'The stop button is blue.'} })+'\n');
    expect(requests.some(request=>request.method==='turn/interrupt')).toBe(false);
    child.stdout.write(JSON.stringify({ id: 900, method: 'item/tool/call', params: {threadId:'native-1',tool:'cancel_current_work',arguments:{}} })+'\n');
    await vi.waitFor(()=>expect(requests).toContainEqual({id:expect.any(Number),method:'turn/interrupt',params:{threadId:'native-1',turnId:'busy'}}));
    await vi.waitFor(()=>expect(requests.find(request=>request.id===900)?.result?.success).toBe(true));
    expect(requests.some(request=>request.method==='thread/realtime/stop')).toBe(false);
    expect(child.kill).not.toHaveBeenCalled();
    controller.abort(); await running;
  });
  it('does not start a process for an already canceled call', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runCodexVoice({ ...options(), signal: controller.signal })).rejects.toThrow('canceled'); expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('does not start a call with an expired site session', async () => {
    await expect(runCodexVoice({ ...options(), expiresAt: Date.now() - 1000 })).rejects.toThrow('expired'); expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('keeps the native process alive until the working turn finishes after End voice', async () => {
    const {child,requests} = native(false,true); const input = options(); let end: (()=>void) | undefined;
    const running = runCodexVoice({...input,onEndReady: callback => {end=callback;}});
    await vi.waitFor(()=>expect(input.onSdp).toHaveBeenCalled());
    const emit=(method:string,params:unknown)=>child.stdout.write(JSON.stringify({method,params})+'\n');
    emit('turn/started',{turn:{id:'busy'}}); end!();
    expect(requests.some(item=>item.method==='thread/realtime/stop')).toBe(false); expect(child.kill).not.toHaveBeenCalled();
    emit('item/completed',{item:{type:'commandExecution',id:'tool',exitCode:0}});
    expect(child.kill).not.toHaveBeenCalled();
    emit('turn/completed',{turn:{id:'busy',status:'completed'}});
    await running; expect(requests.some(item=>item.method==='thread/realtime/stop')).toBe(true); expect(mocks.stopTree).toHaveBeenCalledWith(child);
  });
});
