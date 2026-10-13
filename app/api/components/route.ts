import { hardwareRepository } from "@/lib/hardware/repository";
import { CATEGORY_ORDER, type ComponentCategory } from "@/types/hardware";

/** Read-only hardware API backed by the same repository the UI uses (local demo dataset). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") as ComponentCategory | null;
  const q = url.searchParams.get("q");
  if (category && !CATEGORY_ORDER.includes(category)) {
    return Response.json({ error: "Неизвестная категория." }, { status: 400 });
  }
  const items = q ? hardwareRepository.search(q, 50) : category ? hardwareRepository.byCategory(category) : hardwareRepository.all();
  return Response.json({ source: hardwareRepository.source, count: items.length, items });
}
