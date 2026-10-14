-- NexRig FPS Data Engine. Status on 2026-10-14: NOT APPLIED to the linked project (checked read-only:
-- public.data_sources does not exist there). Requires 20261013000000 and 20261014000000 (both present).
-- Safe to re-run: every object is created only if missing. Additive except for two RLS policies
-- that are replaced (see "row level security" below). Apply with: supabase db push (or the SQL editor).
--
-- Admins are identified by the JWT claim app_metadata.role = 'admin'. app_metadata is set by the
-- service role only (users cannot edit it), unlike user_metadata.

-- ---------------------------------------------------------------- data sources

create table if not exists public.data_sources (
  id              text primary key,
  name            text not null,
  base_url        text,
  integration     text not null check (integration in ('api', 'licensed-dataset', 'manual-import', 'local-catalogue', 'model')),
  status          text not null default 'not_configured' check (status in ('active', 'not_configured', 'disabled', 'error')),
  last_sync_at    timestamptz,
  last_error_at   timestamptz,
  error_message   text check (char_length(error_message) <= 500),   -- never secrets
  attribution     text,
  update_mode     text not null default 'manual' check (update_mode in ('manual', 'scheduled', 'none')),
  notes           text
);

insert into public.data_sources (id, name, base_url, integration, status, attribution, update_mode, notes) values
  ('tomshardware', 'Tom''s Hardware — GPU Benchmarks Hierarchy', 'https://www.tomshardware.com/reviews/gpu-hierarchy,4388.html', 'licensed-dataset', 'not_configured',
   'Требуется разрешение/лицензия редакции; при импорте — ссылка на статью и дата теста.', 'manual',
   'Публичного API нет. Автоматический сбор со страницы не выполняется.'),
  ('techpowerup', 'TechPowerUp GPU Database', 'https://www.techpowerup.com/gpu-specs/', 'licensed-dataset', 'not_configured',
   'Требуется разрешение TechPowerUp; ссылка на страницу GPU.', 'manual',
   'Бесплатный API не подтверждён. Автоматический сбор не выполняется.'),
  ('manufacturer', 'Спецификации производителей', null, 'manual-import', 'active',
   'Ссылка на официальную страницу продукта в поле official_url компонента.', 'manual',
   'Характеристики вносятся вручную и проверяются по страницам производителей.'),
  ('nexrig', 'База NexRig (импорт и ручной ввод)', null, 'manual-import', 'active',
   'Источник указывается в каждой записи (source_label, source_url).', 'manual', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- import batches (rollback unit)

create table if not exists public.benchmark_import_batches (
  id            uuid primary key default gen_random_uuid(),
  source_id     text references public.data_sources (id),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  row_count     integer not null check (row_count >= 0),
  status        text not null default 'committed' check (status in ('committed', 'rolled_back')),
  notes         text
);
create index if not exists benchmark_import_batches_source_idx on public.benchmark_import_batches (source_id);
create index if not exists benchmark_import_batches_created_by_idx on public.benchmark_import_batches (created_by);

-- ---------------------------------------------------------------- benchmark records (extend)

alter table public.benchmark_records
  add column if not exists source_id            text references public.data_sources (id),
  add column if not exists ram_gb               integer check (ram_gb > 0),
  add column if not exists ram_type             text check (ram_type in ('DDR3', 'DDR4', 'DDR5')),
  add column if not exists min_fps              numeric(7,2) check (min_fps > 0),
  add column if not exists min_fps_method       text,
  add column if not exists cpu_util             numeric(5,2) check (cpu_util between 0 and 100),
  add column if not exists gpu_util             numeric(5,2) check (gpu_util between 0 and 100),
  add column if not exists os                   text,
  add column if not exists driver               text,
  add column if not exists verification_status  text not null default 'unverified'
                                                check (verification_status in ('unverified', 'verified', 'rejected')),
  add column if not exists verified_by          uuid references auth.users (id) on delete set null,
  add column if not exists verified_at          timestamptz,
  add column if not exists import_batch_id      uuid references public.benchmark_import_batches (id) on delete set null,
  add column if not exists updated_at           timestamptz not null default now();

-- Internal consistency: 1% low cannot exceed the average; a minimum needs a stated method.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'benchmark_records_low_le_avg') then
    alter table public.benchmark_records add constraint benchmark_records_low_le_avg check (low1_fps is null or low1_fps <= avg_fps);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'benchmark_records_min_le_low') then
    alter table public.benchmark_records add constraint benchmark_records_min_le_low check (min_fps is null or low1_fps is null or min_fps <= low1_fps);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'benchmark_records_min_method') then
    alter table public.benchmark_records add constraint benchmark_records_min_method check (min_fps is null or min_fps_method is not null);
  end if;
end $$;

-- updated_at follows every change, so a batch rollback can keep records edited after the import.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists benchmark_records_touch on public.benchmark_records;
create trigger benchmark_records_touch
  before update on public.benchmark_records
  for each row execute function public.touch_updated_at();

-- Duplicate detection: the same test (configuration + source + date) can be stored once.
create unique index if not exists benchmark_records_dedupe_idx on public.benchmark_records (
  game_id, cpu_id, gpu_id, resolution, preset, ray_tracing, upscaling,
  coalesce(upscaler, ''), frame_gen, coalesce(source_url, ''), test_date
);
create index if not exists benchmark_records_source_idx on public.benchmark_records (source_id);
create index if not exists benchmark_records_batch_idx on public.benchmark_records (import_batch_id);
create index if not exists benchmark_records_verified_by_idx on public.benchmark_records (verified_by);
-- Public reads filter on verification status (RLS + lookups).
create index if not exists benchmark_records_verified_lookup_idx
  on public.benchmark_records (game_id, gpu_id, resolution, preset) where verification_status = 'verified';

-- ---------------------------------------------------------------- games and components (extend)

alter table public.games
  add column if not exists slug          text unique,
  add column if not exists publisher     text,
  add column if not exists resolutions   text[] not null default '{1080p,1440p,4K}',
  add column if not exists presets       text[] not null default '{low,medium,high,ultra}',
  add column if not exists image_url     text,
  add column if not exists data_status   text not null default 'model-only'
                                         check (data_status in ('measured', 'partial', 'model-only', 'unavailable'));

alter table public.components
  add column if not exists architecture    text,
  add column if not exists vram_gb         integer check (vram_gb > 0),
  add column if not exists release_date    date,
  add column if not exists power_w         integer check (power_w > 0),
  add column if not exists official_url    text,
  add column if not exists verified_at     timestamptz;

-- ---------------------------------------------------------------- row level security

alter table public.data_sources              enable row level security;
alter table public.benchmark_import_batches  enable row level security;

-- Global benchmark data is curated: the earlier "any signed-in user may insert" policy is removed,
-- and public reads see verified records only.
drop policy if exists "benchmarks insert own" on public.benchmark_records;
drop policy if exists "benchmarks read" on public.benchmark_records;

drop policy if exists "benchmarks read verified" on public.benchmark_records;
create policy "benchmarks read verified" on public.benchmark_records
  for select using (
    verification_status = 'verified'
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  );
drop policy if exists "benchmarks admin insert" on public.benchmark_records;
create policy "benchmarks admin insert" on public.benchmark_records
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "benchmarks admin update" on public.benchmark_records;
create policy "benchmarks admin update" on public.benchmark_records
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "benchmarks admin delete" on public.benchmark_records;
create policy "benchmarks admin delete" on public.benchmark_records
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "sources read" on public.data_sources;
create policy "sources read" on public.data_sources for select using (true);
drop policy if exists "sources admin write" on public.data_sources;
create policy "sources admin write" on public.data_sources
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "batches admin" on public.benchmark_import_batches;
create policy "batches admin" on public.benchmark_import_batches
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
