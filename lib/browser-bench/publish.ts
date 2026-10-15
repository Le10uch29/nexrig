import "server-only";
import { randomUUID } from "node:crypto";
import type { BenchmarkStore, BrowserResultFilter, StoredBrowserResult } from "@/lib/fps-engine/store";
import { BENCH_VERSION } from "./config";
import { checkSubmission, submissionFingerprint, submissionSchema, type PublicBrowserResult } from "./submission";

/** Results a user may have waiting for review at once. */
export const MAX_PENDING_BROWSER_RESULTS = 20;

export type PublishOutcome =
  | { ok: true; status: "unverified"; anomalies: string[] }
  | { ok: false; status: number; error: string; errors?: string[] };

/**
 * Stores a browser benchmark result for review. The payload is re-validated (consistency of the
 * statistics, test version, preset geometry, validity) — the client's numbers are never accepted
 * as confirmed. Only the user id from the session is attached; no IP, location or full UA.
 */
export async function publishBrowserResult(store: BenchmarkStore, userId: string, payload: unknown, now = new Date()): Promise<PublishOutcome> {
  const parsed = submissionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, status: 400, error: "Некорректный результат теста.", errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const s = parsed.data;
  const check = checkSubmission(s);
  if (!check.ok) return { ok: false, status: 422, error: check.errors[0], errors: check.errors };
  const pending = await store.countBrowserResults({ submittedBy: userId, status: "unverified" });
  if (pending >= MAX_PENDING_BROWSER_RESULTS) return { ok: false, status: 429, error: `У вас уже ${pending} результатов на проверке — дождитесь проверки.` };
  const row: StoredBrowserResult = {
    id: randomUUID(),
    version: s.version,
    backend: s.backend,
    preset: s.preset,
    mode: s.mode,
    width: s.width,
    height: s.height,
    frames: s.stats.frames,
    batches: s.stats.batches,
    durationMs: Math.round(s.stats.durationMs),
    wallMs: Math.round(s.stats.wallMs),
    medianFps: s.stats.medianFps,
    meanFps: s.stats.meanFps,
    p1LowFps: s.stats.p1LowFps,
    medianFrameMs: s.stats.medianMs,
    cv: s.stats.cv,
    drift: s.stats.drift,
    windowFps: s.stats.windowFps,
    issues: s.issues,
    anomalies: check.anomalies,
    software: s.software,
    gpuRenderer: s.gpuRenderer || null,
    browser: s.browser || null,
    os: s.os || null,
    logicalCores: s.logicalCores,
    status: "unverified",
    createdAt: now.toISOString(),
    fingerprint: submissionFingerprint(s),
    submittedBy: userId,
  };
  const inserted = await store.insertBrowserResult(row);
  if (!inserted) return { ok: false, status: 409, error: "Этот результат уже опубликован." };
  return { ok: true, status: "unverified", anomalies: check.anomalies };
}

/** Owner's view of a stored result: everything except internal ids. */
export const toOwn = ({ submittedBy: _u, fingerprint: _f, width: _w, height: _h, durationMs: _d, wallMs: _wm, batches: _b, medianFrameMs: _m, windowFps: _wf, issues: _i, logicalCores: _c, reviewedBy: _r, reviewedAt: _ra, ...pub }: StoredBrowserResult): PublicBrowserResult => {
  void [_u, _f, _w, _h, _d, _wm, _b, _m, _wf, _i, _c, _r, _ra];
  return pub;
};

/**
 * Public view: user-provided text (GPU name, browser, OS) is shown only once an admin verified the
 * result — never for unverified or rejected ones.
 */
export const toPublic = (r: StoredBrowserResult): PublicBrowserResult => {
  const pub = toOwn(r);
  return r.status === "verified" ? pub : { ...pub, gpuRenderer: null, browser: null, os: null };
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};

/** Upper bound of verified results read for the summary median. */
const SUMMARY_LIMIT = 2_000;

/**
 * Public results for ONE comparable group: same test version, preset, backend and mode.
 * Only verified results are listed and summarised (software-rendered runs are left out of the
 * median); unverified results are reported as a count only — no values, no user text.
 */
export async function comparableResults(store: BenchmarkStore, group: Required<Pick<BrowserResultFilter, "preset" | "backend" | "mode">> & { version?: string }, page = 1) {
  const filter = { ...group, version: group.version ?? BENCH_VERSION };
  const list = await store.listBrowserResults({ ...filter, status: "verified" }, page, 50);
  const medians: number[] = [];
  for (let p = 1; (p - 1) * 100 < Math.min(list.total, SUMMARY_LIMIT); p++) {
    const chunk = await store.listBrowserResults({ ...filter, status: "verified" }, p, 100);
    medians.push(...chunk.items.filter((r) => !r.software).map((r) => r.medianFps));
    if (chunk.items.length < 100) break;
  }
  const unverified = await store.countBrowserResults({ ...filter, status: "unverified" });
  return {
    group: filter,
    items: list.items.map(toPublic),
    total: list.total,
    verified: { count: medians.length, medianFps: median(medians) },
    unverified: { count: unverified },
  };
}
