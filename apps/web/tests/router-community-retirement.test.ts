import { describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ wordpress: true }));
vi.mock('../src/pixflow/wordpress-context', () => ({ hasPixflowWordPressContext: () => runtime.wordpress }));
import { parseRoute } from '../src/router';

describe.each([true, false])('retired Community routes (WordPress=%s)', (wordpress) => {
  it.each(['/marketplace', '/plugins/example-web-prototype', '/marketplace/example-web-prototype'])(
    'returns %s to the workspace', (path) => {
      runtime.wordpress = wordpress;
      expect(parseRoute(path)).toEqual({ kind: 'home', view: 'home' });
    },
  );
  it('preserves saved projects and personal installed-plugin access', () => {
    runtime.wordpress = wordpress;
    expect(parseRoute('/projects/existing')).toMatchObject({ kind: 'project', projectId: 'existing' });
    expect(parseRoute('/plugins')).toEqual({ kind: 'home', view: wordpress ? 'home' : 'plugins' });
  });
});
