import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/pixflow/wordpress-context', () => ({ hasPixflowWordPressContext: () => true }));
import { parseRoute } from '../src/router';

describe('retired WordPress Community routes', () => {
  it.each(['/plugins', '/marketplace', '/plugins/example-web-prototype', '/marketplace/example-web-prototype'])(
    'returns %s to the workspace without mounting catalogue or installation UI', (path) => {
      expect(parseRoute(path)).toEqual({ kind: 'home', view: 'home' });
    },
  );
  it('preserves saved project routes', () => {
    expect(parseRoute('/projects/existing')).toMatchObject({ kind: 'project', projectId: 'existing' });
  });
});
