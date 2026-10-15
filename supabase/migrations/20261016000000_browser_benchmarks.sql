-- NexRig browser benchmark (mode B): results users chose to publish.
-- Additive and safe to re-run. Requires 20261015000000_fps_data_engine.sql.
--
-- Not a game-FPS table: these are frame rates of the fixed NexRig WebGL2/WebGPU workload and are
-- kept apart from benchmark_records. Only results of the same test_version, preset, backend and
-- mode are ever compared.
--
-- Privacy: no IP address, location or full user agent is stored. submitted_by is kept for
-- moderation and rate limits only and is never returned by the public API. The GPU name is stored
-- only when the user opted in before publishing, and is shown publicly only after verification.
--
-- Access: the app writes and reads through the server (secret key) after validating each result.
-- Through the Data API, users can read only their own rows; admins can read and moderate all.
-- No other privileges are granted (see the end of the file).

create table if not exists public.browser_benchmark_results (
  id               uuid primary key default gen_random_uuid(),
  test_version     text not null check (char_length(test_version) <= 40),
  backend          text not null check (backend in ('webgl2', 'webgpu')),
  preset           text not null check (preset in ('light', 'medium', 'heavy')),
  mode             text not null check (mode in ('short', 'stability')),
  render_width     integer not null check (render_width between 1 and 8192),
  render_height    integer not null check (render_height between 1 and 8192),
  frames           integer not null check (frames > 0),
  batches          integer not null check (batches > 0),               -- timed batches of >= 50 ms
  duration_ms      integer not null check (duration_ms > 0),           -- sum of batch times
  wall_ms          integer not null check (wall_ms > 0),               -- wall time of the measurement
  median_fps       numeric(8,1) not null check (median_fps > 0),
  mean_fps         numeric(8,1) not null check (mean_fps > 0),
  p1_low_fps       numeric(8,1) not null check (p1_low_fps > 0),
  median_frame_ms  numeric(10,4) not null check (median_frame_ms > 0),
  cv               numeric(6,3) not null check (cv >= 0),
  drift            numeric(6,3),
  window_fps       numeric(8,1)[] not null default '{}' check (cardinality(window_fps) <= 20),
  issues           text[] not null default '{}'
                   check (issues <@ array['no-measurement', 'too-few-frames', 'hidden', 'stalled', 'unstable', 'throttling', 'software', 'implausible']::text[]),
  anomaly_flags    text[] not null default '{}'
                   check (anomaly_flags <@ array['software', 'unstable', 'throttling', 'high-fps', 'low-frames']::text[]),
  software_renderer boolean not null default false,
  -- User-provided strings, restricted to what browsers report (no links or markup).
  gpu_renderer     text check (char_length(gpu_renderer) between 2 and 200 and gpu_renderer !~* '(https?:|www\.|<|>)'),
  browser          text check (browser ~ '^((Chrome|Edge|Firefox|Safari|Opera) [0-9]{1,4}|неизвестный браузер)$'),
  os               text check (os in ('Windows', 'macOS', 'Linux', 'Android', 'iOS', 'неизвестная ОС')),
  logical_cores    integer check (logical_cores between 1 and 1024),
  status           text not null default 'unverified' check (status in ('unverified', 'verified', 'rejected')),
  fingerprint      text not null check (char_length(fingerprint) <= 64),
  submitted_by     uuid references auth.users (id) on delete set null,
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint browser_results_low_le_median check (p1_low_fps <= median_fps),
  constraint browser_results_frames_ge_batches check (frames >= batches),
  constraint browser_results_busy_le_wall check (duration_ms <= wall_ms + 1)
);

-- One result per user and measurement (same summary twice = duplicate).
create unique index if not exists browser_results_user_fingerprint_idx on public.browser_benchmark_results (submitted_by, fingerprint);
-- Comparisons always filter on these.
create index if not exists browser_results_compare_idx on public.browser_benchmark_results (test_version, preset, backend, mode, status);
create index if not exists browser_results_status_created_idx on public.browser_benchmark_results (status, created_at desc);
create index if not exists browser_results_reviewed_by_idx on public.browser_benchmark_results (reviewed_by);

alter table public.browser_benchmark_results enable row level security;

drop policy if exists "browser results read own" on public.browser_benchmark_results;
create policy "browser results read own" on public.browser_benchmark_results
  for select to authenticated
  using (submitted_by = (select auth.uid()));

drop policy if exists "browser results admin" on public.browser_benchmark_results;
create policy "browser results admin" on public.browser_benchmark_results
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

-- Privileges. Supabase's default privileges grant everything (including TRUNCATE, which bypasses
-- RLS, TRIGGER and REFERENCES) to anon and authenticated on new tables. Start from nothing and
-- grant only what the policies above need:
--   anon          — nothing (public results come from the server API);
--   authenticated — SELECT (own rows / admins via RLS) and moderation columns for admins.
-- Inserts go through the server (validation, anomaly checks, limits), never straight from clients.
revoke all on public.browser_benchmark_results from anon, authenticated;
grant select on public.browser_benchmark_results to authenticated;
grant update (status, reviewed_by, reviewed_at) on public.browser_benchmark_results to authenticated;  -- admins only, by RLS
grant delete on public.browser_benchmark_results to authenticated;                                      -- admins only, by RLS
