-- One-off patch: adds the Monday team-call checklist (internal tool, admin-only).
-- One row per week (standup_weeks, keyed by the Monday date), a freely
-- editable checklist per week seeded from a template in weekly-checklist.html
-- (mirrors PROJECT_CHECKLIST_TEMPLATE in projects.html), and a running list
-- of questions/notes raised on the call. Unresolved questions are copied
-- forward into the next week by the app when it creates that week's row,
-- so nothing raised on a call gets silently dropped.
--
-- Idempotent — safe to re-run.

create table if not exists standup_weeks (
  id uuid primary key default gen_random_uuid(),
  week_date date not null unique, -- the Monday this call covers
  created_at timestamptz not null default now()
);

create table if not exists standup_items (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references standup_weeks(id) on delete cascade,
  owner text not null default '', -- free text, e.g. "Anna", "Veronika", "Both"
  step_order int not null default 0,
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists standup_questions (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references standup_weeks(id) on delete cascade,
  text text not null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table standup_weeks enable row level security;
alter table standup_items enable row level security;
alter table standup_questions enable row level security;

drop policy if exists "standup_weeks_all" on standup_weeks;
create policy "standup_weeks_all" on standup_weeks for all
  using (is_admin()) with check (is_admin());

drop policy if exists "standup_items_all" on standup_items;
create policy "standup_items_all" on standup_items for all
  using (is_admin()) with check (is_admin());

drop policy if exists "standup_questions_all" on standup_questions;
create policy "standup_questions_all" on standup_questions for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on standup_weeks, standup_items, standup_questions to authenticated;

notify pgrst, 'reload schema';
