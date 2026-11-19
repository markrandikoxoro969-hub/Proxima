/**
 * Collects streamed text and hands it to React at most ONCE PER FRAME.
 *
 * The AI can send dozens of pieces per second. Re-rendering for each one
 * wastes battery and drops frames; batching to requestAnimationFrame keeps
 * the page at 60fps no matter how fast text arrives.
 */
export class FrameBatcher {
  private pending = "";
  private frame: number | null = null;

  constructor(
    private readonly onFlush: (text: string) => void,
    private readonly schedule: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
    private readonly cancel: (id: number) => void = (id) => cancelAnimationFrame(id),
  ) {}

  push(text: string) {
    if (!text) return;
    this.pending += text;
    if (this.frame === null) this.frame = this.schedule(() => this.flush());
  }

  /** Sends anything waiting right now (call before "done"/"error"). */
  flush() {
    if (this.frame !== null) {
      this.cancel(this.frame);
      this.frame = null;
    }
    if (!this.pending) return;
    const text = this.pending;
    this.pending = "";
    this.onFlush(text);
  }

  dispose() {
    if (this.frame !== null) this.cancel(this.frame);
    this.frame = null;
    this.pending = "";
  }
}
