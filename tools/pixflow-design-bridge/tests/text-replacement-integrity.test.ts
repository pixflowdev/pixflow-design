import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeQuickTextEditResult, genericTargetSelectionRejection, renderQuickTextEditRunnerPrompt } from '../bricks-handoff-cli.mjs';

// Native Node import exercises the directly executable compatibility runtime.
const targets = [
  { elementId: 'heading', fieldKey: 'text', currentText: 'Sharper.', targetLabel: 'Heading' },
  { elementId: 'button', fieldKey: 'text', currentText: 'Start a conversation', targetLabel: 'Button' },
];
const request = { mode: 'design', modelLed: true, fieldKey: 'text', currentText: 'Sharper.', targets };
const replacement = { elementId: 'button', fieldKey: 'text', replacementText: "Let's talk" };

for (const [name, replacements] of [
  ['unknown target', [{ ...replacement, elementId: 'button-wrapper' }]],
  ['wrong field on a known target', [{ ...replacement, fieldKey: 'url' }]],
  ['missing target', [{ fieldKey: 'text', replacementText: "Let's talk" }]],
  ['missing field', [{ elementId: 'button', replacementText: "Let's talk" }]],
  ['partially valid batch', [replacement, { ...replacement, elementId: 'missing' }]],
  ['explicitly empty batch', []],
  ['duplicate target field', [replacement, replacement]],
] as const) {
  test(`rejects ${name} without selected-element fallback`, () => {
    const result = normalizeQuickTextEditResult({ action: 'replace', replacements, replacementText: "Let's talk" }, request, null);
    assert.equal(result.status, 'escalate');
    assert.equal(result.action, 'escalate');
    assert.equal(result.replacementText, '');
    assert.deepEqual(result.replacements, []);
  });
}
test('cannot authorize a replacement without a live inventory', () => {
  const result = normalizeQuickTextEditResult({ action: 'replace', replacements: [replacement] }, { ...request, targets: [] }, null);
  assert.equal(result.status, 'escalate');
});
test('keeps an exact agent-chosen button target despite a different selection', () => {
  const result = normalizeQuickTextEditResult({ action: 'replace', replacements: [replacement] }, request, null);
  assert.equal(result.status, 'completed');
  assert.equal(result.replacements[0].elementId, 'button');
  assert.equal(result.replacements[0].fieldKey, 'text');
});
test('scalar explicit text decisions stay text decisions in authorized sessions', () => {
  const result = normalizeQuickTextEditResult({ action: 'replace', targetId: 'button', fieldKey: 'text', replacementText: "Let's talk" }, request, null);
  assert.equal(result.action, 'replace');
  assert.equal(result.replacements[0].elementId, 'button');
});
test('authorized sessions still request bounded repair for a missing text target', () => {
  assert.equal(genericTargetSelectionRejection({ action: 'replace', replacementText: "Let's talk" }, request)?.code, 'target_missing');
});
test('the single text response schema asks the agent to name its target and field', () => {
  const prompt = renderQuickTextEditRunnerPrompt({ ...request, prompt: 'Update the button.' });
  assert.ok(prompt.includes('"action":"replace","targetId":"exact live element id","fieldKey":"exact live text field"'));
  assert.ok(!prompt.includes('{"action":"replace","replacementText":"..."'));
});
test('large section descriptions cannot discard the editable target inventory', () => {
  const prompt = renderQuickTextEditRunnerPrompt({
    ...request, prompt: 'Update the button.',
    sections: [{ id: 'hero', text: 'section evidence '.repeat(2000) }],
  });
  const inventory = prompt.split('Editable text target inventory:')[1]?.split('Editable section context:')[0] || '';
  assert.ok(inventory.includes('"elementId": "button"'));
  assert.ok(inventory.includes('"fieldKey": "text"'));
  assert.ok(inventory.includes('Start a conversation'));
});
