import { expect, it } from 'vitest';
import { wpAdminBootstrapContextStatus } from '../../src/pixflow/wp-admin-bootstrap-context';

const nativeContext = (editor: 'etch' | 'elementor') => ({
  editor, screen: { base: editor, isBuilder: true, verified: true },
  object: { kind: 'post', type: 'page', id: 42, verified: true },
});

it.each(['etch', 'elementor'] as const)('keeps verified %s bootstrap ready when the editor intentionally omits an admin refresh URL', editor => {
  expect(wpAdminBootstrapContextStatus(nativeContext(editor))).toBe('ready');
});

it.each([
  undefined, null, {}, [],
  { ...nativeContext('etch'), editor: 'gutenberg' },
  { ...nativeContext('elementor'), editor: 'wp_admin' },
  { ...nativeContext('etch'), screen: { isBuilder: true, verified: false } },
  { ...nativeContext('etch'), screen: { isBuilder: false, verified: true } },
  { ...nativeContext('elementor'), object: { kind: 'post', id: 42, verified: false } },
  { ...nativeContext('elementor'), object: { kind: 'user', id: 42, verified: true } },
  { ...nativeContext('etch'), object: { kind: 'post', id: 0, verified: true } },
  { ...nativeContext('etch'), object: { kind: 'post', id: '42', verified: true } },
])('does not mark ordinary, empty or unverified context ready: %j', context => {
  expect(wpAdminBootstrapContextStatus(context)).toBe('unavailable');
});
