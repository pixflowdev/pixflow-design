import { test, expect } from 'vitest';
import { parseClaudeModels, rememberClaudeModels, resolveRuntimeReasoning } from '../../src/runtimes/claude-models.js';
import { claudeAgentDef } from '../../src/runtimes/defs/claude.js';
import { agentCapabilities } from '../../src/runtimes/capabilities.js';

test('effort choices come from each model and are passed only when supported', () => {
 const models = parseClaudeModels([
  {value:'opus',supportedEffortLevels:['low','medium','high','xhigh','max']},
  {value:'legacy',supportedEffortLevels:['low','high']},
  {value:'haiku-old',supportsEffort:false},
 ])!;
 expect(models.find(m=>m.id==='opus')?.reasoningOptions?.map(o=>o.id)).toEqual(['default','low','medium','high','xhigh','max']);
 expect(models.find(m=>m.id==='opus')?.reasoningOptions?.find(o=>o.id==='xhigh')?.label).toBe('Extra');
 rememberClaudeModels(models);
 agentCapabilities.set('claude',{effort:true});
 expect(resolveRuntimeReasoning(claudeAgentDef,'opus','max')).toBe('max');
 expect(resolveRuntimeReasoning(claudeAgentDef,'legacy','max')).toBeUndefined();
 expect(claudeAgentDef.buildArgs('',[],[],{model:'opus',reasoning:'max'})).toContain('--effort');
 expect(claudeAgentDef.buildArgs('',[],[],{model:'opus',reasoning:'max'})).toContain('max');
 for(const options of [{model:'legacy',reasoning:'max'},{model:'haiku-old',reasoning:'high'},{model:'opus',reasoning:'default'}])
  expect(claudeAgentDef.buildArgs('',[],[],options)).not.toContain('--effort');
 agentCapabilities.set('claude',{});
 expect(claudeAgentDef.buildArgs('',[],[],{model:'opus',reasoning:'max'})).not.toContain('--effort');
 rememberClaudeModels(null);
});
