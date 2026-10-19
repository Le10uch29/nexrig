"use client";

import { useState } from "react";
import { buildInventory, type InventoryCategory } from "@/features/models/inventory";
import { useModelPreviews } from "@/features/models/preview";
import { useMessages } from "@/lib/i18n";
import { IconChevron, IconDownload, IconSearch } from "@/components/ui/icons";
import { cx, inputCls } from "@/components/ui/primitives";

const PAGE = 120;

function Coverage({ cat }: { cat: InventoryCategory }) {
  const pct = cat.total ? Math.round((cat.withGlb / cat.total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-panel-3" role="progressbar" aria-label="Доля GLB" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="block h-full rounded-full bg-violet" style={{ width: `${pct}%` }} />
      </span>
      <span className="num text-[12px] text-fg-2">
        {cat.withGlb}/{cat.total}
      </span>
    </div>
  );
}

function statusOf(cat: InventoryCategory) {
  if (!cat.glbSupported) return { text: "Только процедурная (составная модель)", cls: "text-fg-3" };
  if (cat.proceduralRemovable) return { text: "Все детали на GLB — процедурную можно удалить", cls: "text-ok" };
  if (cat.withGlb > 0) return { text: "Частично GLB — процедурная нужна как запасная", cls: "text-warn" };
  return { text: "Процедурная — ждёт GLB", cls: "text-fg-2" };
}

/**
 * Studio → list of models: every catalog component with the model it renders today and the
 * registry keys a GLB can be registered under. Old procedural models stay until a category is fully covered.
 */
export function ModelInventory() {
  const t = useMessages();
  const previewAssets = useModelPreviews((s) => s.assets);
  const inventory = buildInventory(undefined, previewAssets);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const total = inventory.reduce((s, c) => s + c.total, 0);
  const glb = inventory.reduce((s, c) => s + c.withGlb, 0);

  return (
    <div className="scroll-thin relative mx-auto w-full max-w-[1200px] px-4 pt-[120px] pb-10 lg:pt-24 lg:absolute lg:inset-0 lg:max-w-none lg:overflow-y-auto lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[26px] font-semibold tracking-tight">3D-модели комплектующих</h2>
            <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-fg-2">
              Какая модель показывается у каждой детали каталога. Процедурные модели остаются запасными, пока у всех деталей категории нет GLB; после полной замены процедурную модель категории можно удалить.
            </p>
          </div>
          <a href="/studio/models.csv" download className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-panel-2 px-3.5 text-sm font-medium hover:border-line-strong hover:bg-panel-3">
            <IconDownload /> Список CSV ({total})
          </a>
        </div>

        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <dt className="eyebrow">Деталей в каталоге</dt>
            <dd className="num text-[26px] font-semibold">{total}</dd>
          </div>
          <div>
            <dt className="eyebrow">С моделью GLB</dt>
            <dd className="num text-[26px] font-semibold text-violet">{glb}</dd>
          </div>
          <div>
            <dt className="eyebrow">Процедурных моделей</dt>
            <dd className="num text-[26px] font-semibold">{inventory.length}</dd>
          </div>
        </dl>

        <div className="mt-6 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-panel/80 backdrop-blur-md">
          <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_140px_minmax(0,1.6fr)_32px] gap-4 border-b border-line px-5 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase md:grid">
            <span>Категория</span>
            <span>Процедурная модель</span>
            <span>GLB</span>
            <span>Состояние</span>
            <span />
          </div>
          {inventory.map((cat) => {
            const s = statusOf(cat);
            const isOpen = open === cat.category;
            const q = query.trim().toLowerCase();
            const items = isOpen ? cat.items.filter((i) => !q || `${i.brand} ${i.name} ${i.id}`.toLowerCase().includes(q)) : [];
            return (
              <div key={cat.category} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpen(isOpen ? null : cat.category);
                    setQuery("");
                    setLimit(PAGE);
                  }}
                  className={cx("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3.5 text-left transition-colors hover:bg-[var(--hover-bg)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_140px_minmax(0,1.6fr)_32px]", isOpen && "bg-[var(--selected-bg)]")}
                >
                  <span className="text-[14.5px] font-medium">
                    {t.categories[cat.category]} <span className="num text-[12px] text-fg-3">· {cat.total}</span>
                  </span>
                  <span className="num order-last col-span-2 text-[12px] text-fg-2 md:order-none md:col-span-1">{cat.procedural}</span>
                  <span className="hidden md:block">
                    <Coverage cat={cat} />
                  </span>
                  <span className={cx("order-last col-span-2 text-[12.5px] md:order-none md:col-span-1", s.cls)}>{s.text}</span>
                  <IconChevron width={14} height={14} className={cx("justify-self-end text-fg-3 transition-transform", isOpen && "rotate-90")} />
                </button>
                {isOpen && (
                  <div className="border-t border-line bg-bg-1/60 px-5 py-4">
                    <label className="relative block max-w-sm">
                      <IconSearch className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" width={14} height={14} />
                      <span className="sr-only">Поиск в категории</span>
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по названию или ID" className={cx(inputCls, "pl-9")} />
                    </label>
                    {cat.glbSupported && <p className="mt-2 text-[11.5px] text-fg-3">Ключ точной модели — ID детали; общий ключ подходит всем деталям с тем же чипом/линейкой (видеокарты) или всей категории.</p>}
                    <div className="scroll-thin mt-3 overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-[12.5px]">
                        <thead className="text-[11px] tracking-[0.06em] text-fg-3 uppercase">
                          <tr>
                            <th className="py-1.5 pr-3 font-semibold">Деталь</th>
                            <th className="py-1.5 pr-3 font-semibold">Сейчас</th>
                            <th className="py-1.5 pr-3 font-semibold">Ключ точной модели</th>
                            <th className="py-1.5 font-semibold">Общий ключ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.slice(0, limit).map((i) => (
                            <tr key={i.id} className="border-t border-line/60">
                              <td className="py-1.5 pr-3">{i.name}</td>
                              <td className={cx("py-1.5 pr-3", i.source === "glb" ? "text-violet" : "text-fg-3")}>{i.source === "glb" ? `GLB · ${i.matchedKey}` : "процедурная"}</td>
                              <td className="num py-1.5 pr-3 text-fg-2">{i.keys[0] ?? "—"}</td>
                              <td className="num py-1.5 text-fg-3">{i.keys.slice(1).join(", ") || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {items.length === 0 && <p className="py-3 text-[12.5px] text-fg-3">Ничего не найдено.</p>}
                    {items.length > limit && (
                      <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-3 text-[12.5px] text-violet hover:underline">
                        Показать ещё ({items.length - limit})
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
