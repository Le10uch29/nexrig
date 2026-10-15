import type { BackendId } from "./config";

/**
 * What the browser exposes about graphics — and only that. Temperatures, clocks, power and the full
 * hardware configuration are not available to web pages and are not guessed. The GPU name may be
 * hidden or generalised by the browser; then it is reported as unknown.
 */
export interface BackendInfo {
  supported: boolean;
  /** Why it is unavailable (no API, no adapter, context creation failed). */
  reason: string | null;
  /** GPU description as exposed by the browser, if any. */
  renderer: string | null;
  vendor: string | null;
  /** The renderer string was withheld or generalised by the browser. */
  masked: boolean;
  software: boolean;
}

export interface Capabilities {
  webgl2: BackendInfo;
  webgpu: BackendInfo;
  /** Logical processors (navigator.hardwareConcurrency); may be rounded or capped by the browser. */
  logicalCores: number | null;
  /** Approximate device memory in GB (Chromium only, rounded and capped at 8 by design). */
  deviceMemoryGb: number | null;
  browser: string;
  os: string;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|microsoft basic render|warp/i;

export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  return Boolean(renderer && SOFTWARE.test(renderer));
}

const none = (reason: string): BackendInfo => ({ supported: false, reason, renderer: null, vendor: null, masked: true, software: false });

/** Prefers WebGPU on real hardware, falls back to WebGL2; never picks an unsupported backend. */
export function chooseBackend(caps: Pick<Capabilities, "webgl2" | "webgpu">, preference: BackendId | "auto" = "auto"): BackendId | null {
  if (preference !== "auto") {
    const other: BackendId = preference === "webgpu" ? "webgl2" : "webgpu";
    return caps[preference].supported ? preference : caps[other].supported ? other : null;
  }
  if (caps.webgpu.supported && !caps.webgpu.software) return "webgpu";
  if (caps.webgl2.supported) return "webgl2";
  if (caps.webgpu.supported) return "webgpu";
  return null;
}

/** Browser family + major version and OS family — coarse on purpose (no full UA is published). */
export function describeAgent(ua: string): { browser: string; os: string } {
  const pick = (re: RegExp, name: string) => {
    const m = ua.match(re);
    return m ? `${name} ${m[1]}` : null;
  };
  const browser = pick(/Edg\/(\d+)/, "Edge") ?? pick(/OPR\/(\d+)/, "Opera") ?? pick(/Firefox\/(\d+)/, "Firefox") ?? pick(/Chrome\/(\d+)/, "Chrome") ?? pick(/Version\/(\d+).*Safari/, "Safari") ?? "неизвестный браузер";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "неизвестная ОС";
  return { browser, os };
}

function detectWebGL2(): BackendInfo {
  if (typeof document === "undefined") return none("Нет DOM.");
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    if (!gl) return none("Браузер не поддерживает WebGL2 или он отключён.");
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : null;
    const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : null;
    // A caveat context means the browser would fall back to slow (often software) rendering.
    // Needs its own canvas: getContext on a canvas that already has one returns that same context.
    const probe = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    probe?.getExtension("WEBGL_lose_context")?.loseContext();
    const caveat = !probe;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { supported: true, reason: null, renderer, vendor, masked: !renderer || /^(webkit webgl|mozilla|apple gpu)$/i.test(renderer), software: isSoftwareRenderer(renderer) || caveat };
  } catch {
    return none("Не удалось создать контекст WebGL2.");
  }
}

type GpuAdapterInfoLike = { vendor?: string; architecture?: string; description?: string; device?: string; isFallbackAdapter?: boolean };

async function detectWebGPU(): Promise<BackendInfo> {
  const gpu = typeof navigator !== "undefined" ? (navigator as Navigator & { gpu?: { requestAdapter(o?: object): Promise<unknown> } }).gpu : undefined;
  if (!gpu) return none("Браузер не поддерживает WebGPU.");
  try {
    const adapter = (await gpu.requestAdapter({ powerPreference: "high-performance" })) as { info?: GpuAdapterInfoLike; isFallbackAdapter?: boolean } | null;
    if (!adapter) return none("WebGPU есть, но адаптер недоступен (заблокирован или не поддерживается драйвером).");
    const info = adapter.info ?? {};
    const name = [info.description, info.device].find((x) => x && x.trim()) ?? null;
    const label = name ?? ([info.vendor, info.architecture].filter(Boolean).join(" ") || null);
    const fallback = Boolean(info.isFallbackAdapter ?? adapter.isFallbackAdapter);
    return { supported: true, reason: null, renderer: label, vendor: info.vendor || null, masked: !name, software: fallback || isSoftwareRenderer(label) };
  } catch {
    return none("Не удалось запросить адаптер WebGPU.");
  }
}

export async function detectCapabilities(): Promise<Capabilities> {
  const [webgl2, webgpu] = [detectWebGL2(), await detectWebGPU()];
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : null;
  const agent = describeAgent(nav?.userAgent ?? "");
  return {
    webgl2,
    webgpu,
    logicalCores: nav?.hardwareConcurrency || null,
    deviceMemoryGb: nav?.deviceMemory ?? null,
    ...agent,
  };
}
