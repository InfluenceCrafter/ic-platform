-- One-off patch: adds the new `past_brands` column that the blogger card's
-- "External brand collaborations" tag field (blogger-database.html) and the
-- AI script/match endpoints (api/generate-script.js, api/match-bloggers.js)
-- already depend on. Idempotent — safe to re-run.

alter table blogger_directory
  add column if not exists past_brands text[] default '{}';

notify pgrst, 'reload schema';
