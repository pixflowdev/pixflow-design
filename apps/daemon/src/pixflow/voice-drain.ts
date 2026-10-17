/** Ending audio must never truncate an accepted native agent turn. */
export class VoiceDrain {
  private turns = new Set<string>();
  private active = false;
  private requested = false;
  private closed = false;
  private stopSent = false;
  private finished = false;
  constructor(private stopAudio: () => void, private complete: () => void) {}
  requestEnd(): void { this.requested = true; this.check(); }
  started(id: string): void { this.turns.add(id); }
  completed(id: string): void { this.turns.delete(id); this.check(); }
  status(active: boolean): void { this.active = active; this.check(); }
  audioClosed(): void { this.closed = true; this.check(); }
  private check(): void {
    if (this.finished) return;
    if (this.active || this.turns.size) return;
    if (this.closed) { this.finished = true; this.complete(); return; }
    if (this.requested && !this.stopSent) { this.stopSent = true; this.stopAudio(); }
  }
}
