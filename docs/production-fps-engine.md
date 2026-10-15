# FPS Data Engine — выпуск в production (Vercel + Supabase)

Статус на 2026-10-14 (проверено чтением через CLI, проект «Newrig»): все три миграции **уже присутствуют в живой базе** (применены вне CLI, вероятно через SQL Editor) — объекты совпадают с файлами; **таблицы истории миграций нет**, поэтому `db push --dry-run` планирует повторить все три. `db push` запускать нельзя; нужен `migration repair --status applied 20261013000000 20261014000000 20261015000000` (только запись в историю, после подтверждения). Снимок каталога: `backups/2026-10-14-catalog.json`; `db dump` требует Docker (не установлен).
Все шаги, изменяющие базу, помечены **[запись — нужно подтверждение]**.

## 0. Состояние, проверенное только чтением

- В базе есть таблицы базовой схемы и `20261014` (колонки `upscaler`, `frame_gen`, `test_config`, `method`, `notes`).
- Нет `data_sources`, `benchmark_import_batches`, колонок `verification_status` и т.д. — их добавляет `fps_data_engine`.
- Во всех таблицах `public` 0 строк → новые CHECK-ограничения и уникальный индекс применятся без конфликтов.
- Политики, триггеры, индексы и история миграций через REST не видны — проверьте SQL из раздела 3.

## 1. Имена файлов миграций — восстановлены

Файлы снова называются `20261013000000_buildai_schema.sql`, `20261014000000_benchmark_details_and_case_mounts.sql`,
`20261015000000_fps_data_engine.sql` (первые два побайтно совпадают с версиями в git, имена были свободны).

В `20261015…` исправлены 4 строки: вместо `$$` стояли одиночные `$` (`do $$ … $$`, `as $$ … $$`) — без исправления
`db push` упал бы с синтаксической ошибкой. Найдено локальной проверкой (раздел 1a).

### 1a. Локальная проверка миграций и RLS (без живой базы)

Три миграции прогнаны по порядку в PGlite (Postgres в памяти) с заглушками Supabase (`anon`, `authenticated`,
`service_role` с BYPASSRLS, `auth.jwt()/auth.uid()` из `request.jwt.claims`, гранты по умолчанию). Результат — 17/17:

- до 20261015 обычный вошедший пользователь **может** вставить замер (текущий риск подтверждён);
- 20261015 применяется повторно без ошибок;
- после неё: anon и вошедший не-админ (даже с `user_metadata.role = admin`) не могут вставлять, подтверждать, удалять;
  anon видит только `verified`; админ (`app_metadata.role = admin`) и `service_role` — могут;
- дубликат теста отклоняется уникальным индексом; CHECK `low1_fps <= avg_fps` работает;
- триггер обновляет `updated_at` только у изменённых строк;
- `data_sources` читается всеми (4 строки), пишется только админом; партии импорта видны только админу.

Это эмуляция: настоящие роли, JWT и гранты Supabase проверяются после применения (раздел 7).

## 1b. CLI вошёл в другой аккаунт

`supabase projects list` в этой сессии показывает «Global ortobedi» и «01elnurmamedov@gmail.com's Project» — проекта
приложения (ref начинается с `gicbvlrdrkxs`, полный ref — 20 символов, поддомен из `NEXT_PUBLIC_SUPABASE_URL`) там нет.
Перед `link` войдите аккаунтом, которому принадлежит проект:

```bash
npx supabase@2.120.0 logout
npx supabase@2.120.0 login
npx supabase@2.120.0 projects list   # проект приложения должен быть в списке
```

## 2. Подключение CLI и резервная копия (только чтение)

```bash
npx supabase@2.120.0 login
npx supabase@2.120.0 link --project-ref <полный-ref>         # 20 символов, начинается с gicbvlrdrkxs
mkdir -p backups
npx supabase@2.120.0 db dump --linked -f backups/2026-10-14-schema.sql
npx supabase@2.120.0 db dump --linked --data-only -f backups/2026-10-14-data.sql
npx supabase@2.120.0 db dump --linked --role-only -f backups/2026-10-14-roles.sql
npx supabase@2.120.0 migration list --linked
```

`backups/` в `.gitignore` — дампы могут содержать данные пользователей.

### Если `migration list` показывает 20261013/20261014 только локально

Значит, базовая схема применялась через SQL Editor и не записана в историю. Тогда `db push` попытается применить её снова и упадёт на `create table public.components` (таблица уже есть). Отметьте их как применённые — это пишет **только** в таблицу истории миграций:

```bash
# [запись — нужно подтверждение]
npx supabase@2.120.0 migration repair --status applied 20261013000000 20261014000000 --linked
```

## 3. Проверка схемы перед применением (SQL Editor, только чтение)

```sql
-- Политики на затрагиваемых таблицах (ожидаются "benchmarks read" и "benchmarks insert own").
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('benchmark_records','games','components')
order by tablename, policyname;

-- Индексы, ограничения и триггеры benchmark_records.
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'benchmark_records';
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.benchmark_records'::regclass;
select tgname from pg_trigger where tgrelid = 'public.benchmark_records'::regclass and not tgisinternal;

-- Не должно быть объектов с именами из миграции (иначе сверить определения).
select to_regclass('public.data_sources'), to_regclass('public.benchmark_import_batches'),
       to_regprocedure('public.touch_updated_at()');

-- Данные, которые нарушили бы новые ограничения (ожидается 0).
select count(*) from public.benchmark_records where low1_fps is not null and low1_fps > avg_fps;

-- История миграций (если таблица есть).
select version, name from supabase_migrations.schema_migrations order by version;
```

## 4. Что изменит `20261015000000_fps_data_engine.sql`

| Объект | Действие |
|---|---|
| `data_sources` | создаётся + 4 строки источников (`on conflict do nothing`), RLS включён |
| `benchmark_import_batches` | создаётся, RLS включён, 2 индекса |
| `benchmark_records` | +14 колонок (nullable или с default), 3 CHECK, уникальный индекс дедупликации, 4 индекса, триггер `benchmark_records_touch` |
| `games` | +6 колонок, `slug` уникальный (nullable) |
| `components` | +6 nullable колонок |
| функция | `public.touch_updated_at()` (SECURITY INVOKER, `search_path = ''`) |
| политики **удаляются** | `"benchmarks insert own"` (сейчас разрешает любому вошедшему добавлять публичные замеры), `"benchmarks read"` (чтение всего подряд) |
| политики создаются | чтение только `verification_status = 'verified'` (или admin), запись/изменение/удаление — только `app_metadata.role = 'admin'`; `data_sources` — чтение всем, запись admin; партии — только admin |

Удалений таблиц, колонок и данных нет. Файл можно запускать повторно.

## 5. Применение

```bash
npx supabase@2.120.0 db push --linked --dry-run   # должен показать ТОЛЬКО 20261015000000_fps_data_engine.sql
# [запись — нужно подтверждение]
npx supabase@2.120.0 db push --linked
npx supabase@2.120.0 migration list --linked      # 20261015000000 — applied
```

Если проект не выдаёт новым таблицам доступ через Data API автоматически, приложение получит ошибку доступа к `data_sources` даже с секретным ключом. Проверка и исправление:

```sql
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('data_sources','benchmark_import_batches');
-- [запись — нужно подтверждение], только если service_role отсутствует:
grant select, insert, update, delete on public.data_sources, public.benchmark_import_batches to service_role;
```

## 6. Переменные окружения на Vercel

| Переменная | Где | Обязательна |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | все окружения | да (можно с `/rest/v1`) |
| `NEXT_PUBLIC_SUPABASE_KEY` или `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | все окружения | да, только publishable-ключ |
| `SUPABASE_SECRET_KEY` | Production (+ Preview при необходимости), **Sensitive** | да |
| `NEXRIG_ADMIN_TOKEN` | Production, Sensitive | нет (вход админа — через сессию) |
| `ANTHROPIC_API_KEY` | Production, Sensitive | нет |
| `NEXRIG_BENCHMARK_STORE`, `NEXRIG_BENCHMARK_BACKEND` | — | не задавать на Vercel |

Без `SUPABASE_SECRET_KEY` на Vercel хранилище замеров отказывает с сообщением «на Vercel нужен Supabase» — файловый fallback там отключён. `ALLOW_DATA_RESET` кодом не используется.

Supabase → Authentication → URL Configuration: Site URL = production-домен; Redirect URLs: `https://<домен>/auth/callback`, `https://<preview-домен>/auth/callback`, `http://localhost:3000/auth/callback`.

## 7. Чек-лист после применения

Выполнять на production-домене (или `npx next start` с production-переменными). Отмечать фактический результат.

1. **Источники**: `GET /api/fps/sources` → `storage: "supabase"`, «База NexRig» = `active`, `verifiedRecords: 0`.
2. **Публичное чтение**: `GET /api/fps/benchmarks` → 200, `total: 0`.
3. **Запрет публичной записи** (REST с publishable-ключом, без входа): `POST /rest/v1/benchmark_records` → 401/42501. Вошедший **не** админ — тоже отказ RLS.
4. **Админка**: войти как admin → `/admin/benchmarks` открывается без токена; обычный пользователь видит «нет роли администратора».
5. **Импорт**: шаблон CSV с реальной записью → «Проверить» (ошибки по строкам) → «Импортировать» → запись «не проверено»; `GET /api/fps/benchmarks` всё ещё `total: 0`.
6. **Дубликаты**: тот же CSV ещё раз → «дубликатов: 1», запись не добавлена.
7. **Подтверждение**: «Подтвердить» → публичный список `total: 1`; FPS Lab для этой конфигурации показывает «Подтверждённый тест» с источником и датой.
8. **Отклонение**: «Отклонить» → публичный список `total: 0`; расчёт возвращается к модели.
9. **Откат**: новая партия из 2 строк, одну подтвердить → «Откатить» → «Удалено: 1, сохранено: 1».
10. **Повторное чтение после перезапуска**: Redeploy на Vercel (или перезапуск сервера) → записи из п. 7/9 на месте, статусы те же.
11. **RLS напрямую** (SQL Editor): `select verification_status, count(*) from public.benchmark_records group by 1;` совпадает с админкой.
12. **Консоль браузера** на `/games`, `/builder`, `/admin/benchmarks` — без ошибок гидратации и 5xx.

## 8. NexRig Benchmark (режимы A и B)

**Режим A «Протестировать сборку»** — `/benchmark` и кнопка на 3D-столе. `POST /api/fps/analyze`
(NDJSON, 8 этапов). Использует только `benchmark_records` и `data_sources` — новых таблиц нет.
Внешние сайты при запуске не опрашиваются. Кэш — в памяти экземпляра функции (15 мин), ключ
включает версию данных (число проверенных записей и отключённые источники). Лимит: 12 запусков
за 5 минут на клиента и экземпляр; параллельный запуск той же сборки → 409.

**Режим B «Проверить этот компьютер»** — работает целиком в браузере, сервер не нужен.
Публикация результатов требует миграции:

```
supabase/migrations/20261016000000_browser_benchmarks.sql   (подготовлена, НЕ применена)
```

Она только добавляет таблицу `browser_benchmark_results` (RLS: свои строки + администратор;
вставка только через сервер). До применения публикация и сравнение отвечают 503 с понятным
сообщением, а сам тест работает.

Применение — только после подтверждения, после восстановления истории миграций (раздел 5):

```
npx supabase@2.120.0 db push --linked --dry-run   # должна показать только 20261016000000
npx supabase@2.120.0 db push --linked
```

Проверка после применения: опубликовать результат из `/benchmark` (вход обязателен) → он
появится в `/admin/benchmarks` → «Браузерные тесты · очередь проверки» со статусом «на проверке».

### 8.1 После production-аудита

- Версия браузерного теста — `nexrig-gfx-1.1`: замер отрезками ≥ 50 мс, зацикленная анимация,
  ограниченный шейдер. Результаты 1.0 с ней не сравниваются и сервером не принимаются.
- Публичный список браузерных результатов — только проверенные; у непроверенных — только число.
- Модерация записывает `reviewed_by`/`reviewed_at` (браузерные результаты) и `verified_by`
  (замеры FPS) из серверной проверки администратора.
- `/api/agents` отключён (404), пока на сервере не задано `NEXRIG_ENABLE_AI_EXPERT=1`.
- Миграция `20261016000000` отзывает у `anon`/`authenticated` все права на новую таблицу и выдаёт
  только `SELECT` и `UPDATE (status, reviewed_by, reviewed_at)`, `DELETE` — с ограничением RLS.
