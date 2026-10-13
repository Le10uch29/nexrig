-- BuildAI data model. NOT APPLIED: no database is connected in this repository.
-- The app currently runs on the local demo dataset (data/components.ts) and browser localStorage.
-- Apply with the Supabase CLI once a project is linked, then implement HardwareRepository
-- (lib/hardware/repository.ts) against these tables.

-- ---------------------------------------------------------------- hardware catalogue (public read)

create table public.components (
  id            text primary key,                 -- stable slug, e.g. 'rtx-5070-fe'
  category      text not null check (category in ('case','motherboard','cpu','cooler','ram','gpu','storage','psu','fans')),
  brand         text not null,
  model         text not null,
  name          text not null,
  -- Category-specific specs, validated in TypeScript (types/hardware.ts).
  specs         jsonb not null default '{}'::jsonb,
  visual        jsonb not null default '{}'::jsonb,
  data_quality  text not null check (data_quality in ('manufacturer-verified','manufacturer-unverified','approximate')),
  spec_source   text,                              -- URL or citation for the spec sheet
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index components_category_idx on public.components (category);

create table public.component_prices (
  id            bigint generated always as identity primary key,
  component_id  text not null references public.components (id) on delete cascade,
  amount        numeric(12,2) not null check (amount >= 0),
  currency      text not null default 'RUB',
  source        text not null,                     -- store / feed name; 'demo' for hand-entered figures
  source_url    text,
  observed_at   timestamptz not null default now()
);
create index component_prices_component_observed_idx on public.component_prices (component_id, observed_at desc);

-- Deterministic rules live in code (features/compatibility); this table records versioned
-- rule metadata so reports can reference which rule set produced them.
create table public.compatibility_rules (
  id            text primary key,                  -- e.g. 'socket', 'gpu-length'
  version       integer not null default 1,
  description   text not null,
  categories    text[] not null,
  updated_at    timestamptz not null default now()
);

create table public.games (
  id            text primary key,
  title         text not null,
  version       text,
  supports_rt   boolean not null default false,
  upscalers     text[] not null default '{}'
);

-- Measured results only. Estimates are computed at request time and never stored here.
create table public.benchmark_records (
  id            bigint generated always as identity primary key,
  game_id       text not null references public.games (id),
  game_version  text,
  cpu_id        text not null references public.components (id),
  gpu_id        text not null references public.components (id),
  resolution    text not null check (resolution in ('1080p','1440p','4K')),
  preset        text not null check (preset in ('low','medium','high','ultra')),
  ray_tracing   boolean not null default false,
  upscaling     text not null default 'off' check (upscaling in ('off','quality','balanced','performance')),
  avg_fps       numeric(7,2) not null check (avg_fps > 0),
  low1_fps      numeric(7,2) check (low1_fps > 0),
  source_label  text not null,
  source_url    text,
  test_date     date not null,
  conditions    text,
  sample_count  integer not null default 1 check (sample_count > 0),
  submitted_by  uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index benchmark_records_lookup_idx
  on public.benchmark_records (game_id, cpu_id, gpu_id, resolution, preset, ray_tracing, upscaling);
create index benchmark_records_cpu_idx on public.benchmark_records (cpu_id);
create index benchmark_records_gpu_idx on public.benchmark_records (gpu_id);
create index benchmark_records_submitted_by_idx on public.benchmark_records (submitted_by);

-- ---------------------------------------------------------------- user data (owner-only)

create table public.saved_builds (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) <= 120),
  total_price   numeric(12,2),                     -- snapshot at save time
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index saved_builds_owner_idx on public.saved_builds (owner_id, updated_at desc);

create table public.build_components (
  id            bigint generated always as identity primary key,
  build_id      uuid not null references public.saved_builds (id) on delete cascade,
  component_id  text not null references public.components (id),
  category      text not null,
  -- Installation anchor and resolved pose (scene units) for restoring the 3D layout.
  anchor        text,
  position      double precision[3],
  rotation      double precision[3]
);
create index build_components_build_idx on public.build_components (build_id);
create index build_components_component_idx on public.build_components (component_id);

create table public.ai_reports (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  build_id      uuid references public.saved_builds (id) on delete set null,
  mode          text not null check (mode in ('deterministic','llm')),
  model         text,
  question      text,
  answer        text not null,
  agents        jsonb not null,                    -- specialist outputs incl. executed tool calls
  created_at    timestamptz not null default now()
);
create index ai_reports_owner_idx on public.ai_reports (owner_id, created_at desc);
create index ai_reports_build_idx on public.ai_reports (build_id);

-- ---------------------------------------------------------------- row level security

alter table public.components          enable row level security;
alter table public.component_prices    enable row level security;
alter table public.compatibility_rules enable row level security;
alter table public.games               enable row level security;
alter table public.benchmark_records   enable row level security;
alter table public.saved_builds        enable row level security;
alter table public.build_components    enable row level security;
alter table public.ai_reports          enable row level security;

-- Catalogue: readable by everyone; writes only through the service role.
create policy "catalogue read" on public.components          for select using (true);
create policy "prices read"    on public.component_prices    for select using (true);
create policy "rules read"     on public.compatibility_rules for select using (true);
create policy "games read"     on public.games               for select using (true);
create policy "benchmarks read" on public.benchmark_records  for select using (true);
create policy "benchmarks insert own" on public.benchmark_records
  for insert to authenticated with check (submitted_by = (select auth.uid()));

-- Saved builds and reports: owner only.
create policy "builds owner" on public.saved_builds
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "build components owner" on public.build_components
  for all to authenticated
  using (exists (select 1 from public.saved_builds b where b.id = build_id and b.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.saved_builds b where b.id = build_id and b.owner_id = (select auth.uid())));

create policy "reports owner" on public.ai_reports
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
