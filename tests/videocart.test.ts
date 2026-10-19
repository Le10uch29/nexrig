import path from "node:path";
import { describe, expect, it } from "vitest";
import { hardwareRepository } from "@/lib/hardware/repository";
import { readFirstSheet } from "@/lib/server/xlsx";
import { chipKey, matchCatalogGpu, parseVideocartRows, VIDEOCART_FILE } from "@/lib/videocart/specs";

const rows = parseVideocartRows(readFirstSheet(path.join(process.cwd(), VIDEOCART_FILE)));
const gpus = hardwareRepository.byCategory("gpu");

describe("graphics_cards_specs.xlsx", () => {
  it("reads every model row with its specs", () => {
    expect(rows.map((r) => r.model)).toEqual(["GeForce GTX 1060", "GeForce GTX 1070", "GeForce GTX 1080 Ti", "GeForce RTX 2060", "Radeon RX 580", "Radeon RX 590", "Radeon RX 5700 XT"]);
    expect(rows[0]).toMatchObject({ vendor: "Nvidia", architecture: "Pascal", memory: "3 ГБ / 6 ГБ", memoryType: "GDDR5", memoryOptionsGb: [3, 6] });
    expect(rows[2].memoryType).toBe("GDDR5X");
  });

  it("matches each row to a catalog card of the same chip", () => {
    for (const row of rows) {
      const gpu = matchCatalogGpu(row, gpus);
      expect(gpu, row.model).toBeDefined();
      expect(gpu!.chip.startsWith(chipKey(row.model)), row.model).toBe(true);
      expect(row.memoryOptionsGb, row.model).toContain(gpu!.vramGb);
    }
  });

  it("does not confuse a chip with its Ti/SUPER sibling", () => {
    const gtx1070 = matchCatalogGpu(rows[1], gpus)!;
    expect(gtx1070.chip).toBe("GTX 1070");
    const rtx2060 = matchCatalogGpu(rows[3], gpus)!;
    expect(rtx2060.chip).toBe("RTX 2060");
  });

  it("picks the larger memory variant when the table lists several", () => {
    expect(matchCatalogGpu(rows[0], gpus)!.vramGb).toBe(6);
  });

  it("locates columns by header, not position", () => {
    const [header, ...body] = [["Модель", "Производитель", "Тип памяти"], ["Radeon RX 580", "AMD", "GDDR5"]];
    expect(parseVideocartRows([header, ...body])[0]).toMatchObject({ model: "Radeon RX 580", vendor: "AMD", memoryType: "GDDR5", architecture: "" });
  });
});
