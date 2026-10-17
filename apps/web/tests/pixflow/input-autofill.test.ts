// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { installPixflowInputAutofillProtection, protectPixflowInputAutofill } from '../../src/pixflow/input-autofill';

afterEach(() => { document.body.innerHTML = ''; });

it('marks settings secrets as non-login fields without changing values, focus or host login forms', () => {
  document.body.innerHTML = '<form id="host-login"><input autocomplete="username"></form><div id="pixflow-design-root"><input value="keep this"><input type="password" value="test-key"><textarea>draft</textarea></div>';
  const input = document.querySelector<HTMLInputElement>('#pixflow-design-root input')!;
  input.focus(); input.setSelectionRange(2, 5);
  protectPixflowInputAutofill(document);
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('keep this');
  expect(input.selectionStart).toBe(2);
  expect(input.getAttribute('autocomplete')).toBe('off');
  const secret = document.querySelector<HTMLInputElement>('[type=password]')!;
  expect(secret.value).toBe('test-key');
  expect(secret.getAttribute('autocomplete')).toBe('new-password');
  expect(secret.getAttribute('data-1p-ignore')).toBe('true');
  expect(document.querySelector('#host-login input')?.getAttribute('autocomplete')).toBe('username');
});

it('covers portals and controls mounted later by settings actions, including type changes', async () => {
  installPixflowInputAutofillProtection();
  const portal = document.createElement('div'); portal.className = 'pixflow-design-portal-scope';
  portal.innerHTML = '<form><input type="password"><textarea>keep draft</textarea></form>';
  document.body.append(portal);
  await new Promise(resolve => setTimeout(resolve, 0));
  const input = portal.querySelector('input')!;
  expect(input.autocomplete).toBe('new-password');
  expect(portal.querySelector('form')?.getAttribute('autocomplete')).toBe('off');
  input.type = 'text'; input.autocomplete = 'username';
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(input.autocomplete).toBe('off');
  expect(portal.querySelector('textarea')?.value).toBe('keep draft');
});
