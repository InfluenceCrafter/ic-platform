-- InfluenceCrafter Creator Hub — Phase 2 schema
-- Run this once in Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: uses "if not exists" / "or replace" everywhere.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. PROFILES (mirrors auth.users, adds role/status/name)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'creator')),
  email text not null,
  first_name text not null,
  last_name text not null,
  status text not null default 'pending_approval'
    check (status in ('active', 'pending_approval', 'approved', 'rejected', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  instagram_username text default '',
  tiktok_username text default '',
  youtube_username text default '',
  city text default '',
  country text default '',
  languages text[] default '{}',
  phone text default '',
  social jsonb not null default '{"instagram":{"followers":0,"avgReach":0,"avgStoryViews":0,"avgReelViews":0,"engagementRate":0},"tiktok":{"followers":0,"avgReach":0,"avgStoryViews":0,"avgReelViews":0,"engagementRate":0}}',
  categories text[] default '{}',
  preferences jsonb not null default '{"barter":true,"paid":true,"events":false,"restaurantVisits":false,"productGifting":false,"storiesOnly":false,"reels":false,"tiktokCollabs":false,"availableForPlusOne":false,"availableForTravel":false,"minNoticeDays":7}',
  dietary text[] default '{}',
  internal jsonb not null default '{"reliabilityRating":null,"contentQualityRating":null,"communicationRating":null,"internalTags":[],"blacklisted":false,"vip":false,"internalNotes":"","totalCompleted":0,"totalCancelled":0,"totalMissedDeadlines":0}',
  profile_photo text default ''
);

-- ============================================================
-- 2. CAMPAIGNS
-- ============================================================
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo text default '',
  website text default '',
  active boolean not null default true
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  title text not null,
  manager_name text default '',
  city text default '',
  category text default '',
  collaboration_type text default '',
  status text not null default 'draft'
    check (status in ('draft', 'open_for_applications', 'closing_soon', 'full', 'in_progress', 'completed', 'cancelled', 'archived')),
  visibility text not null default 'public' check (visibility in ('public', 'invite_only')),
  short_description text default '',
  full_description text default '',
  address text default '',
  deliverables jsonb not null default '[]',
  compensation jsonb not null default '{}',
  brief jsonb not null default '{}',
  capacity int,
  campaign_start date,
  campaign_end date,
  application_deadline date,
  reporting_deadline date,
  criteria jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. APPLICATIONS / COLLABORATIONS / TASKS
-- ============================================================
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creator_profiles(id) on delete cascade,
  why text default '',
  preferred_date date,
  alt_date date,
  plus_one boolean default false,
  content_idea text default '',
  note text default '',
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer uuid references profiles(id),
  collaboration_id uuid
);

create table if not exists collaborations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creator_profiles(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined', 'creator_withdrew', 'completed', 'cancelled')),
  accepted_date timestamptz,
  visit_date date,
  visit_status text,
  publication_date timestamptz,
  statistics_deadline date,
  internal_notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references collaborations(id) on delete cascade,
  type text not null,
  title text not null,
  requires_link boolean default false,
  requires_file boolean default false,
  admin_approval boolean default false,
  deadline timestamptz,
  status text not null default 'not_started'
    check (status in ('not_started', 'submitted', 'approved', 'completed', 'changes_requested', 'waived')),
  completed_date timestamptz,
  submission jsonb,
  admin_comment text default ''
);

create table if not exists content_submissions (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references collaborations(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  version int not null default 1,
  file_name text,
  file_size int,
  note text default '',
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewer_comment text default ''
);

create table if not exists published_content (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references collaborations(id) on delete cascade,
  platform text default 'Instagram',
  url text not null,
  disclosure boolean default false,
  brand_tagged boolean default false,
  published_date timestamptz not null default now()
);

create table if not exists statistics (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references collaborations(id) on delete cascade,
  views int default 0,
  reach int default 0,
  likes int default 0,
  comments int default 0,
  screenshot_name text,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted'
);

-- ============================================================
-- 4. MESSAGES / NOTIFICATIONS / ACTIVITY LOG
-- ============================================================
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references collaborations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text default 'general',
  title text not null,
  message text not null,
  campaign_id uuid references campaigns(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  -- Who sent it (defaults to the inserting session). Needed so the sender
  -- can read their own just-created row back (dbInsert() does .select()),
  -- since notifications are usually addressed to someone else (user_id).
  created_by uuid references profiles(id) default auth.uid()
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  entity_type text,
  entity_id uuid,
  action text not null,
  campaign_id uuid references campaigns(id) on delete set null,
  meta text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4b. BLOGGER DIRECTORY (admin-only internal database, replaces the
-- manual Excel workflow: creators fill a Google Form, admin copies the
-- approved ones in here, grouped by city -> language group)
-- ============================================================
create table if not exists blogger_directory (
  id uuid primary key default gen_random_uuid(),
  profile_name text not null,
  instagram_url text,
  tiktok_url text,
  email text,
  followers_count integer,
  engagement_rate numeric(5,2),
  avg_reach_90d integer,
  audience_notes text,
  audience_stats jsonb default '{}'::jsonb,
  city text,
  language_group text,
  audience_countries text[] default '{}',
  gender text check (gender in ('male', 'female', 'other')),
  collab_type text not null default 'barter' check (collab_type in ('barter', 'paid', 'both')),
  reel_price numeric(10,2),
  story_price numeric(10,2),
  terms_notes text,
  status text not null default 'active' check (status in ('active', 'contacted', 'archived')),
  stats_updated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid()
);

-- ============================================================
-- 4c. PROJECTS (internal collaboration tracker — separate from the
-- public campaign marketplace above. There, creators apply to open
-- campaigns and get reviewed; here the admin adds bloggers straight
-- from blogger_directory and tracks their progress by hand. Phase 1
-- is admin-only; brand/blogger portal access comes in a later phase.)
-- ============================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null, -- unused by the UI now; the project title itself is the brand/campaign name
  title text not null,
  category text default '', -- free-text sphere tag, e.g. "Gastro" — optional
  status text not null default 'planning' check (status in ('planning', 'active', 'completed', 'archived')),
  brief text default '',
  brief_pdf_link text default '', -- link to a PDF presentation (Google Drive/Dropbox), not a real file upload
  deliverables text default '',
  address text default '',
  start_date date,
  end_date date,
  content_deadline date,
  notes text default '',
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid()
);

-- Standard 9-step checklist, auto-seeded per project from a fixed template
-- (see PROJECT_CHECKLIST_TEMPLATE in projects.html) but freely editable —
-- steps can be checked off, removed, or added per project.
create table if not exists project_checklist (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  step_order int not null default 0,
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists project_bloggers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  blogger_id uuid not null references blogger_directory(id) on delete cascade,
  expected_visit_date date,
  visit_track_status text not null default 'on_track'
    check (visit_track_status in ('on_track', 'at_risk', 'find_replacement')),
  actual_visit_date date,
  visit_confirmed boolean not null default false,
  content_status text not null default 'not_posted'
    check (content_status in ('not_posted', 'draft_submitted', 'live')),
  content_what text default '', -- unused by the UI now, superseded by content_format
  content_format text[] default '{}', -- e.g. {reel, stories} — what was actually posted
  content_link text default '', -- unused by the UI now, superseded by content_links (one link per format)
  content_links jsonb default '{}', -- { reel: url, tiktok: url, post: url } — one field per selected format
  stories_link text default '', -- Stories vanish, so this is a Google Drive (or similar) link instead
  group_label text default '', -- free-form grouping within a project, e.g. "New", "Returning", "Food bloggers", "Event"
  stats_requested boolean not null default false,
  stats_submitted boolean not null default false,
  notes text default '',
  created_at timestamptz not null default now(),
  unique (project_id, blogger_id)
);

-- ============================================================
-- 5. HELPER: is_admin() — used by RLS policies below
-- ============================================================
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- 6. AUTO-CREATE PROFILE ON SIGNUP
-- Reads first_name/last_name/role/status passed in via
-- supabase.auth.signUp({ options: { data: {...} } })
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, role, email, first_name, last_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'creator'),
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'status', 'pending_approval')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table creator_profiles enable row level security;
alter table brands enable row level security;
alter table campaigns enable row level security;
alter table applications enable row level security;
alter table collaborations enable row level security;
alter table tasks enable row level security;
alter table content_submissions enable row level security;
alter table published_content enable row level security;
alter table statistics enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;
alter table blogger_directory enable row level security;
alter table projects enable row level security;
alter table project_checklist enable row level security;
alter table project_bloggers enable row level security;

-- profiles
-- Any authenticated user can also see admin rows specifically (role = 'admin')
-- — needed so creators can look up who to notify (e.g. opportunities.html's
-- "notify all admins of a new application" loop reads db.users for admins).
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_admin() or role = 'admin');
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or is_admin());

-- creator_profiles
drop policy if exists "creator_profiles_select" on creator_profiles;
create policy "creator_profiles_select" on creator_profiles for select
  using (user_id = auth.uid() or is_admin());
drop policy if exists "creator_profiles_insert" on creator_profiles;
create policy "creator_profiles_insert" on creator_profiles for insert
  with check (user_id = auth.uid() or is_admin());
drop policy if exists "creator_profiles_update" on creator_profiles;
create policy "creator_profiles_update" on creator_profiles for update
  using (user_id = auth.uid() or is_admin());

-- brands (read: any logged-in user; write: admin)
drop policy if exists "brands_select" on brands;
create policy "brands_select" on brands for select using (auth.role() = 'authenticated');
drop policy if exists "brands_write" on brands;
create policy "brands_write" on brands for all using (is_admin()) with check (is_admin());

-- campaigns (creators see public+open ones; admin sees/edits all)
drop policy if exists "campaigns_select" on campaigns;
create policy "campaigns_select" on campaigns for select
  using (
    is_admin()
    or (visibility = 'public' and status in ('open_for_applications', 'closing_soon', 'full', 'in_progress', 'completed'))
  );
drop policy if exists "campaigns_write" on campaigns;
create policy "campaigns_write" on campaigns for all using (is_admin()) with check (is_admin());

-- applications (creator: own only; admin: all)
drop policy if exists "applications_select" on applications;
create policy "applications_select" on applications for select
  using (is_admin() or creator_id in (select id from creator_profiles where user_id = auth.uid()));
drop policy if exists "applications_insert" on applications;
create policy "applications_insert" on applications for insert
  with check (is_admin() or creator_id in (select id from creator_profiles where user_id = auth.uid()));
drop policy if exists "applications_update" on applications;
create policy "applications_update" on applications for update
  using (is_admin() or creator_id in (select id from creator_profiles where user_id = auth.uid()));

-- collaborations (creator: own only; admin: all)
drop policy if exists "collaborations_select" on collaborations;
create policy "collaborations_select" on collaborations for select
  using (is_admin() or creator_id in (select id from creator_profiles where user_id = auth.uid()));
drop policy if exists "collaborations_insert" on collaborations;
create policy "collaborations_insert" on collaborations for insert
  with check (is_admin());
drop policy if exists "collaborations_update" on collaborations;
create policy "collaborations_update" on collaborations for update
  using (is_admin() or creator_id in (select id from creator_profiles where user_id = auth.uid()));

-- tasks (via parent collaboration ownership)
drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select
  using (
    is_admin() or collaboration_id in (
      select c.id from collaborations c
      join creator_profiles cp on cp.id = c.creator_id
      where cp.user_id = auth.uid()
    )
  );
drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks for insert with check (is_admin());
drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks for update
  using (
    is_admin() or collaboration_id in (
      select c.id from collaborations c
      join creator_profiles cp on cp.id = c.creator_id
      where cp.user_id = auth.uid()
    )
  );

-- content_submissions / published_content / statistics — same ownership pattern
drop policy if exists "content_submissions_all" on content_submissions;
create policy "content_submissions_all" on content_submissions for all
  using (
    is_admin() or collaboration_id in (
      select c.id from collaborations c join creator_profiles cp on cp.id = c.creator_id where cp.user_id = auth.uid()
    )
  )
  with check (
    is_admin() or collaboration_id in (
      select c.id from collaborations c join creator_profiles cp on cp.id = c.creator_id where cp.user_id = auth.uid()
    )
  );

drop policy if exists "published_content_all" on published_content;
create policy "published_content_all" on published_content for all
  using (
    is_admin() or collaboration_id in (
      select c.id from collaborations c join creator_profiles cp on cp.id = c.creator_id where cp.user_id = auth.uid()
    )
  )
  with check (
    is_admin() or collaboration_id in (
      select c.id from collaborations c join creator_profiles cp on cp.id = c.creator_id where cp.user_id = auth.uid()
    )
  );

drop policy if exists "statistics_all" on statistics;
create policy "statistics_all" on statistics for all
  using (
    is_admin() or collaboration_id in (
      select c.id from collaborations c join creator_profiles cp on cp.id = c.creator_id where cp.user_id = auth.uid()
    )
  )
  with check (
    is_admin() or collaboration_id in (
      select c.id from collaborations c join creator_profiles cp on cp.id = c.creator_id where cp.user_id = auth.uid()
    )
  );

-- messages (participants of the collaboration: creator + admin)
drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages for select
  using (
    is_admin() or collaboration_id in (
      select c.id from collaborations c join creator_profiles cp on cp.id = c.creator_id where cp.user_id = auth.uid()
    )
  );
drop policy if exists "messages_insert" on messages;
create policy "messages_insert" on messages for insert
  with check (
    sender_id = auth.uid() and (
      is_admin() or collaboration_id in (
        select c.id from collaborations c join creator_profiles cp on cp.id = c.creator_id where cp.user_id = auth.uid()
      )
    )
  );

-- notifications (any authenticated user can create one for another user; only the owner can read/mark-read)
drop policy if exists "notifications_select" on notifications;
create policy "notifications_select" on notifications for select
  using (user_id = auth.uid() or created_by = auth.uid() or is_admin());
drop policy if exists "notifications_insert" on notifications;
create policy "notifications_insert" on notifications for insert
  with check (auth.role() = 'authenticated');
drop policy if exists "notifications_update" on notifications;
create policy "notifications_update" on notifications for update
  using (user_id = auth.uid() or is_admin());

-- activity_log (any authenticated user can insert; admin reads the full feed,
-- and a user can read back their own rows — required because dbInsert() does
-- .insert().select() and Postgres needs SELECT visibility on the row it just
-- inserted, or it reports the whole insert as an RLS violation).
drop policy if exists "activity_log_select" on activity_log;
create policy "activity_log_select" on activity_log for select
  using (is_admin() or user_id = auth.uid());
drop policy if exists "activity_log_insert" on activity_log;
create policy "activity_log_insert" on activity_log for insert with check (auth.role() = 'authenticated');

-- blogger_directory (admin-only internal tool — creators never see this table)
drop policy if exists "blogger_directory_all" on blogger_directory;
create policy "blogger_directory_all" on blogger_directory for all
  using (is_admin()) with check (is_admin());

-- projects / project_checklist / project_bloggers (admin-only for now —
-- brand and blogger access is added in a later phase, once those portals exist)
drop policy if exists "projects_all" on projects;
create policy "projects_all" on projects for all
  using (is_admin()) with check (is_admin());
drop policy if exists "project_checklist_all" on project_checklist;
create policy "project_checklist_all" on project_checklist for all
  using (is_admin()) with check (is_admin());
drop policy if exists "project_bloggers_all" on project_bloggers;
create policy "project_bloggers_all" on project_bloggers for all
  using (is_admin()) with check (is_admin());

-- Base table-level privileges. RLS policies above only restrict rows;
-- Postgres also requires the underlying GRANT before a role can touch a
-- table at all. No table has a delete policy, so delete is intentionally
-- omitted here.
grant select, insert, update on
  profiles,
  creator_profiles,
  brands,
  campaigns,
  applications,
  collaborations,
  tasks,
  content_submissions,
  published_content,
  statistics,
  messages,
  notifications,
  activity_log,
  blogger_directory,
  projects,
  project_checklist,
  project_bloggers
to authenticated;

-- blogger_directory / projects / project_checklist / project_bloggers need
-- delete too (admin cleans up bad/duplicate entries, closed-out projects,
-- removed rosters, removed checklist steps), unlike every other table above.
grant delete on blogger_directory, projects, project_checklist, project_bloggers to authenticated;
