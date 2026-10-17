import { describe, expect, it, vi } from 'vitest';
import { VoiceDrain } from '../../src/pixflow/voice-drain.js';
describe('end voice after native work', () => {
  it('waits through tools and all accepted turns before ending audio', () => {
    const stop = vi.fn(), done = vi.fn(); const drain = new VoiceDrain(stop, done);
    drain.status(true); drain.started('one'); drain.started('two'); drain.requestEnd(); drain.requestEnd();
    expect(stop).not.toHaveBeenCalled(); drain.completed('one'); drain.status(false);
    expect(stop).not.toHaveBeenCalled(); drain.completed('two'); expect(stop).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled(); drain.audioClosed(); expect(done).toHaveBeenCalledOnce();
  });
  it('does not kill work when the audio transport closes early', () => {
    const stop = vi.fn(), done = vi.fn(); const drain = new VoiceDrain(stop, done);
    drain.started('one'); drain.audioClosed(); expect(done).not.toHaveBeenCalled();
    drain.completed('one'); expect(done).toHaveBeenCalledOnce(); expect(stop).not.toHaveBeenCalled();
  });
  it('ends an idle call immediately and only once', () => {
    const stop = vi.fn(); const drain = new VoiceDrain(stop, vi.fn());
    drain.requestEnd(); drain.requestEnd(); expect(stop).toHaveBeenCalledOnce();
  });
});
