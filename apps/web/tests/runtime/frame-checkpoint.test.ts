// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createFrameCheckpoint } from '../../src/runtime/frame-checkpoint';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('coalesces work, falls back when animation frames stop, and cancels both clocks', () => {
  vi.useFakeTimers();
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn(cb => { frames.push(cb); return frames.length; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const publish=vi.fn(); const scheduler=createFrameCheckpoint(publish);
  for(let i=0;i<5000;i++) scheduler.schedule();
  expect(frames).toHaveLength(1);
  vi.advanceTimersByTime(100);
  expect(publish).toHaveBeenCalledTimes(1);
  scheduler.schedule(); scheduler.flush();
  expect(publish).toHaveBeenCalledTimes(2);
  scheduler.schedule(); scheduler.dispose();
  vi.runAllTimers(); frames.forEach(cb=>cb(0));
  scheduler.schedule(); scheduler.flush();
  expect(publish).toHaveBeenCalledTimes(2);
});
