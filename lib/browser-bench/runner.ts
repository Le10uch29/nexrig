import { BATCH_MIN_MS, STALL_MS } from "./config";
import { summarize, type Batch, type FrameStats } from "./stats";

/** A workload: render frame `index`, then `sync` resolves once the GPU has finished it. */
export interface BenchRenderer {
  frame(index: number): void;
  sync(): Promise<void>;
  /** Optional on-screen preview, called between batches (outside the timed part). */
  preview?(): void;
}

export interface RunOptions {
  renderer: BenchRenderer;
  warmupMs: number;
  measureMs: number;
  windows: number;
  /** Minimum length of one timed batch (default BATCH_MIN_MS). */
  batchMs?: number;
  signal?: AbortSignal;
  now?: () => number;
  /** Yields to the event loop between batches (keeps the page responsive). */
  yieldFn?: () => Promise<void>;
  isHidden?: () => boolean;
  previewEveryMs?: number;
  onProgress?: (p: { phase: "warmup" | "measure"; elapsedMs: number; totalMs: number; frames: number; lastFps: number | null }) => void;
}

export interface RunResult {
  stats: FrameStats;
  hidden: boolean;
  stalled: boolean;
  /** Phase in which the run was interrupted (hidden tab or suspended page), if any. */
  interruptedIn: "warmup" | "measure" | null;
  batches: Batch[];
}

export class BenchAborted extends Error {
  constructor() {
    super("Тест остановлен.");
    this.name = "BenchAborted";
  }
}

/** Zero-delay yield without the 4 ms clamp of nested setTimeout. */
export function messageChannelYield(): () => Promise<void> {
  if (typeof MessageChannel === "undefined") return () => new Promise((r) => setTimeout(r, 0));
  const ch = new MessageChannel();
  const queue: (() => void)[] = [];
  ch.port1.onmessage = () => queue.shift()?.();
  return () =>
    new Promise<void>((resolve) => {
      queue.push(resolve);
      ch.port2.postMessage(0);
    });
}

/**
 * Warm-up, then measurement for a fixed wall time. Frames are rendered back to back, each one
 * waited for on the GPU, and timed in batches of at least `batchMs`: one batch = one interval of
 * performance.now(), so the timer's coarse resolution cannot quantise the result. The display's
 * refresh rate plays no role. Stops early (and reports where) when the tab is hidden or the page is
 * suspended.
 */
export async function runBenchmark(o: RunOptions): Promise<RunResult> {
  const now = o.now ?? (() => performance.now());
  const yieldFn = o.yieldFn ?? messageChannelYield();
  const isHidden = o.isHidden ?? (() => typeof document !== "undefined" && document.visibilityState === "hidden");
  const batchMs = o.batchMs ?? BATCH_MIN_MS;
  const previewEvery = o.previewEveryMs ?? 250;
  let index = 0;
  let hidden = false;
  let stalled = false;
  let interruptedIn: RunResult["interruptedIn"] = null;
  let lastPreview = -Infinity;

  const loop = async (phase: "warmup" | "measure", durationMs: number, record: Batch[] | null) => {
    const start = now();
    let lastEnd = start;
    let frames = 0;
    for (;;) {
      if (o.signal?.aborted) throw new BenchAborted();
      if (isHidden()) {
        hidden = true;
        interruptedIn = phase;
        return;
      }
      const t0 = now();
      if (t0 - lastEnd > STALL_MS) {
        stalled = true;
        interruptedIn = phase;
        return;
      }
      // One batch: frames back to back until at least batchMs has passed.
      let n = 0;
      let t1 = t0;
      do {
        o.renderer.frame(index++);
        await o.renderer.sync();
        n++;
        t1 = now();
      } while (t1 - t0 < batchMs);
      lastEnd = t1;
      frames += n;
      record?.push({ frames: n, ms: t1 - t0 });
      if (o.renderer.preview && t1 - lastPreview > previewEvery) {
        o.renderer.preview();
        lastPreview = t1;
      }
      const elapsed = t1 - start;
      o.onProgress?.({ phase, elapsedMs: elapsed, totalMs: durationMs, frames: record ? frames : 0, lastFps: t1 > t0 ? (n * 1000) / (t1 - t0) : null });
      if (elapsed >= durationMs) return elapsed;
      await yieldFn();
    }
  };

  await loop("warmup", o.warmupMs, null);
  const batches: Batch[] = [];
  let wallMs = 0;
  if (!hidden && !stalled) {
    const start = now();
    await loop("measure", o.measureMs, batches);
    wallMs = now() - start;
  }
  return { stats: summarize(batches, o.windows, wallMs), hidden, stalled, interruptedIn, batches };
}
