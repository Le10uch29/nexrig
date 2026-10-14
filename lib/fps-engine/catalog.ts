import type { SourceIntegration } from "@/types/benchmark";

/**
 * Audited catalogue of FPS data sources (checked 2026-10-15).
 *
 * None of the editorial sites offers a public API or an export licence for their benchmark tables,
 * and NexRig does not scrape them. Their numbers enter the database only through the admin import
 * (row by row, with a link to the article and the test date) and are marked "ручной импорт".
 * Where a site publishes an RSS feed, the admin "check" reads that feed once to confirm the
 * source is reachable and to point the admin at new reviews — the feed contains headlines,
 * never FPS figures, so it is not a data integration.
 */
export interface SourceAudit {
  id: string;
  name: string;
  /** Default page shown to admins; admins may change it (within `domain`). */
  baseUrl: string | null;
  /** Host the source lives on; reachability checks never leave it. */
  domain: string | null;
  /** Public RSS/Atom feed used for the reachability check, if the site publishes one. */
  feedUrl: string | null;
  integration: SourceIntegration;
  /** Shown in the UI next to the status, e.g. "ручной импорт". */
  integrationLabel: string;
  data: string;
  access: string;
  auth: string;
  rights: string;
  updates: string;
  limits: string;
  attribution: string;
}

export const SOURCE_CATALOG: SourceAudit[] = [
  {
    id: "nexrig",
    name: "База NexRig (замеры пользователей и импорт)",
    baseUrl: null,
    domain: null,
    feedUrl: null,
    integration: "manual-import",
    integrationLabel: "собственная база",
    data: "Замеры пользователей после модерации и строки, импортированные администраторами: средний FPS, 1% low, настройки, тестовый стенд, методика.",
    access: "Supabase (benchmark_records), публичный API /api/fps/benchmarks — только проверенные записи.",
    auth: "Отправка замера — после входа; проверка — администратор.",
    rights: "Пользователь отправляет собственный замер для публикации на NexRig.",
    updates: "Непрерывно (по мере модерации).",
    limits: "Не более 10 замеров пользователя на проверке одновременно.",
    attribution: "Источник, ссылка и дата указаны в каждой записи.",
  },
  {
    id: "manufacturer",
    name: "Спецификации производителей",
    baseUrl: null,
    domain: null,
    feedUrl: null,
    integration: "local-catalogue",
    integrationLabel: "локальный каталог",
    data: "Характеристики комплектующих (сокеты, память, размеры, мощность). Не FPS.",
    access: "Перенесены в каталог вручную с официальных страниц.",
    auth: "—",
    rights: "Технические характеристики; ссылка на страницу продукта.",
    updates: "Вручную.",
    limits: "—",
    attribution: "Официальные страницы продуктов.",
  },
  {
    id: "tomshardware",
    name: "Tom's Hardware — GPU Benchmarks Hierarchy",
    baseUrl: "https://www.tomshardware.com/reviews/gpu-hierarchy,4388.html",
    domain: "tomshardware.com",
    feedUrl: "https://www.tomshardware.com/feeds/all",
    integration: "manual-import",
    integrationLabel: "ручной импорт",
    data: "Средний FPS и 1% low по набору игр, 1080p/1440p/4K, стенд и драйвер указаны в статье.",
    access: "API и выгрузки нет. RSS (feeds/all) — только заголовки статей.",
    auth: "Не требуется для чтения.",
    rights: "Контент Future plc; права на хранение и повторный показ таблиц не предоставлены — только отдельные результаты со ссылкой, по решению администратора.",
    updates: "Иерархия обновляется при выходе новых GPU.",
    limits: "Автоматический сбор не выполняется.",
    attribution: "Ссылка на статью и дата теста в каждой записи.",
  },
  {
    id: "techpowerup",
    name: "TechPowerUp — обзоры и GPU/CPU Database",
    baseUrl: "https://www.techpowerup.com/review/",
    domain: "techpowerup.com",
    feedUrl: "https://www.techpowerup.com/rss/reviews",
    integration: "manual-import",
    integrationLabel: "ручной импорт",
    data: "Обзоры: FPS по играм на фиксированном стенде. Database: характеристики GPU/CPU (не FPS).",
    access: "Официального API нет. RSS обзоров — только заголовки.",
    auth: "Не требуется для чтения.",
    rights: "Разрешение на хранение и повторный показ не подтверждено — ручной импорт отдельных результатов со ссылкой.",
    updates: "Обзоры — по мере выхода.",
    limits: "Автоматический сбор не выполняется (сайт ограничивает частые запросы).",
    attribution: "Ссылка на обзор и дата теста.",
  },
  {
    id: "techspot",
    name: "TechSpot / Hardware Unboxed",
    baseUrl: "https://www.techspot.com/reviews/",
    domain: "techspot.com",
    feedUrl: "https://www.techspot.com/backend.xml",
    integration: "manual-import",
    integrationLabel: "ручной импорт",
    data: "Тесты GPU/CPU в играх: средний FPS и 1% low, стенд в статье.",
    access: "API нет. RSS — заголовки и анонсы.",
    auth: "Не требуется для чтения.",
    rights: "Права на хранение не предоставлены — ручной импорт отдельных результатов со ссылкой.",
    updates: "Еженедельно.",
    limits: "Автоматический сбор не выполняется.",
    attribution: "Ссылка на статью и дата теста.",
  },
  {
    id: "gamersnexus",
    name: "GamersNexus",
    baseUrl: "https://gamersnexus.net/",
    domain: "gamersnexus.net",
    feedUrl: "https://gamersnexus.net/rss.xml",
    integration: "manual-import",
    integrationLabel: "ручной импорт",
    data: "Тесты GPU/CPU: средний FPS, 1% и 0,1% low, подробная методика.",
    access: "API нет. RSS — заголовки.",
    auth: "Не требуется для чтения.",
    rights: "Права на хранение не предоставлены — ручной импорт отдельных результатов со ссылкой.",
    updates: "По мере выхода обзоров.",
    limits: "Автоматический сбор не выполняется.",
    attribution: "Ссылка на статью и дата теста.",
  },
  {
    id: "computerbase",
    name: "ComputerBase",
    baseUrl: "https://www.computerbase.de/thema/grafikkarte/",
    domain: "computerbase.de",
    feedUrl: "https://www.computerbase.de/rss/news.xml",
    integration: "manual-import",
    integrationLabel: "ручной импорт",
    data: "Тесты GPU и игровые тесты: средний FPS и перцентили, стенд в статье.",
    access: "API нет. RSS (news.xml) — заголовки; полный текст части материалов — по подписке Pro.",
    auth: "Часть материалов — подписка ComputerBase Pro (не обходится).",
    rights: "Права на хранение не предоставлены — ручной импорт отдельных результатов из открытых статей со ссылкой.",
    updates: "Ежедневно.",
    limits: "Платный контент не используется.",
    attribution: "Ссылка на статью и дата теста.",
  },
  {
    id: "3dmark",
    name: "3DMark (UL) — публичные результаты",
    baseUrl: "https://www.3dmark.com/search",
    domain: "3dmark.com",
    feedUrl: null,
    integration: "manual-import",
    integrationLabel: "не используется для FPS",
    data: "Баллы синтетических тестов, а не FPS в играх.",
    access: "Публичного API нет.",
    auth: "Поиск по результатам — на сайте UL.",
    rights: "Условия повторного показа не опубликованы.",
    updates: "—",
    limits: "Баллы 3DMark не переводятся в игровой FPS — источник не участвует в расчёте.",
    attribution: "—",
  },
  {
    id: "openbenchmarking",
    name: "OpenBenchmarking.org (Phoronix Test Suite)",
    baseUrl: "https://openbenchmarking.org/",
    domain: "openbenchmarking.org",
    feedUrl: null,
    integration: "manual-import",
    integrationLabel: "ручной импорт",
    data: "Открытые результаты PTS, в том числе игровые тесты (в основном Linux).",
    access: "Экспорт отдельного результата (JSON, pts clone-result); документированного API для поиска нет.",
    auth: "Не требуется.",
    rights: "Лицензия данных явно не указана — только ручной импорт со ссылкой на результат.",
    updates: "Непрерывно (пользовательские загрузки).",
    limits: "Методики и ОС отличаются от Windows-тестов — сравнение только с совпадающей методикой.",
    attribution: "Ссылка на страницу результата.",
  },
];

export const catalogEntry = (id: string) => SOURCE_CATALOG.find((s) => s.id === id);

/** Source ids accepted in imports (3DMark scores are not FPS and are refused). */
export const IMPORTABLE_SOURCE_IDS = new Set(SOURCE_CATALOG.filter((s) => s.id !== "3dmark").map((s) => s.id));

/** A URL an admin may set for a source: https on the source's own domain. */
export function allowedSourceUrl(entry: SourceAudit, url: string): boolean {
  if (!entry.domain) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === entry.domain || u.hostname.endsWith(`.${entry.domain}`));
  } catch {
    return false;
  }
}
