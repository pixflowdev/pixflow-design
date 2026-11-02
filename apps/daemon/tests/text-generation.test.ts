import {describe,it,expect} from 'vitest';
import {textGenerationArgs,validateTextRequest} from '../src/runtimes/text-generation.js';
describe('isolated agent text requests',()=>{
  it('accepts bounded text and an explicit supported runtime only',()=>{
    expect(validateTextRequest({agentId:'codex',model:'default',prompt:'Translate'}).agentId).toBe('codex');
    for(const change of [{agentId:'shell'},{model:'--shell'},{prompt:' '},{prompt:'x'.repeat(100001)}])expect(()=>validateTextRequest({agentId:'claude',model:'default',prompt:'Translate',...change})).toThrow();
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
