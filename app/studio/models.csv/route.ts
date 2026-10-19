import { buildInventory, inventoryCsv } from "@/features/models/inventory";
import { getMessages } from "@/lib/i18n";

/** Full list of 3D models per catalog component (CSV for Excel). Static: rebuilt with the catalog. */
export function GET() {
  const t = getMessages();
  return new Response(inventoryCsv(buildInventory(), (c) => t.categories[c]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="nexrig-3d-models.csv"',
    },
  });
}
