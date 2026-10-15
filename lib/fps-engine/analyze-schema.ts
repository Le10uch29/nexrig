import { z } from "zod";
import { settingsSchema } from "./api-schemas";

const id = z.string().trim().min(1).max(120);

/** "Протестировать ПК": one build, all resolutions; the settings apply to every game. */
export const analyzeSchema = z.object({
  cpuId: id,
  gpuId: id,
  ram: z
    .object({
      type: z.enum(["DDR3", "DDR4", "DDR5"]),
      speedMtps: z.number().int().min(800).max(12000),
      modules: z.number().int().min(1).max(8),
      moduleGb: z.number().int().min(1).max(256).optional(),
    })
    .optional(),
  settings: settingsSchema.omit({ resolution: true }),
  /** Whole build, for the compatibility check (ids from the catalogue). */
  selection: z
    .object({
      case: id.nullable(),
      motherboard: id.nullable(),
      cpu: id.nullable(),
      cooler: id.nullable(),
      ram: id.nullable(),
      ramCount: z.number().int().min(1).max(8),
      gpu: id.nullable(),
      storage: z.array(id).max(8),
      psu: id.nullable(),
      fans: id.nullable(),
    })
    .optional(),
  gameIds: z.array(id).min(1).max(30).optional(),
  buildVersion: z.string().trim().max(40).optional(),
  /** Skip the cache and run again. */
  force: z.boolean().optional(),
});
