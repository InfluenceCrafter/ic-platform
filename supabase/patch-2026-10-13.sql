-- One-off patch: adds the new `past_brands` column that the blogger card's
-- "External brand collaborations" tag field (blogger-database.html) and the
-- AI script/match endpoints (api/generate-script.js, api/match-bloggers.js)
-- already depend on. Idempotent — safe to re-run.

alter table blogger_directory
  add column if not exists past_brands text[] default '{}';

-- Lets a performance-history entry be tagged to the campaign it was posted
-- for, so the Projects page can roll up views/likes/comments/ER per
-- campaign for the new Reporting tab (previously entries were only linked
-- to a blogger, with no way to attribute them to a specific project).
alter table blogger_performance_history
  add column if not exists project_id uuid references projects(id) on delete set null;

notify pgrst, 'reload schema';
