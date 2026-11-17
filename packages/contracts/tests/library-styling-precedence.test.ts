import {describe,expect,it} from 'vitest';
import {bricksStylingInstructions} from '../src/api/pixflow-direct-site';

describe('Bricks styling source precedence',()=>{
  it.each([true,false])('defers general styling %s to the explicit Library choice',mode=>{
    const guidance=bricksStylingInstructions(mode);
    expect(guidance).toContain('selected Library styling mode overrides this general styling preference');
    expect(guidance).toContain('preserve the site type and spacing scales');
    expect(guidance).toContain('scoped reference styles');
    expect(guidance).toContain('native Bricks global classes');
  });
});
