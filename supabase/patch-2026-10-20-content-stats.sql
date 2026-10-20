-- One-off patch: lets performance stats be logged per CONTENT UNIT
-- (one Reel, one TikTok, one Stories batch, etc.) instead of one blended
-- row per blogger per wave. Each content unit gets its own reach +
-- engagement + auto-computed ER + manually-entered CTR, entered right on
-- the roster card next to that unit's link.
--
-- Idempotent — safe to re-run. Order-independent with the other patches.

alter table blogger_performance_history
  add column if not exists format text,
  add column if not exists engagement numeric;

notify pgrst, 'reload schema';
