import { describe, expect, it } from 'vitest';
import { contextBudget } from '../../src/pixflow/context-budget';
const direct = {model:'gpt-6-luna',apiProtocol:'openai',baseUrl:'https://api.openai.com/v1',apiTransport:'direct',maxTokens:8192} as const;
describe('working context budgets', () => {
 it('gives verified current models more room without using their entire advertised window', () => {
  expect(contextBudget(direct)).toEqual({triggerBytes:192000,growthBytes:24000,knownModel:true});
 });
 it('selects the actual Composio model independently of the direct model', () => {
  expect(contextBudget({...direct,model:'unknown',apiTransport:'composio',composioProvider:'connection-123',composioModel:'openai/gpt-6-luna'}).triggerBytes).toBe(192000);
  expect(contextBudget({...direct,apiTransport:'composio',composioProvider:'openai',composioModel:'unknown'}).triggerBytes).toBe(48000);
 });
 it('never infers capacity from a custom endpoint or a similar model name', () => {
  expect(contextBudget({...direct,baseUrl:'https://proxy.example'}).knownModel).toBe(false);
  expect(contextBudget({...direct,model:'gpt-6-luna-custom'}).triggerBytes).toBe(48000);
  expect(contextBudget({...direct,model:'constructor'}).triggerBytes).toBe(48000);
 });
 it('reserves fixed context and output space instead of increasing the window', () => {
  expect(contextBudget(direct, 2000000).triggerBytes).toBeLessThan(192000);
  expect(contextBudget({...direct,maxTokens:700000}).triggerBytes).toBe(6144);
  expect(contextBudget({...direct,maxTokens:NaN}).triggerBytes).toBe(192000);
 });
});
