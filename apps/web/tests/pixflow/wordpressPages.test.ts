import { describe, expect, it } from 'vitest';

import {
  resolvePixflowCurrentBuilderPageTarget,
  type PixflowWordPressPageTarget,
} from '../../src/pixflow/wordpress-pages';

const pages: PixflowWordPressPageTarget[] = [
  { id: 527, title: 'Open Bricks page', status: 'publish', builderUrl: '/527', editLink: null },
  { id: 532, title: 'Stale generated page', status: 'draft', builderUrl: '/532', editLink: null },
];

describe('resolvePixflowCurrentBuilderPageTarget', () => {
  it('falls back to the builder bootstrap post id when the current-page REST probe returns null', () => {
    expect(resolvePixflowCurrentBuilderPageTarget({
      current: null,
      pages,
      builderPostId: 527,
    })).toMatchObject({ id: 527, title: 'Open Bricks page' });
  });

  it('keeps the open builder page authoritative over a stale current-page probe', () => {
    expect(resolvePixflowCurrentBuilderPageTarget({
      current: pages[1]!,
      pages,
      builderPostId: 527,
    })).toMatchObject({ id: 527 });
  });
});
