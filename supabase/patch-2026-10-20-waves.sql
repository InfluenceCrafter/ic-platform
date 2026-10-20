-- One-off patch: adds "campaign waves" support for long-running retainer
-- projects (e.g. Bowlers), where the admin runs repeated monthly/bimonthly
-- batches of bloggers under ONE project instead of creating a brand-new
-- project every time. Opt-in per project via projects.has_waves — projects
-- that don't use it are completely unaffected.
--
-- Design (confirmed with the user):
--   - Waves are optional, toggled per project (has_waves boolean).
--   - If a blogger takes part in two waves of the same project, that is
--     TWO separate project_bloggers rows (one per wave), not one row with
--     nested wave history. Each row links to its wave via wave_id.
--   - Reporting supports both a single-wave view and an "all waves"
--     cumulative view.
--
-- Idempotent — safe to re-run.

-- 1. Opt-in flag on projects.
alter table projects
  add column if not exists has_waves boolean not null default false;

-- 2. New project_waves table — one row per wave (e.g. "08/09", "October 2026").
-- brand_mentions / google_reviews_* / avg_ctr are hand-entered, wave-level
-- aggregate numbers (mirrors the brand report's KPI table), not derived
-- from individual blogger_performance_history rows.
create table if not exists project_waves (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  start_date date,
  end_date date,
  notes text default '',
  brand_mentions integer,
  google_reviews_collected integer,
  google_reviews_total integer,
  avg_ctr numeric,
  created_at timestamptz not null default now()
);

-- 3. Link project_bloggers to a wave (nullable — non-wave projects leave this null).
alter table project_bloggers
  add column if not exists wave_id uuid references project_waves(id) on delete set null;

-- The old unique(project_id, blogger_id) constraint blocks the same blogger
-- from being added again in a later wave of the same project. Replace it
-- with a 3-column uniqueness that includes wave_id. Note: Postgres treats
-- multiple NULLs as distinct for uniqueness purposes, so non-wave projects
-- (wave_id always null) lose the DB-level duplicate guard and fall back to
-- the existing app-level "already in roster" check — this is expected.
alter table project_bloggers drop constraint if exists project_bloggers_project_id_blogger_id_key;
alter table project_bloggers add constraint project_bloggers_project_id_blogger_id_wave_id_key
  unique (project_id, blogger_id, wave_id);

-- 4. Link performance history to a wave, and add the two KPIs the brand
-- report tracks that weren't captured yet: reach (distinct from views) and
-- ctr (click-through rate, tracked as a per-wave average).
alter table blogger_performance_history
  add column if not exists wave_id uuid references project_waves(id) on delete set null,
  add column if not exists reach integer,
  add column if not exists ctr numeric;

-- 5. RLS + grants for project_waves, mirroring project_bloggers_all exactly
-- (admin-only internal tool, same as every other project_* table).
alter table project_waves enable row level security;
drop policy if exists "project_waves_all" on project_waves;
create policy "project_waves_all" on project_waves for all
  using (is_admin()) with check (is_admin());

grant select, insert, update on project_waves to authenticated;
grant delete on project_waves to authenticated;

notify pgrst, 'reload schema';
