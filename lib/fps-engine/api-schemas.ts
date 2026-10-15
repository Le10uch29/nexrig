import { z } from "zod";

/** Request bodies for the public FPS API. */
export const settingsSchema = z.object({
  resolution: z.enum(["1080p", "1440p", "4K"]),
  preset: z.enum(["low", "medium", "high", "ultra"]),
  rayTracing: z.boolean().default(false),
  upscaling: z.enum(["off", "quality", "balanced", "performance"]).default("off"),
  upscaler: z.enum(["DLSS", "FSR", "XeSS"]).nullable().optional(),
  frameGen: z.boolean().optional(),
});

const id = z.string().trim().min(1).max(120);

export const rigSchema = z.object({
  cpuId: id,
  gpuId: id,
  ram: z
    .object({ type: z.enum(["DDR3", "DDR4", "DDR5"]), speedMtps: z.number().int().min(800).max(12000), modules: z.number().int().min(1).max(8) })
    .optional(),
});

export const estimateSchema = rigSchema.extend({ gameId: id, settings: settingsSchema });

export const compareSchema = z.object({
  gameId: id,
  settings: settingsSchema,
  configs: z.array(rigSchema.extend({ label: z.string().max(60).optional() })).min(1).max(4),
  resolutions: z.array(z.enum(["1080p", "1440p", "4K"])).max(3).optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  gameId: id.optional(),
  cpuId: id.optional(),
  gpuId: id.optional(),
  resolution: z.enum(["1080p", "1440p", "4K"]).optional(),
  preset: z.enum(["low", "medium", "high", "ultra"]).optional(),
  rayTracing: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  frameGen: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  sourceId: z.string().max(40).optional(),
  verification: z.enum(["unverified", "verified", "rejected", "any"]).optional(),
});

export const patchSchema = z.object({
  id,
  avgFps: z.number().min(1).max(1000).optional(),
  low1Fps: z.number().min(1).max(1000).optional(),
  notes: z.string().max(500).optional(),
  method: z.string().max(200).optional(),
  gameVersion: z.string().max(60).optional(),
  verification: z.enum(["unverified", "verified", "rejected"]).optional(),
});

export const importSchema = z.object({
  format: z.enum(["csv", "json"]),
  content: z.string().min(1),
  mode: z.enum(["preview", "commit"]),
  sourceId: z.string().max(40).default("nexrig"),
  notes: z.string().max(300).optional(),
});

/** Uniform 400 response with field messages (no internals). */
export function badRequest(error: z.ZodError) {
  return Response.json({ error: "Некорректные параметры запроса.", issues: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
}
