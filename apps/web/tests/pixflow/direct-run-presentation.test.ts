import { expect, it } from 'vitest';
import { directRunFailurePresentation } from '../../src/pixflow/direct-run-presentation';
it('does not surface intentional Stop as an error banner', () => {
 expect(directRunFailurePresentation(new DOMException('Stopped.', 'AbortError'), true, 'failed')).toEqual({stopped:true,failureStatus:'canceled',failure:''});
 expect(directRunFailurePresentation(new Error('Stopped.'), false, 'canceled').failure).toBe('');
});
it('retains actual provider errors for retry', () => {
 expect(directRunFailurePresentation(new Error('Connection lost'), false, 'failed')).toEqual({stopped:false,failureStatus:'failed',failure:'Connection lost'});
});
