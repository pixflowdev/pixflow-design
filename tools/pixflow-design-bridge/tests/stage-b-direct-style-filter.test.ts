import { describe, expect, it } from 'vitest';

import { filterStageBIntrinsicAutoWidthKeys } from '../stage-b-direct-style-controls.mjs';

describe('Stage B direct style filtering', () => {
  it('accepts converter-owned intrinsic auto width while rejecting authored element widths', () => {
    expect(filterStageBIntrinsicAutoWidthKeys(['_width'], {
      _width: 'auto',
      _cssGlobalClasses: ['source-class'],
    })).toEqual([]);

    expect(filterStageBIntrinsicAutoWidthKeys(['_width'], {
      _width: '50%',
      _cssGlobalClasses: ['source-class'],
    })).toEqual(['_width']);
  });

  it('accepts responsive intrinsic auto width without exempting another width breakpoint', () => {
    expect(filterStageBIntrinsicAutoWidthKeys(['_width:tablet_portrait', '_width:mobile_portrait'], {
      '_width:tablet_portrait': 'auto',
      '_width:mobile_portrait': '100%',
      _cssGlobalClasses: ['source-class'],
    })).toEqual(['_width:mobile_portrait']);
  });
});
