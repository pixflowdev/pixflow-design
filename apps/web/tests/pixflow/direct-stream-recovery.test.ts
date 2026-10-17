import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoverDirectStream, StreamAttachmentHttpError } from '../../src/pixflow/direct-stream-recovery';

afterEach(() => vi.useRealTimers());
describe('owned stream attachment recovery', () => {
  it.each([408,429,502,503])('retries temporary HTTP %s with bounded backoff', async status => {
    vi.useFakeTimers();
    const attach=vi.fn().mockRejectedValueOnce(new StreamAttachmentHttpError(status,'Temporary')).mockResolvedValue('attached');
    const result=recoverDirectStream(attach,new AbortController().signal);
    await vi.advanceTimersByTimeAsync(499);
    expect(attach).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe('attached');
    expect(attach).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([400,401,403,404,409])('does not hide HTTP %s behind retries', async status => {
    const failure=new StreamAttachmentHttpError(status,'Rejected');
    const attach=vi.fn().mockRejectedValue(failure);
    await expect(recoverDirectStream(attach,new AbortController().signal)).rejects.toBe(failure);
    expect(attach).toHaveBeenCalledTimes(1);
  });
  it('bounds a persistent outage to three attachment attempts', async () => {
    vi.useFakeTimers();
    const failure=new TypeError('Failed to fetch');
    const attach=vi.fn().mockRejectedValue(failure);
    const result=expect(recoverDirectStream(attach,new AbortController().signal)).rejects.toBe(failure);
    await vi.runAllTimersAsync();
    await result;
    expect(attach).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('stops immediately during backoff without another attachment', async () => {
    vi.useFakeTimers();
    const controller=new AbortController();
    const attach=vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result=expect(recoverDirectStream(attach,controller.signal)).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await result;
    expect(attach).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('times out stalled attachment but never expires an attached stream', async () => {
    vi.useFakeTimers();
    let streamingSignal: AbortSignal | undefined;
    const attach=vi.fn().mockImplementationOnce((signal: AbortSignal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})))
      .mockImplementationOnce(async(signal: AbortSignal)=>{streamingSignal=signal;return 'attached';});
    const stop=new AbortController();
    const result=recoverDirectStream(attach,stop.signal);
    await vi.advanceTimersByTimeAsync(10_500);
    expect(await result).toBe('attached');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(streamingSignal?.aborted).toBe(false);
    stop.abort();
    expect(streamingSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
