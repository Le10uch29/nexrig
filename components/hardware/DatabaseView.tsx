"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useBuildStore } from "@/features/build-state/store";
import { evaluateCandidate } from "@/features/compatibility/engine";
import { usePrice } from "@/features/settings/currency";
import { hardwareRepository } from "@/lib/hardware/repository";
import { keySpecs } from "@/lib/hardware/specs";
import { useMessages } from "@/lib/i18n";
import { CATEGORY_ORDER, type ComponentCategory, type HardwareComponent } from "@/types/hardware";
import { IconCheck, IconSearch } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, Button, cx, Dialog, inputCls, Select, StatusPill, Switch } from "@/components/ui/primitives";
import { EmptyPanel, PageShell, ProductStage } from "@/components/ui/studio";

type Sort = "default" | "price-asc" | "price-desc" | "newest" | "name";
const PAGE = 48;

/**
 * Catalogue as a hardware store: category and brand filters on the left, a large product grid on
 * the right. Data are the project's local catalogue: prices are demo values and nothing implies
 * stock or a real offer.
 */
export function DatabaseView() {
  const formatPrice = usePrice();
  const t = useMessages();
  const router = useRouter();
  const openCatalog = useBuildStore((s) => s.openCatalog);
  const selection = useBuildStore((s) => s.selection);
  const [cat, setCat] = useState<ComponentCategory | "all">("all");
  const [q, setQ] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [quality, setQuality] = useState<"all" | "approximate" | "manufacturer-unverified">("all");
  const [onlyFit, setOnlyFit] = useState(false);
  const [sort, setSort] = useState<Sort>("default");
  const [limit, setLimit] = useState(PAGE);
  const [details, setDetails] = useState<HardwareComponent | null>(null);

  const all = hardwareRepository.all();
  const inCategory = useMemo(() => {
    const base = q.trim() ? hardwareRepository.search(q, 5000) : all;
    return base.filter((c) => cat === "all" || c.category === cat);
  }, [q, cat, all]);
  const brandCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of inCategory) m.set(c.brand, (m.get(c.brand) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inCategory]);
  const installedIds = useMemo(() => new Set([selection.case, selection.motherboard, selection.cpu, selection.cooler, selection.ram, selection.gpu, selection.psu, selection.fans, ...selection.storage].filter(Boolean)), [selection]);

  const items = useMemo(() => {
    let list = inCategory.filter((c) => (brands.length ? brands.includes(c.brand) : true)).filter((c) => (quality === "all" ? true : c.dataQuality === quality));
    if (onlyFit) list = list.filter((c) => evaluateCandidate(selection, c).status !== "incompatible");
    if (sort === "default") return list;
    return [...list].sort((a, b) => {
      if (sort === "price-asc") return a.price.amountRub - b.price.amountRub;
      if (sort === "price-desc") return b.price.amountRub - a.price.amountRub;
      if (sort === "newest") return (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
      return a.name.localeCompare(b.name, "ru", { numeric: true });
    });
  }, [inCategory, brands, quality, onlyFit, selection, sort]);

  const reset = () => {
    setBrands([]);
    setQuality("all");
    setOnlyFit(false);
    setQ("");
    setLimit(PAGE);
  };
  const toBuilder = (c: HardwareComponent) => {
    openCatalog(c.category, c.id);
    router.push("/builder");
  };
  const catCount = (c: ComponentCategory | "all") => (c === "all" ? all.length : all.filter((x) => x.category === c).length);

  return (
    <PageShell className="space-y-8">
      <PageHeader
        section="Каталог"
        title="Комплектующие"
        description="Процессоры, видеокарты, платы и всё остальное для сборки — с проверкой совместимости с вашей текущей конфигурацией."
        aside={
          <dl className="flex gap-8">
            {[
              ["позиций", all.length],
              ["брендов", new Set(all.map((c) => c.brand)).size],
              ["в вашей сборке", installedIds.size],
            ].map(([label, n]) => (
              <div key={label as string}>
                <dd className="num text-[30px] leading-none font-semibold">{n}</dd>
                <dt className="mt-1 text-[12.5px] text-fg-3">{label}</dt>
              </div>
            ))}
          </dl>
        }
      >
        <p className="max-w-4xl text-[13px] leading-relaxed text-fg-3">
          Данные — локальный демонстрационный набор: характеристики из открытых данных производителей требуют сверки, партнёрские версии помечены «≈ прибл.», цены ориентировочные, наличие не отслеживается. Изображения — схематичные иллюстрации, не фото товаров.
        </p>
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="space-y-7 lg:sticky lg:top-[calc(var(--nav-h)+24px)] lg:max-h-[calc(100dvh-var(--nav-h)-48px)] lg:self-start lg:overflow-y-auto lg:pr-1 scroll-thin" aria-label="Фильтры каталога">
          <nav aria-label="Категории">
            <p className="eyebrow mb-2">Категории</p>
            <ul className="grid grid-cols-2 gap-1 lg:grid-cols-1">
              {(["all", ...CATEGORY_ORDER] as const).map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    aria-current={cat === c ? "true" : undefined}
                    onClick={() => {
                      setCat(c);
                      setBrands([]);
                      setLimit(PAGE);
                    }}
                    className={cx(
                      "flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 text-left text-[14px] transition-colors",
                      cat === c ? "bg-[var(--selected-bg)] text-fg ring-1 ring-[var(--selected-border)]" : "text-fg-2 hover:bg-[var(--hover-bg)] hover:text-fg",
                    )}
                  >
                    <span className="truncate">{c === "all" ? "Все категории" : t.categories[c]}</span>
                    <span className="num text-[12px] text-fg-3">{catCount(c)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="eyebrow mb-2">Бренд</p>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1 scroll-thin">
              {brandCounts.slice(0, 30).map(([b, n]) => {
                const on = brands.includes(b);
                return (
                  <li key={b}>
                    <label className="flex h-8 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 text-[13.5px] text-fg-2 hover:bg-[var(--hover-bg)]">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          setBrands((prev) => (on ? prev.filter((x) => x !== b) : [...prev, b]));
                          setLimit(PAGE);
                        }}
                        className="size-4 accent-[var(--violet-strong)]"
                      />
                      <span className="flex-1 truncate">{b}</span>
                      <span className="num text-[12px] text-fg-3">{n}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="eyebrow">Данные</p>
            <Select
              label="Качество данных"
              value={quality}
              onChange={setQuality}
              options={[
                { value: "all", label: "Все позиции" },
                { value: "manufacturer-unverified", label: "Из данных производителя" },
                { value: "approximate", label: "≈ приблизительные" },
              ]}
            />
          </div>
          <Switch checked={onlyFit} onChange={setOnlyFit} label="Совместимые с моей сборкой" />
        </aside>

        <section className="min-w-0 space-y-5" aria-label="Товары">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 basis-72">
              <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-3" width={18} height={18} />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder={t.catalog.search}
                aria-label={t.catalog.search}
                className={cx(inputCls, "h-11 pl-10 text-[15px]")}
              />
            </div>
            <div className="w-52">
              <Select
                label="Сортировка"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "default", label: "По группам" },
                  { value: "price-asc", label: "Сначала дешевле" },
                  { value: "price-desc", label: "Сначала дороже" },
                  { value: "newest", label: "Сначала новые" },
                  { value: "name", label: "По названию" },
                ]}
              />
            </div>
            <p className="num text-[13px] text-fg-3">{items.length} шт.</p>
          </div>

          {items.length === 0 ? (
            <EmptyPanel
              icon={<IconSearch />}
              title="Ничего не найдено"
              actions={
                <Button variant="primary" onClick={reset}>
                  Сбросить фильтры
                </Button>
              }
            >
              {q ? `По запросу «${q}» ` : "С выбранными фильтрами "}
              {cat !== "all" ? `в категории «${t.categories[cat]}» ` : ""}товаров нет. Уберите часть фильтров или измените запрос.
            </EmptyPanel>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.slice(0, limit).map((c) => {
                const installed = installedIds.has(c.id);
                const verdict = installed ? null : evaluateCandidate(selection, c);
                return (
                  <li key={c.id}>
                    <article className={cx("group flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] bg-panel ring-1 transition-[box-shadow] duration-200", installed ? "ring-[var(--selected-border)]" : "ring-white/[0.06] hover:ring-violet/40")}>
                      <button type="button" onClick={() => setDetails(c)} className="relative block text-left" aria-label={`Подробнее: ${c.name}`}>
                        <ProductStage component={c} size={104} className="h-40" />
                        <span className="absolute top-3 left-3">
                          <Badge tone="neutral">{t.categoriesShort[c.category]}</Badge>
                        </span>
                        {installed ? (
                          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-violet-strong px-2 py-0.5 text-[11px] font-semibold text-white">
                            <IconCheck width={12} height={12} /> В сборке
                          </span>
                        ) : (
                          verdict &&
                          verdict.status !== "unchecked" && (
                            <span className="absolute top-3 right-3">
                              <StatusPill status={verdict.status} size="xs" />
                            </span>
                          )
                        )}
                      </button>
                      <div className="flex flex-1 flex-col gap-3 p-4">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold" title={c.name}>
                            {c.name}
                          </h3>
                          <p className="mt-0.5 truncate text-[12.5px] text-fg-3">
                            {c.brand} · {c.model}
                          </p>
                        </div>
                        <dl className="space-y-1">
                          {keySpecs(c)
                            .slice(0, 3)
                            .map((s) => (
                              <div key={s.label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                                <dt className="truncate text-fg-3">{s.label}</dt>
                                <dd className="num truncate text-cyan">{s.value}</dd>
                              </div>
                            ))}
                        </dl>
                        <div className="mt-auto flex items-end justify-between gap-2 border-t border-line pt-3">
                          <div>
                            <p className="num text-[20px] leading-none font-semibold">{formatPrice(c.price.amountRub)}</p>
                            <p className="mt-1 text-[11px] text-fg-3">{c.dataQuality === "approximate" ? "≈ данные прибл. · демо-цена" : "демо-цена"}</p>
                          </div>
                          <Button size="sm" variant={installed ? "secondary" : "primary"} onClick={() => toBuilder(c)}>
                            {installed ? "Открыть" : "В сборку"}
                          </Button>
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
          {items.length > limit && (
            <Button variant="secondary" className="h-11 w-full text-[14px]" onClick={() => setLimit((l) => l + PAGE)}>
              Показать ещё ({items.length - limit} из {items.length})
            </Button>
          )}
        </section>
      </div>

      <Dialog open={details !== null} onClose={() => setDetails(null)} title={details?.name ?? ""} className="w-[min(760px,calc(100vw-24px))]">
        {details && (
          <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)]">
            <ProductStage component={details} size={150} className="h-52 rounded-[var(--radius-lg)]" />
            <div className="space-y-4">
              <div>
                <p className="text-[13px] text-fg-3">
                  {t.categories[details.category]} · {details.brand} · {details.model}
                </p>
                <p className="num mt-1 text-[26px] font-semibold">{formatPrice(details.price.amountRub)}</p>
                <p className="text-[12px] text-fg-3">Демо-цена от {details.price.asOf}. {t.catalog.dataQuality[details.dataQuality]}.</p>
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {keySpecs(details, true).map((s) => (
                  <div key={s.label} className="flex justify-between gap-3 border-b border-line/60 py-1 text-[13px]">
                    <dt className="text-fg-3">{s.label}</dt>
                    <dd className="num text-right text-fg">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => toBuilder(details)}>
                  Открыть в конфигураторе
                </Button>
                <Button variant="ghost" onClick={() => setDetails(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </PageShell>
  );
}
