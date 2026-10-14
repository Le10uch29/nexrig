-- NOT APPLIED (no database connected). Additive only: no columns are dropped or rewritten.
-- Adds the FPS Lab record fields and data used by the extended compatibility rules.

alter table public.benchmark_records
  add column if not exists upscaler     text check (upscaler in ('DLSS','FSR','XeSS')),
  add column if not exists frame_gen    boolean not null default false,
  add column if not exists test_config  text,
  add column if not exists method       text,
  add column if not exists notes        text;

-- Matching/calibration lookups: same GPU in the same game, any CPU/settings.
create index if not exists benchmark_records_game_gpu_idx on public.benchmark_records (game_id, gpu_id);

alter table public.games
  add column if not exists frame_gen text[] not null default '{}';
