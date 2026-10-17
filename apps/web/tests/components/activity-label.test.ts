import { expect, it } from 'vitest';
import { en } from '../../src/i18n/locales/en';
import { activityAction, completedActivityLabel, liveActivityLabel } from '../../src/components/chat/activity-label';
const t = (key: keyof typeof en) => en[key];

it.each(['Bash', 'bash', 'run_shell_command', 'exec_command', 'execute', 'run_command'])('normalizes command tools from different providers: %s', name => {
  expect(liveActivityLabel(name, { description: 'Check mobile spacing' }, t)).toBe('Check mobile spacing');
  expect(completedActivityLabel([name], t)).toBe('Ran commands');
});
it('uses file targets and deduplicates completed action types', () => {
  expect(liveActivityLabel('read_file', { path: 'C:\\site\\style.css' }, t)).toBe('Reading style.css');
  expect(completedActivityLabel(['mcp__browser__click','Edit','write','Bash','Bash'], t))
    .toBe('Used the browser, Edited files, Ran commands');
});
it('does not guess actions or expose command arguments', () => {
  expect(liveActivityLabel('Bash', { command: 'curl -H secret https://example.com' }, t)).toBe('Running a command');
  expect(activityAction('unknown')).toBe('tools');
  expect(completedActivityLabel([], t)).toBe('done');
});
it('describes literal Codex shell reads without displaying the surrounding shell or arguments', () => {
  expect(liveActivityLabel('Bash', {command:'powershell.exe -Command \'Get-Content -Raw BRICKS-CONTEXT.md\''}, t)).toBe('Reading BRICKS-CONTEXT.md');
  expect(liveActivityLabel('Bash', {command:'Get-Content $privatePath'}, t)).toBe('Running a command');
});
