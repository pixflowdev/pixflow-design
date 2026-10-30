import { expect, test } from 'vitest';
import { claudeUsageWindows } from '../../src/runtimes/claude-usage.js';
const window=(utilization:number)=>({utilization,resets_at:'2026-11-01T00:00:00Z'});
const payload={rate_limits_available:true,rate_limits:{five_hour:window(20),seven_day:window(10),seven_day_opus:window(90),seven_day_sonnet:window(30),model_scoped:[{display_name:'Fable',...window(70)}]}};
test('Opus and Sonnet receive shared plus only their own model limits',()=>{
 expect(claudeUsageWindows(payload,'claude-opus-5-5').map(w=>w.remainingPercent)).toEqual([80,90,10]);
 expect(claudeUsageWindows(payload,'sonnet').map(w=>w.remainingPercent)).toEqual([80,90,70]);
 expect(claudeUsageWindows(payload,'haiku').map(w=>w.remainingPercent)).toEqual([80,90]);
 expect(claudeUsageWindows(payload,'fable-5-1').map(w=>w.bucket)).toEqual(['claude','claude','Fable']);
});
test('model-scoped server entry replaces legacy entry without duplicate windows',()=>{
 expect(claudeUsageWindows({...payload,rate_limits:{...payload.rate_limits,model_scoped:[{display_name:'Opus',...window(95)}]}},'opus').map(w=>w.remainingPercent)).toEqual([80,90,5]);
});
test('unknown and malformed values never become fabricated usage',()=>{
 expect(claudeUsageWindows({rate_limits_available:false,rate_limits:payload.rate_limits},'opus')).toEqual([]);
 for(const utilization of [null,NaN,-1,101,'50']) expect(claudeUsageWindows({rate_limits_available:true,rate_limits:{five_hour:{utilization}}})).toEqual([]);
 expect(claudeUsageWindows(payload,'default')).toEqual([]);
});

