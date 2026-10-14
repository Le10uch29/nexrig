import { GAMES } from "@/data/games";

/** Games with what each supports (static data — prerendered). */
export async function GET() {
  return Response.json({
    items: GAMES.map((g) => ({
      id: g.id,
      title: g.title,
      slug: g.id,
      version: g.version,
      genre: g.genre,
      resolutions: ["1080p", "1440p", "4K"],
      presets: ["low", "medium", "high", "ultra"],
      supportsRayTracing: g.supportsRayTracing,
      upscalers: g.upscalers,
      frameGen: g.frameGen,
      // No measured records ship with the app; numbers come from imports or the model.
      dataStatus: "model-only",
    })),
  });
}
