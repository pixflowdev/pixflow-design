import {describe,it,expect} from 'vitest';
import {agentTextTimeoutMs,agentTextClientTimeoutMs} from '@open-design/contracts';
import {textGenerationArgs,validateTextRequest,createGrokTextCollector} from '../src/runtimes/text-generation.js';
describe('isolated agent text requests',()=>{
  it('allows bounded Grok reasoning without the browser abandoning its live worker',()=>{
    expect(agentTextTimeoutMs('grok-build')).toBe(180_000);
    expect(agentTextTimeoutMs('codex')).toBe(120_000);
    expect(agentTextTimeoutMs('claude')).toBe(120_000);
    for(const provider of ['grok-build','codex','claude']) expect(agentTextClientTimeoutMs(provider)).toBeGreaterThan(agentTextTimeoutMs(provider));
  });
  it('collects Grok public text only and requires terminal success',()=>{
    const stream=createGrokTextCollector();
    stream.accept({type:'thought',data:'private reasoning'});
    stream.accept({type:'text',data:'{"findings":'});
    stream.accept({type:'text',data:'[]}'});
    expect(stream.text).toBe('{"findings":[]}');expect(stream.complete).toBe(false);
    stream.accept({type:'end',stopReason:'end_turn'});expect(stream.complete).toBe(true);
  });
  it('rejects Grok tools, truncated replies and redacts provider errors',()=>{
    for(const type of ['tool_call','tool_call_update'])expect(()=>createGrokTextCollector().accept({type})).toThrow('tool operation');
    for(const stopReason of ['max_tokens','cancelled','refusal','max_turn_requests'])expect(()=>createGrokTextCollector().accept({type:'end',stopReason})).toThrow('complete text response');
    expect(()=>createGrokTextCollector().accept({type:'error',message:'429 secret'})).toThrow('Provider concurrency limited.');
    expect(()=>createGrokTextCollector().accept({type:'error',message:'secret'})).toThrow('could not complete');
  });
  it('supports Grok with bounded reasoning, no tools and a file prompt',()=>{
    const input={agentId:'grok-build',model:'grok-4.7',reasoning:'medium',prompt:'Review evidence'};
    expect(validateTextRequest(input).agentId).toBe('grok-build');
    const args=textGenerationArgs('grok-build',input.model,'medium','C:/private/prompt.txt');
    expect(args).toContain('C:/private/prompt.txt');
    expect(args[args.indexOf('--tools')+1]).toBe('search_tool');
    expect(args).toContain('--no-subagents');
    expect(args).toContain('search_tool,use_tool');
    expect(args).toContain('--disable-web-search');
    expect(args).not.toContain('--always-approve');
    const defaults=textGenerationArgs('grok-build','grok-4.7',undefined,'prompt.txt');
    expect(defaults[defaults.indexOf('--effort')+1]).toBe('medium');
    expect(()=>textGenerationArgs('grok-build','default')).toThrow();
    expect(()=>validateTextRequest({...input,model:'grok-4.5',reasoning:'xhigh'})).toThrow();
  });
  it('accepts bounded text and an explicit supported runtime only',()=>{
    expect(validateTextRequest({agentId:'codex',model:'default',prompt:'Translate'}).agentId).toBe('codex');
    for(const change of [{agentId:'shell'},{model:'--shell'},{prompt:' '},{prompt:'x'.repeat(100001)}])expect(()=>validateTextRequest({agentId:'claude',model:'default',prompt:'Translate',...change})).toThrow();
  });
  it('passes an explicit Codex reasoning effort and rejects unsupported requests',()=>{
    const input={agentId:'codex',model:'gpt-6.1-terra',reasoning:'medium',prompt:'Review the audit'};
    expect(validateTextRequest(input).reasoning).toBe('medium');
    expect(textGenerationArgs('codex',input.model,'medium')).toContain('model_reasoning_effort="medium"');
    for(const reasoning of ['max'] as const){
      expect(validateTextRequest({...input,reasoning}).reasoning).toBe(reasoning);
      expect(textGenerationArgs('codex',input.model,reasoning)).toContain(`model_reasoning_effort="${reasoning}"`);
      expect(()=>validateTextRequest({...input,agentId:'grok-build',model:'grok-4.7',reasoning})).toThrow();
    }
    expect(()=>validateTextRequest({...input,agentId:'claude'})).toThrow();
    expect(()=>validateTextRequest({...input,reasoning:'unexpected'})).toThrow();
    expect(()=>validateTextRequest({...input,reasoning:'ultra'})).toThrow();
  });
  it('disables Claude builtins, MCP, hooks and session persistence',()=>{
    const args=textGenerationArgs('claude','default');
    expect(args[args.indexOf('--tools')+1]).toBe('');
    expect(args).toContain('--strict-mcp-config');expect(args).toContain('mcp__*');
    expect(args).toContain('{"disableAllHooks":true}');expect(args).toContain('--no-session-persistence');
  });
  it('keeps Codex read-only and ephemeral without inherited user tools',()=>{
    const args=textGenerationArgs('codex','model');
    expect(args).toContain('--ignore-user-config');expect(args).toContain('--ephemeral');
    expect(args).toContain('read-only');expect(args).toContain('features.shell_tool=false');
    expect(args).toContain('features.plugins=false');expect(args).toContain('mcp_servers={}');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });
});
