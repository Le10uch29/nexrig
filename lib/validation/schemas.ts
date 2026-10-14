import { z } from "zod";

export const selectionSchema = z.object({
  case: z.string().nullable(),
  motherboard: z.string().nullable(),
  cpu: z.string().nullable(),
  cooler: z.string().nullable(),
  ram: z.string().nullable(),
  // Builds saved before per-module memory existed have no count: they were 2-module kits.
  ramCount: z.number().int().min(1).max(8).default(2),
  gpu: z.string().nullable(),
  storage: z.array(z.string()).max(8),
  psu: z.string().nullable(),
  fans: z.string().nullable(),
});

export const savedBuildSchema = z.object({
  name: z.string().max(120),
  selection: selectionSchema,
});

export const gameSettingsSchema = z.object({
  resolution: z.enum(["1080p", "1440p", "4K"]),
  preset: z.enum(["low", "medium", "high", "ultra"]),
  rayTracing: z.boolean(),
  upscaling: z.enum(["off", "quality", "balanced", "performance"]),
  upscaler: z.enum(["DLSS", "FSR", "XeSS"]).nullable().optional(),
  frameGen: z.boolean().optional(),
});

export const benchmarkInputSchema = z.object({
  gameId: z.string().min(1),
  cpuId: z.string().min(1),
  gpuId: z.string().min(1),
  settings: gameSettingsSchema,
  avgFps: z.number().positive().max(2000),
  low1Fps: z.number().positive().max(2000).optional(),
  sourceLabel: z.string().min(2).max(200),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  testDate: z.string().min(4),
  conditions: z.string().max(400).optional(),
  testConfig: z.string().max(400).optional(),
  method: z.string().max(200).optional(),
  notes: z.string().max(600).optional(),
  gameVersion: z.string().max(60).optional(),
  sampleCount: z.number().int().min(1).max(100),
});

export const agentRequestSchema = z.object({
  question: z.string().max(2000).default(""),
  selection: selectionSchema,
  gameId: z.string().optional(),
  settings: gameSettingsSchema.optional(),
  budgetRub: z.number().int().positive().max(5_000_000).optional(),
});

export type AgentRequest = z.infer<typeof agentRequestSchema>;
