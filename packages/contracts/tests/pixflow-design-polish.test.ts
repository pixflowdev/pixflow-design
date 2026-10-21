import { expect, it } from 'vitest';
import { optionalRunGuidance } from '../src/prompts/pixflow-design-polish.js';
import type { PixflowRunDesignGuidance } from '../src/api/pixflow-direct-site.js';
const guidance: PixflowRunDesignGuidance = {revision: 0, source: 'existing', product: '', instructions: '', extension: {instructions: 'Optional authorized guidance', commands: {'/operation check': 'Read the check reference'}}};
it('Free never receives premium instructions even with stale enabled preferences or a typed command', () => {
 expect(optionalRunGuidance(true, null, '/operation check')).toBe('');
 expect(optionalRunGuidance(false, undefined, '/operation check')).toBe('');
});
it('preserves off and explicit operation semantics', () => {
 expect(optionalRunGuidance(false, guidance, 'check something')).toBe('');
 expect(optionalRunGuidance(true, guidance, 'normal request')).toBe('Optional authorized guidance');
 expect(optionalRunGuidance(false, guidance, '/operation check this')).toContain('Read the check reference');
 expect(optionalRunGuidance(false, guidance, 'mentions /operation check')).toBe('');
 expect(optionalRunGuidance(false, guidance, '/operation checker')).toBe('');
});
