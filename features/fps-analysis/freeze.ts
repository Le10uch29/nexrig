import { settingsLabel } from "@/lib/fps-engine/analysis";
import { fingerprint } from "@/lib/fps-engine/analysis-stages";
import { fpsCaveats } from "@/lib/fps-engine/engine";
import type { ResolvedBuild } from "@/lib/hardware/repository";
import type { GameSettings } from "@/types/benchmark";
import type { BuildSelection } from "@/types/build";
import type { FrozenBuild } from "./store";

/** What is missing before the build can be tested (CPU and GPU are required). */
export function missingForTest(resolved: Pick<ResolvedBuild, "cpu" | "gpu">): string[] {
  const missing: string[] = [];
  if (!resolved.cpu) missing.push("процессор");
  if (!resolved.gpu) missing.push("видеокарту");
  return missing;
}

/**
 * Snapshot of the build for a test run. The version is a fingerprint of the whole selection and
 * the settings, so two runs of the same build share it and any change produces a new one.
 */
export function freezeBuild(args: {
  selection: BuildSelection;
  resolved: ResolvedBuild;
  settings: GameSettings;
  buildName: string;
  checks: { status: string; categories: string[]; title: string }[];
  now?: Date;
}): FrozenBuild | null {
  const { selection, resolved, settings, buildName, checks } = args;
  const { cpu, gpu, ram } = resolved;
  if (!cpu || !gpu) return null;
  const { resolution: _resolution, ...rest } = settings;
  void _resolution;
  const testSettings = { preset: rest.preset, rayTracing: rest.rayTracing, upscaling: rest.upscaling, upscaler: rest.upscaling === "off" ? null : (rest.upscaler ?? null), frameGen: Boolean(rest.frameGen) };
  const version = fingerprint({ selection, settings: testSettings });
  const parts = [
    { label: "Процессор", value: cpu.name },
    { label: "Видеокарта", value: gpu.name },
    { label: "Память", value: ram ? `${resolved.ramCount} × ${ram.moduleSizeGb} ГБ ${ram.type} ${ram.speedMtps} МТ/с` : "не выбрана" },
    { label: "Материнская плата", value: resolved.motherboard?.name ?? "не выбрана" },
    { label: "Блок питания", value: resolved.psu?.name ?? "не выбран" },
    { label: "Настройки", value: `${settingsLabel(testSettings)}; 1080p, 1440p и 4K` },
  ];
  return {
    request: {
      cpuId: cpu.id,
      gpuId: gpu.id,
      ram: ram ? { type: ram.type, speedMtps: ram.speedMtps, modules: resolved.ramCount, moduleGb: ram.moduleSizeGb } : undefined,
      settings: testSettings,
      buildVersion: version,
      selection,
    },
    buildName,
    version,
    frozenAt: (args.now ?? new Date()).toISOString(),
    parts,
    caveats: fpsCaveats(checks),
  };
}
