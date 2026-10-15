-- Community builds: users publish a build with a description; everyone signed in can comment on
-- builds and reply to other users' comments. Additive and safe to re-run.
-- Requires 20261013000000_buildai_schema.sql (saved_builds).
--
-- Reuses public.saved_builds (no second builds table): a published build is a saved build with
-- is_public = true and a snapshot of the selection. Comments live in public.build_comments.
--
-- Access model: the app reads and writes through the server (secret key) — it validates the
-- selection against the catalogue, enforces limits and moderation, and never returns owner or
-- author ids. Through the Data API:
--   anon          — nothing;
--   authenticated — read own saved builds only (existing "builds owner" policy); no writes, so a
--                   user cannot publish unvalidated data or un-hide a build an admin has hidden.
-- saved_builds and build_components are empty in production at the time of writing; the app keeps
-- private saved builds in the browser, so revoking direct writes changes no current behaviour.

-- ---------------------------------------------------------------- saved_builds: publishing

alter table public.saved_builds
  add column if not exists is_public     boolean not null default false,
  add column if not exists description   text check (char_length(description) <= 2000),
  add column if not exists selection     jsonb,
  add column if not exists author_name   text check (char_length(author_name) between 2 and 32),
  add column if not exists author_is_admin boolean not null default false,    -- set by the server from the session
  add column if not exists hidden        boolean not null default false,       -- set by moderators
  add column if not exists published_at  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'saved_builds_public_needs_snapshot') then
    alter table public.saved_builds add constraint saved_builds_public_needs_snapshot
      check (not is_public or (selection is not null and jsonb_typeof(selection) = 'object' and author_name is not null and published_at is not null));
  end if;
end $$;

create index if not exists saved_builds_public_idx on public.saved_builds (published_at desc) where is_public and not hidden;

-- ---------------------------------------------------------------- comments

create table if not exists public.build_comments (
  id           uuid primary key default gen_random_uuid(),
  build_id     uuid not null references public.saved_builds (id) on delete cascade,
  parent_id    uuid references public.build_comments (id) on delete cascade,   -- reply to a comment
  author_id    uuid references auth.users (id) on delete set null,
  author_name  text not null check (char_length(author_name) between 2 and 32),
  author_is_admin boolean not null default false,                              -- set by the server from the session
  body         text not null check (char_length(body) between 1 and 2000),
  hidden       boolean not null default false,                                 -- set by moderators
  deleted      boolean not null default false,                                 -- removed by its author
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint build_comments_not_own_parent check (parent_id is null or parent_id <> id)
);

create index if not exists build_comments_build_idx on public.build_comments (build_id, created_at);
create index if not exists build_comments_parent_idx on public.build_comments (parent_id);
create index if not exists build_comments_author_idx on public.build_comments (author_id, created_at desc);

drop trigger if exists build_comments_touch on public.build_comments;
create trigger build_comments_touch before update on public.build_comments
  for each row execute function public.touch_updated_at();

alter table public.build_comments enable row level security;
-- No policies: comments are read and written only by the server (service role bypasses RLS).

-- ---------------------------------------------------------------- privileges

revoke all on public.build_comments from anon, authenticated;

revoke insert, update, delete, truncate, trigger, references on public.saved_builds from anon, authenticated;
revoke insert, update, delete, truncate, trigger, references on public.build_components from anon, authenticated;
revoke select on public.saved_builds from anon;
revoke select on public.build_components from anon;
