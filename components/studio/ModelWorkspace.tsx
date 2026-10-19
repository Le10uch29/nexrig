"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBuildDerived } from "@/features/build-state/derived";
import { disposeObject } from "@/features/models/dispose";
import { formatBytes, ModelImportError } from "@/features/models/import";
import { loadLocalModel, toGlbBlob, type LoadedModel } from "@/features/models/load-local";
import { useModelPreviews } from "@/features/models/preview";
import { buildExport, boundsSize, fitTransform, normalizeTransform, PIVOT_LABEL, toModelAsset, transformedBounds, validatePublicModelPath, type Bounds, type ModelTransform, type Pivot, type Vec3 } from "@/features/models/transform";
import { useMessages } from "@/lib/i18n";
import type { HardwareComponent } from "@/types/hardware";
import { IconAlert, IconCheck, IconDownload, IconReset, IconUpload, IconX } from "@/components/ui/icons";
import { Button, cx, inputCls, Segmented, Switch } from "@/components/ui/primitives";

const ModelViewer = dynamic(() => import("./ModelViewer"), { ssr: false, loading: () => <ViewerLoading /> });

function ViewerLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center" role="status">
      <div className="size-9 animate-spin rounded-full border-2 border-line-strong border-t-violet" />
    </div>
  );
}

type LoadState = { kind: "idle" } | { kind: "loading"; names: string[] } | { kind: "error"; message: string; details: string[] };
type PathCheck = { kind: "idle" } | { kind: "checking" } | { kind: "ok"; url: string; note?: string } | { kind: "bad"; message: string };

const AXES = [
  { label: "X", cls: "text-[#f2727f]" },
  { label: "Y", cls: "text-[#6fdc9b]" },
  { label: "Z", cls: "text-[#73a7ff]" },
];

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${word}`;
}

/** Scene units → millimetres (1 unit = 100 mm). */
const mm = (v: number) => `${Math.round(v * 100)}`;
const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-fg-3 uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function NumberInput({ value, onChange, step, label, prefix, prefixCls, suffix }: { value: number; onChange: (v: number) => void; step: number; label: string; prefix?: string; prefixCls?: string; suffix?: string }) {
  return (
    <label className="flex h-9 min-w-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-bg-1 px-2 transition-colors focus-within:border-violet/60 hover:border-line-strong">
      {prefix && <span className={cx("text-[11px] font-semibold", prefixCls)}>{prefix}</span>}
      <input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
        step={step}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onChange(n);
        }}
        className="num w-full min-w-0 bg-transparent text-[13px] text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="text-[11px] text-fg-3">{suffix}</span>}
    </label>
  );
}

function Vec3Input({ value, onChange, step, label, suffix }: { value: Vec3; onChange: (v: Vec3) => void; step: number; label: string; suffix?: string }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={label}>
      {AXES.map((a, i) => (
        <NumberInput
          key={a.label}
          label={`${label} ${a.label}`}
          prefix={a.label}
          prefixCls={a.cls}
          suffix={suffix}
          step={step}
          value={value[i]}
          onChange={(n) => {
            const next = [...value] as Vec3;
            next[i] = n;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

function SizeRow({ label, size, unit }: { label: string; size: Vec3; unit: "file" | "mm" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="text-fg-3">{label}</span>
      <span className="num text-fg">
        {unit === "mm" ? `${mm(size[0])} × ${mm(size[1])} × ${mm(size[2])} мм` : `${fmt(size[0])} × ${fmt(size[1])} × ${fmt(size[2])}`}
      </span>
    </div>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Studio → 3D models: import a local .glb/.gltf, inspect and transform it, align it to the
 * procedural part it should replace, export a registry entry, and (explicitly) preview it in /builder.
 */
export function ModelWorkspace() {
  const t = useMessages();
  const { resolved } = useBuildDerived();
  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [transform, setTransform] = useState<ModelTransform>(normalizeTransform({ position: [0, 0, 0], rotationDeg: [0, 0, 0], scale: 1, pivot: "bottom" }));
  const [referenceId, setReferenceId] = useState("");
  const [referenceBounds, setReferenceBounds] = useState<Bounds | null>(null);
  const [pendingFit, setPendingFit] = useState(false);
  const [showReference, setShowReference] = useState(true);
  const [showBounds, setShowBounds] = useState(true);
  const [cameraNonce, setCameraNonce] = useState(0);
  const [path, setPath] = useState("");
  const [pathCheck, setPathCheck] = useState<PathCheck>({ kind: "idle" });
  const [attaching, setAttaching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const current = useRef<LoadedModel | null>(null);
  const previews = useModelPreviews((s) => s.previews);
  const attach = useModelPreviews((s) => s.attach);
  const detach = useModelPreviews((s) => s.detach);

  // Folder picking is non-standard; set the attribute on the element.
  useEffect(() => {
    dirInput.current?.setAttribute("webkitdirectory", "");
  }, []);
  // Free the GPU resources of the imported model when leaving Studio.
  useEffect(
    () => () => {
      if (current.current) disposeObject(current.current.scene);
      current.current = null;
    },
    [],
  );

  const candidates: HardwareComponent[] = [resolved.case, resolved.motherboard, resolved.cpu, resolved.gpu, resolved.storage[0], resolved.psu].filter((c): c is NonNullable<typeof c> => Boolean(c));
  const reference = candidates.find((c) => c.id === referenceId);
  const attached = reference ? previews[reference.id] : undefined;

  async function onFiles(list: FileList | File[] | null) {
    const files = list ? [...list] : [];
    if (files.length === 0) return;
    setLoad({ kind: "loading", names: files.map((f) => f.name) });
    try {
      const next = await loadLocalModel(files);
      if (current.current) disposeObject(current.current.scene);
      current.current = next;
      setModel(next);
      setTransform(fitTransform(next.bounds, referenceBounds ?? undefined));
      setPath(`/models/${next.fileName.replace(/\.gltf$/i, ".glb")}`);
      setPathCheck({ kind: "idle" });
      setLoad({ kind: "idle" });
      setCameraNonce((n) => n + 1);
    } catch (e) {
      const err = e instanceof ModelImportError ? e : new ModelImportError("parse-failed", "Не удалось загрузить модель.", [e instanceof Error ? e.message : String(e)]);
      setLoad({ kind: "error", message: err.message, details: err.details });
    }
  }

  function closeModel() {
    if (current.current) disposeObject(current.current.scene);
    current.current = null;
    setModel(null);
    setPathCheck({ kind: "idle" });
  }

  function onReferenceBounds(b: Bounds | null) {
    setReferenceBounds(b);
    if (pendingFit && current.current) setTransform(fitTransform(current.current.bounds, b ?? undefined));
    setPendingFit(false);
  }

  const update = (patch: Partial<ModelTransform>) => setTransform((tr) => normalizeTransform({ ...tr, ...patch }));
  const resetTransform = () => model && setTransform(fitTransform(model.bounds, referenceBounds ?? undefined));

  async function checkPath() {
    const problem = validatePublicModelPath(path);
    if (problem) return setPathCheck({ kind: "bad", message: problem });
    setPathCheck({ kind: "checking" });
    try {
      const res = await fetch(path, { method: "HEAD", cache: "no-store" });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || type.includes("text/html")) return setPathCheck({ kind: "bad", message: `Файла нет по этому пути (ответ ${res.status}). Положите его в public${path} и перезапустите сайт.` });
      const len = Number(res.headers.get("content-length"));
      const note = model?.kind === "glb" && model.standaloneGlb && len > 0 && len !== model.standaloneGlb.size ? "Файл найден, но его размер отличается от загруженного — проверьте, что это та же модель." : undefined;
      setPathCheck({ kind: "ok", url: path.trim(), note });
    } catch {
      setPathCheck({ kind: "bad", message: "Не удалось проверить путь — сайт не ответил." });
    }
  }

  function exportJson() {
    if (!model) return;
    const data = buildExport({
      source: { fileName: model.fileName, kind: model.kind, files: model.files, bytes: model.bytes },
      transform,
      bounds: model.bounds,
      verifiedUrl: pathCheck.kind === "ok" ? pathCheck.url : null,
      reference: reference ? { componentId: reference.id, name: reference.name, category: reference.category } : null,
    });
    download(`${model.fileName.replace(/\.(glb|gltf)$/i, "")}.nexrig-model.json`, JSON.stringify(data, null, 2));
  }

  async function sendToBuilder() {
    if (!model || !reference) return;
    setAttaching(true);
    try {
      const blob = model.standaloneGlb ?? (await toGlbBlob(model.scene));
      const url = URL.createObjectURL(blob);
      attach({ key: reference.id, componentName: reference.name, fileName: model.fileName, asset: { ...toModelAsset(transform, model.bounds, url), modelUrl: url } });
    } catch (e) {
      setLoad({ kind: "error", message: "Не удалось подготовить модель для конструктора.", details: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setAttaching(false);
    }
  }

  const after = model ? boundsSize(transformedBounds(transform, model.bounds)) : null;
  const scaleLog = Math.log10(transform.scale);

  return (
    <div
      className="relative flex flex-col lg:absolute lg:inset-0"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void onFiles(e.dataTransfer.files);
      }}
    >
      <input ref={fileInput} type="file" multiple accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.avif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFiles(e.target.files).finally(() => (e.target.value = ""))} />
      <input ref={dirInput} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFiles(e.target.files).finally(() => (e.target.value = ""))} />

      {/* ── viewer ── */}
      <div className="relative h-[60dvh] min-h-[380px] pt-[104px] lg:absolute lg:inset-0 lg:h-auto lg:pt-0">
        <ModelViewer model={model} transform={transform} reference={reference} showReference={showReference} showBounds={showBounds} cameraNonce={cameraNonce} referenceBounds={referenceBounds} onReferenceBounds={onReferenceBounds} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-bg-0 via-bg-0/60 to-transparent" aria-hidden />

        {!model && load.kind !== "loading" && (
          <div className="absolute inset-0 grid place-items-center p-4 pt-24 lg:pr-[400px]">
            <div className={cx("w-full max-w-md rounded-[var(--radius-xl)] border border-dashed p-6 text-center backdrop-blur-md transition-colors", dragOver ? "border-violet bg-violet/10" : "border-line-strong bg-bg-0/70")}>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-violet/15 text-violet">
                <IconUpload width={22} height={22} />
              </span>
              <p className="mt-3 text-[18px] font-semibold">Загрузите 3D-модель</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">Файл .glb — или .gltf вместе с его .bin и текстурами. Перетащите сюда или выберите. Файлы не покидают ваш компьютер.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => fileInput.current?.click()}>
                  Выбрать файлы
                </Button>
                <Button onClick={() => dirInput.current?.click()}>Выбрать папку</Button>
              </div>
            </div>
          </div>
        )}
        {load.kind === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-bg-0/40" role="status">
            <div className="glass flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3 text-[13px]">
              <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-violet" />
              Загрузка: {load.names.slice(0, 3).join(", ")}
              {load.names.length > 3 ? ` и ещё ${load.names.length - 3}` : ""}
            </div>
          </div>
        )}
        {dragOver && model && <div className="pointer-events-none absolute inset-3 rounded-[var(--radius-xl)] border-2 border-dashed border-violet bg-violet/10" aria-hidden />}

        {/* scene tools */}
        {model && (
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 lg:bottom-6 lg:left-8">
            <Button onClick={() => setCameraNonce((n) => n + 1)} className="glass">
              <IconReset /> Камера
            </Button>
            <div className="glass flex items-center gap-4 rounded-[var(--radius-md)] border border-line px-3">
              <Switch checked={showBounds} onChange={setShowBounds} label="Габариты" />
              {reference && <Switch checked={showReference} onChange={setShowReference} label="Эталон" />}
            </div>
          </div>
        )}
      </div>

      {/* ── parameters ── */}
      <aside
        className={cx(
          "scroll-thin z-10 border-t border-line bg-panel p-4 lg:absolute lg:top-[88px] lg:right-6 lg:w-[372px] lg:overflow-y-auto lg:rounded-[var(--radius-xl)] lg:border lg:bg-panel/90 lg:p-5 lg:backdrop-blur-xl",
          model ? "lg:bottom-6" : "lg:max-h-[calc(100%-112px)]",
        )}
        aria-label="Параметры модели"
      >
        {load.kind === "error" && (
          <div className="mb-4 rounded-[var(--radius-md)] border border-bad/40 bg-bad/10 p-3 text-[12.5px]" role="alert">
            <div className="flex items-start gap-2">
              <IconAlert className="mt-0.5 shrink-0 text-bad" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">{load.message}</p>
                {load.details.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-fg-2">
                    {load.details.slice(0, 8).map((d) => (
                      <li key={d} className="truncate font-mono text-[11.5px]" title={d}>
                        {d}
                      </li>
                    ))}
                    {load.details.length > 8 && <li>…и ещё {load.details.length - 8}</li>}
                  </ul>
                )}
                {model && <p className="mt-1.5 text-fg-3">Показана предыдущая модель.</p>}
              </div>
              <button type="button" onClick={() => setLoad({ kind: "idle" })} aria-label="Скрыть ошибку" className="grid size-6 place-items-center rounded text-fg-3 hover:bg-[var(--hover-bg)] hover:text-fg">
                <IconX width={13} height={13} />
              </button>
            </div>
          </div>
        )}

        {!model ? (
          <div className="space-y-3 text-[13px] text-fg-2">
            <h2 className="text-[15px] font-semibold text-fg">Параметры модели</h2>
            <p>После загрузки здесь появятся размеры, масштаб, положение, вращение и центр модели, экспорт настроек и подключение к конструктору.</p>
            <ul className="space-y-1 text-[12.5px] text-fg-3">
              <li>• .glb — один файл, всё внутри</li>
              <li>• .gltf — нужен полный набор: .gltf, .bin и текстуры (удобнее выбрать папку)</li>
              <li>• Draco и KTX2 пока не поддерживаются — модель будет отклонена с объяснением</li>
            </ul>
          </div>
        ) : (
          <>
            <Section
              title="Файл"
              aside={
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
                    Заменить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={closeModel}>
                    Закрыть
                  </Button>
                </div>
              }
            >
              <p className="truncate text-[15px] font-semibold" title={model.fileName}>
                {model.fileName}
              </p>
              <p className="num mt-0.5 text-[12px] text-fg-3">
                {model.kind.toUpperCase()} · {formatBytes(model.bytes)} · {plural(model.files.length, "файл", "файла", "файлов")} · {plural(model.stats.meshes, "меш", "меша", "мешей")} · {model.stats.triangles.toLocaleString("ru-RU")} треуг. · {plural(model.stats.textures, "текстура", "текстуры", "текстур")}
              </p>
              {model.warnings.map((w) => (
                <p key={w} className="mt-2 rounded-[var(--radius-sm)] border border-warn/30 bg-warn/10 px-2 py-1.5 text-[12px] text-warn">
                  {w}
                </p>
              ))}
            </Section>

            <Section title="Размеры">
              <div className="space-y-1">
                <SizeRow label="В файле, ед. файла" size={boundsSize(model.bounds)} unit="file" />
                {after && <SizeRow label="После трансформации" size={after} unit="mm" />}
              </div>
              <p className="mt-1.5 text-[11px] text-fg-3">В сцене 1 единица = 100 мм. Единицы файла заранее не известны — проверьте размер по эталону.</p>
            </Section>

            <Section title="Эталон (что заменит модель)">
              <select aria-label="Эталонная деталь" value={referenceId} onChange={(e) => {
                setReferenceId(e.target.value);
                setPendingFit(true);
              }} className={cx(inputCls, "pr-8")}>
                <option value="">Без эталона — модель на подиуме</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t.categories[c.category]}: {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11.5px] text-fg-3">{reference ? "Координаты считаются от начала процедурной модели этой детали — как в конструкторе. При выборе модель подгоняется к габаритам эталона." : "Выберите деталь из текущей сборки, чтобы выровнять модель под её место в корпусе."}</p>
            </Section>

            <Section
              title="Трансформация"
              aside={
                <Button size="sm" variant="ghost" onClick={resetTransform}>
                  <IconReset width={13} height={13} /> Сбросить
                </Button>
              }
            >
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-[12px] text-fg-2">Масштаб</p>
                  <div className="flex items-center gap-2">
                    <input type="range" aria-label="Масштаб, ползунок" min={-3} max={3} step={0.01} value={Number.isFinite(scaleLog) ? scaleLog : 0} onChange={(e) => update({ scale: 10 ** Number(e.target.value) })} className="min-w-0 flex-1 accent-[var(--violet)]" />
                    <div className="w-28">
                      <NumberInput label="Масштаб" value={transform.scale} step={0.01} onChange={(v) => update({ scale: v })} prefix="×" prefixCls="text-fg-3" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] text-fg-2">Позиция, ед. сцены</p>
                  <Vec3Input label="Позиция" value={transform.position} step={0.05} onChange={(v) => update({ position: v })} />
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] text-fg-2">Вращение</p>
                  <Vec3Input label="Вращение" value={transform.rotationDeg} step={15} suffix="°" onChange={(v) => update({ rotationDeg: v })} />
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] text-fg-2">Центр (pivot)</p>
                  <Segmented<Pivot> size="sm" label="Центр модели" value={transform.pivot} onChange={(pivot) => update({ pivot })} options={(Object.keys(PIVOT_LABEL) as Pivot[]).map((p) => ({ value: p, label: p === "origin" ? "Файл" : p === "center" ? "Центр" : "Основание" }))} />
                  <p className="mt-1 text-[11px] text-fg-3">{PIVOT_LABEL[transform.pivot]} — точка, от которой отсчитывается позиция (оси в сцене).</p>
                </div>
              </div>
            </Section>

            <Section title="Экспорт настроек">
              <label className="block text-[12px] text-fg-2" htmlFor="model-path">
                Путь к файлу на сайте
              </label>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  id="model-path"
                  value={path}
                  onChange={(e) => {
                    setPath(e.target.value);
                    setPathCheck({ kind: "idle" });
                  }}
                  placeholder="/models/gpu/model.glb"
                  className={cx(inputCls, "num text-[12.5px]")}
                />
                <Button onClick={() => void checkPath()} disabled={pathCheck.kind === "checking"}>
                  {pathCheck.kind === "checking" ? "…" : "Проверить"}
                </Button>
              </div>
              <p className={cx("mt-1.5 text-[11.5px]", pathCheck.kind === "ok" ? "text-ok" : pathCheck.kind === "bad" ? "text-bad" : "text-fg-3")} role="status">
                {pathCheck.kind === "ok" ? (
                  <span className="inline-flex items-center gap-1">
                    <IconCheck width={12} height={12} /> Файл найден — путь войдёт в экспорт.
                  </span>
                ) : pathCheck.kind === "bad" ? (
                  pathCheck.message
                ) : (
                  "Путь попадёт в JSON только после проверки, что файл действительно лежит в public/models."
                )}
              </p>
              {pathCheck.kind === "ok" && pathCheck.note && <p className="mt-1 text-[11.5px] text-warn">{pathCheck.note}</p>}
              <Button className="mt-3 w-full" onClick={exportJson}>
                <IconDownload /> Скачать JSON трансформации
              </Button>
            </Section>

            <Section title="В конструкторе">
              {reference ? (
                <>
                  <p className="text-[12.5px] text-fg-2">
                    Временно показать модель вместо процедурной у <span className="text-fg">{reference.name}</span>. Другие детали не меняются; после перезагрузки страницы модель отключится.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => void sendToBuilder()} disabled={attaching}>
                      {attaching ? "Подготовка…" : attached ? "Обновить в конструкторе" : "Показать в конструкторе"}
                    </Button>
                    {attached && (
                      <>
                        <Link href="/builder" className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-line bg-panel-2 px-3.5 text-sm font-medium hover:border-line-strong hover:bg-panel-3">
                          Открыть /builder
                        </Link>
                        <Button variant="ghost" onClick={() => detach(reference.id)}>
                          Отключить
                        </Button>
                      </>
                    )}
                  </div>
                  {attached && <p className="mt-2 text-[11.5px] text-ok">Подключено: {attached.fileName}. Изменения трансформации применятся после «Обновить».</p>}
                </>
              ) : (
                <p className="text-[12.5px] text-fg-3">Выберите эталон — модель можно показать только вместо конкретной детали текущей сборки.</p>
              )}
            </Section>
          </>
        )}
      </aside>
    </div>
  );
}
