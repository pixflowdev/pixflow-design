/** Coalesce presentation work, with a timer for hidden documents. Never schedules execution. */
export function createFrameCheckpoint(publish: () => void, maxDelay = 100) {
  let dirty = false;
  let disposed = false;
  let frame: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (timer !== undefined) clearTimeout(timer);
    frame = undefined; timer = undefined;
  };
  const flush = () => {
    clear();
    if (!dirty || disposed) return;
    dirty = false;
    publish();
  };
  return {
    schedule() {
      if (disposed) return;
      dirty = true;
      if (timer !== undefined) return;
      timer = setTimeout(flush, maxDelay);
      if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(flush);
    },
    flush,
    dispose() { clear(); dirty = false; disposed = true; },
  };
}
