"use client";

import { useRouter } from "next/navigation";
import { usePrice } from "@/features/settings/currency";
import { Fragment, useMemo, useState } from "react";
import { useBuildStore } from "@/features/build-state/store";
import { hardwareRepository } from "@/lib/hardware/repository";
import { keySpecs } from "@/lib/hardware/specs";
import { useMessages } from "@/lib/i18n";
import { CATEGORY_ORDER, type ComponentCategory } from "@/types/hardware";
import { IconChevron, IconSearch } from "@/components/ui/icons";
import { Badge, Button, cx, EmptyState, inputCls, Select } from "@/components/ui/primitives";
import { ComponentThumb } from "./ComponentThumb";

export function DatabaseView() {
  const formatPrice = usePrice();
  const t = useMessages();
  const router = useRouter();
  const openCatalog = useBuildStore((s) => s.openCatalog);
  const [cat, setCat] = useState<ComponentCategory | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<"default" | "price-asc" | "price-desc" | "newest" | "name">("default");
  const [limit, setLimit] = useState(60);

  const items = useMemo(() => {
    const base = q.trim() ? hardwareRepository.search(q, 5000) : hardwareRepository.all();
    const filtered = base.filter((c) => cat === "all" || c.category === cat);
    if (sort === "default") return filtered;
    return [...filtered].sort((a, b) => {
      if (sort === "price-asc") return a.price.amountRub - b.price.amountRub;
      if (sort === "price-desc") return b.price.amountRub - a.price.amountRub;
      if (sort === "newest") return (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
      return a.name.localeCompare(b.name, "ru", { numeric: true });
    });
  }, [q, cat, sort]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 md:px-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t.nav.database}</h1>
        <p className="max-w-3xl text-sm text-fg-3">
          Локальный демонстрационный набор ({hardwareRepository.all().length} позиций), не живая база (файлы в components/PcComponents). Характеристики чипов и моделей взяты из открытых данных производителей и требуют сверки; партнёрские версии видеокарт и комбинации памяти сформированы по шаблонам линеек и помечены «≈ прибл.»; цены — ориентировочные демо-значения. Тот же набор отдаёт API <code className="num rounded bg-panel-2 px-1 text-[12px] text-fg-2">GET /api/components</code>.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(60);
            }}
            placeholder={t.catalog.search}
            aria-label={t.catalog.search}
            className={cx(inputCls, "pl-9")}
          />
        </div>
        <div className="w-44">
          <Select
            label="Сортировка"
            value={sort}
            onChange={setSort}
            options={[
              { value: "default", label: "По группам" },
              { value: "price-asc", label: "Цена ↑" },
              { value: "price-desc", label: "Цена ↓" },
              { value: "newest", label: "Сначала новые" },
              { value: "name", label: "По названию" },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Категория">
          {(["all", ...CATEGORY_ORDER] as const).map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={cat === c}
              onClick={() => {
                setCat(c);
                setLimit(60);
              }}
              className={cx("h-8 rounded-[var(--radius-sm)] border px-2.5 text-xs", cat === c ? "border-violet/50 bg-violet-soft text-fg" : "border-line text-fg-3 hover:text-fg-2")}
            >
              {c === "all" ? "Все" : t.categoriesShort[c]}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t.catalog.empty} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-panel-2 text-left text-[11px] text-fg-3">
              <tr>
                <th className="px-3 py-2 font-medium">Компонент</th>
                <th className="px-3 py-2 font-medium">Категория</th>
                <th className="px-3 py-2 font-medium">Ключевые характеристики</th>
                <th className="px-3 py-2 font-medium">Данные</th>
                <th className="px-3 py-2 text-right font-medium">Демо-цена</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.slice(0, limit).map((c) => (
                <Fragment key={c.id}>
                  <tr className="cursor-pointer hover:bg-panel-2/60" onClick={() => setOpen(open === c.id ? null : c.id)}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <ComponentThumb component={c} size={30} />
                        <div className="min-w-0">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-[11px] text-fg-3">{c.brand}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-fg-2">{t.categories[c.category]}</td>
                    <td className="num px-3 py-2 text-fg-2">
                      {keySpecs(c)
                        .slice(0, 3)
                        .map((s) => s.value)
                        .join(" · ")}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={c.dataQuality === "approximate" ? "warn" : "neutral"}>{c.dataQuality === "approximate" ? "≈ прибл." : "не сверено"}</Badge>
                    </td>
                    <td className="num px-3 py-2 text-right">{formatPrice(c.price.amountRub)}</td>
                    <td className="px-2">
                      <button type="button" aria-expanded={open === c.id} aria-label={`Подробнее: ${c.name}`} className="grid size-6 place-items-center text-fg-3">
                        <IconChevron className={cx("transition-transform", open === c.id && "rotate-90")} />
                      </button>
                    </td>
                  </tr>
                  {open === c.id && (
                    <tr className="bg-bg-1">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                            {keySpecs(c, true).map((s) => (
                              <div key={s.label} className="flex justify-between gap-2">
                                <dt className="text-fg-3">{s.label}</dt>
                                <dd className="num text-fg-2">{s.value}</dd>
                              </div>
                            ))}
                          </dl>
                          <div className="space-y-2 text-right">
                            <p className="text-[11px] text-fg-3">{t.catalog.dataQuality[c.dataQuality]}</p>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => {
                                openCatalog(c.category, c.id);
                                router.push("/builder");
                              }}
                            >
                              Открыть в конфигураторе
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length > limit && (
        <Button variant="secondary" className="w-full" onClick={() => setLimit((l) => l + 60)}>
          Показать ещё ({items.length - limit} из {items.length})
        </Button>
      )}
    </div>
  );
}
