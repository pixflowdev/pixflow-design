// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { useMediaUploads } from '../../src/components/useMediaUploads';
it('queues extra batches, reports transfer/processing, continues after failure and retries only the failed file',async()=>{
 const settled=vi.fn();const {result}=renderHook(()=>useMediaUploads(settled));
 let finish!:()=>void;let progress!:(percent:number)=>void;
 const first=vi.fn((onProgress:(percent:number)=>void)=>{progress=onProgress;return new Promise<void>(resolve=>{finish=resolve;});});
 const failed=vi.fn().mockRejectedValueOnce(new Error('Server rejected file')).mockResolvedValue(undefined);
 const third=vi.fn().mockResolvedValue(undefined);
 act(()=>result.current.add([new File(['a'],'a.png'),new File(['b'],'b.png')],file=>file.name==='a.png'?first:failed));
 act(()=>result.current.add([new File(['c'],'c.png')],()=>third));
 expect(result.current.jobs.map(j=>j.status)).toEqual(['uploading','queued','queued']);
 act(()=>progress(45));expect(result.current.jobs[0]!.progress).toBe(45);
 act(()=>progress(100));expect(result.current.jobs[0]!.status).toBe('processing');
 await act(async()=>finish());
 await waitFor(()=>expect(result.current.jobs.map(j=>j.status)).toEqual(['done','error','done']));
 expect(result.current.jobs[1]!.error).toBe('Server rejected file');
 act(()=>result.current.retry(result.current.jobs[1]!));
 await waitFor(()=>expect(result.current.jobs.every(j=>j.status==='done')).toBe(true));
 expect(first).toHaveBeenCalledTimes(1);expect(failed).toHaveBeenCalledTimes(2);expect(third).toHaveBeenCalledTimes(1);
 act(()=>result.current.clear());expect(result.current.jobs).toEqual([]);
});
