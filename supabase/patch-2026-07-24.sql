-- One-off patch: brings the live database in sync with schema.sql.
-- Tables were created from an earlier version of schema.sql before several
-- columns were added; `create table if not exists` never adds columns to
-- an existing table, so those columns were silently missing.
-- Every statement below is idempotent (safe to re-run).

alter table brands
  add column if not exists website text default '',
  add column if not exists active boolean not null default true;

alter table campaigns
  add column if not exists brand_id uuid references brands(id) on delete set null,
  add column if not exists title text not null default '',
  add column if not exists manager_name text default '',
  add column if not exists city text default '',
  add column if not exists category text default '',
  add column if not exists collaboration_type text default '',
  add column if not exists status text not null default 'draft',
  add column if not exists visibility text not null default 'public',
  add column if not exists short_description text default '',
  add column if not exists full_description text default '',
  add column if not exists address text default '',
  add column if not exists deliverables jsonb not null default '[]',
  add column if not exists compensation jsonb not null default '{}',
  add column if not exists brief jsonb not null default '{}',
  add column if not exists capacity int,
  add column if not exists campaign_start date,
  add column if not exists campaign_end date,
  add column if not exists application_deadline date,
  add column if not exists reporting_deadline date,
  add column if not exists criteria jsonb not null default '{}',
  add column if not exists created_at timestamptz not null default now();

alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns add constraint campaigns_status_check
  check (status in ('draft', 'open_for_applications', 'closing_soon', 'full', 'in_progress', 'completed', 'cancelled', 'archived'));
alter table campaigns drop constraint if exists campaigns_visibility_check;
alter table campaigns add constraint campaigns_visibility_check
  check (visibility in ('public', 'invite_only'));

alter table applications
  add column if not exists campaign_id uuid references campaigns(id) on delete cascade,
  add column if not exists creator_id uuid references creator_profiles(id) on delete cascade,
  add column if not exists why text default '',
  add column if not exists preferred_date date,
  add column if not exists alt_date date,
  add column if not exists plus_one boolean default false,
  add column if not exists content_idea text default '',
  add column if not exists note text default '',
  add column if not exists status text not null default 'submitted',
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewer uuid references profiles(id),
  add column if not exists collaboration_id uuid;

alter table applications drop constraint if exists applications_status_check;
alter table applications add constraint applications_status_check
  check (status in ('submitted', 'under_review', 'approved', 'rejected'));

alter table collaborations
  add column if not exists campaign_id uuid references campaigns(id) on delete cascade,
  add column if not exists creator_id uuid references creator_profiles(id) on delete cascade,
  add column if not exists status text not null default 'invited',
  add column if not exists accepted_date timestamptz,
  add column if not exists visit_date date,
  add column if not exists visit_status text,
  add column if not exists publication_date timestamptz,
  add column if not exists statistics_deadline date,
  add column if not exists internal_notes text default '',
  add column if not exists created_at timestamptz not null default now();

alter table collaborations drop constraint if exists collaborations_status_check;
alter table collaborations add constraint collaborations_status_check
  check (status in ('invited', 'accepted', 'declined', 'creator_withdrew', 'completed', 'cancelled'));

alter table tasks
  add column if not exists collaboration_id uuid references collaborations(id) on delete cascade,
  add column if not exists type text not null default '',
  add column if not exists title text not null default '',
  add column if not exists requires_link boolean default false,
  add column if not exists requires_file boolean default false,
  add column if not exists admin_approval boolean default false,
  add column if not exists deadline timestamptz,
  add column if not exists status text not null default 'not_started',
  add column if not exists completed_date timestamptz,
  add column if not exists submission jsonb,
  add column if not exists admin_comment text default '';

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('not_started', 'submitted', 'approved', 'completed', 'changes_requested', 'waived'));

alter table content_submissions
  add column if not exists collaboration_id uuid references collaborations(id) on delete cascade,
  add column if not exists task_id uuid references tasks(id) on delete cascade,
  add column if not exists version int not null default 1,
  add column if not exists file_name text,
  add column if not exists file_size int,
  add column if not exists note text default '',
  add column if not exists status text not null default 'submitted',
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists reviewer_comment text default '';

alter table published_content
  add column if not exists collaboration_id uuid references collaborations(id) on delete cascade,
  add column if not exists platform text default 'Instagram',
  add column if not exists url text not null default '',
  add column if not exists disclosure boolean default false,
  add column if not exists brand_tagged boolean default false,
  add column if not exists published_date timestamptz not null default now();

alter table statistics
  add column if not exists collaboration_id uuid references collaborations(id) on delete cascade,
  add column if not exists views int default 0,
  add column if not exists reach int default 0,
  add column if not exists likes int default 0,
  add column if not exists comments int default 0,
  add column if not exists screenshot_name text,
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists status text not null default 'submitted';

alter table messages
  add column if not exists collaboration_id uuid references collaborations(id) on delete cascade,
  add column if not exists sender_id uuid references profiles(id),
  add column if not exists body text not null default '',
  add column if not exists read boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

alter table notifications
  add column if not exists user_id uuid references profiles(id) on delete cascade,
  add column if not exists type text default 'general',
  add column if not exists title text not null default '',
  add column if not exists message text not null default '',
  add column if not exists campaign_id uuid references campaigns(id) on delete set null,
  add column if not exists read boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

alter table activity_log
  add column if not exists user_id uuid references profiles(id),
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists action text not null default '',
  add column if not exists campaign_id uuid references campaigns(id) on delete set null,
  add column if not exists meta text,
  add column if not exists created_at timestamptz not null default now();

notify pgrst, 'reload schema';
