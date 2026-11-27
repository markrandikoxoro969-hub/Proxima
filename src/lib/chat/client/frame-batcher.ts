/**
 * Collects streamed text and hands it to React in small, steady pieces.
 *
 * The AI can send dozens of pieces per second, often in bursts. Re-rendering
 * for every piece wastes battery and drops frames; passing a whole burst
 * through at once makes the reply jump. This queue reveals at most a few
 * characters every ~30ms, and speeds up when a large burst arrives, so the
 * words flow steadily without ever falling far behind the model.
 */
/**
 * Silky 60fps adaptive cadence (~16ms tick) so streamed prose and code glide
 * smoothly without landslide bursts or stuttering jumps.
 */
const TICK_MS = 16;
/** Normal reveal rate: ~14 chars / 16ms (~875 chars/sec, silky typewriter feel). */
const NORMAL_CHARS = 14;
/** Larger chunks glide smoothly over multiple frames instead of dumping all at once. */
const BUSY_CHARS = 32;
const FLOOD_CHARS = 72;
const BUSY_AT = 160;
const FLOOD_AT = 560;

export class FrameBatcher {
  private pending = "";
  private frame: number | null = null;

  constructor(
    private readonly onFlush: (text: string) => void,
    private readonly schedule: (cb: () => void) => number = (cb) =>
      setTimeout(cb, TICK_MS) as unknown as number,
    private readonly cancel: (id: number) => void = (id) => clearTimeout(id),
  ) {}

  push(text: string) {
    if (!text) return;
    this.pending += text;
    this.arm();
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

  private arm() {
    if (this.frame !== null || !this.pending) return;
    this.frame = this.schedule(() => this.tick());
  }

  private tick() {
    this.frame = null;
    if (!this.pending) return;
    const size = this.pending.length;
    const limit = size >= FLOOD_AT ? FLOOD_CHARS : size >= BUSY_AT ? BUSY_CHARS : NORMAL_CHARS;
    const text = this.pending.slice(0, limit);
    this.pending = this.pending.slice(limit);
    this.onFlush(text);
    this.arm();
  }
}
