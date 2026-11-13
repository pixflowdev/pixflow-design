// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useMediaUploads} from '../../src/components/useMediaUploads';
afterEach(cleanup);
it('processes a batch serially, reports failures and retries only the failed image',async()=>{
 const settled=vi.fn();const {result}=renderHook(()=>useMediaUploads(settled));
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 const calls:string[]=[];let fail=true;
 act(()=>result.current.add([new File([],'one.png'),new File([],'two.png')],file=>async progress=>{
  calls.push(file.name);progress(100);
  if(file.name==='one.png'){await gate;if(fail)throw new Error('Bridge disconnected');}
 }));
 expect(calls).toEqual(['one.png']);
 expect(result.current.jobs.map(j=>j.status)).toEqual(['processing','queued']);
 await act(async()=>release());
 await waitFor(()=>expect(result.current.jobs.map(j=>j.status)).toEqual(['error','done']));
 expect(result.current.jobs[0]?.error).toBe('Bridge disconnected');
 fail=false;act(()=>result.current.retry(result.current.jobs[0]!));
 await waitFor(()=>expect(result.current.jobs.every(j=>j.status==='done')).toBe(true));
 expect(calls).toEqual(['one.png','two.png','one.png']);
 expect(settled).toHaveBeenCalledTimes(2);
 act(()=>result.current.clear());expect(result.current.jobs).toEqual([]);
});

it('dismisses only completed preview renders', async () => {
 vi.useFakeTimers();
 try {
  const {result}=renderHook(()=>useMediaUploads(()=>{}));
  await act(async()=>{
   result.current.add([new File([],'preview.png')],()=>async()=>{},'preview');
   result.current.add([new File([],'copy.png')],()=>async()=>{},'copy');
   result.current.add([new File([],'failed-preview.png')],()=>async()=>{throw new Error('Render failed');},'preview');
  });
  expect(result.current.jobs.map(job=>job.status)).toEqual(['done','done','error']);
  act(()=>vi.advanceTimersByTime(2500));
  expect(result.current.jobs.map(job=>job.file.name)).toEqual(['copy.png','failed-preview.png']);
 } finally {
  vi.useRealTimers();
 }
});
