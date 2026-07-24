/* Supabase client init (Phase 2 — real database).
   The publishable key is safe to expose client-side: all access is gated by
   Postgres Row Level Security policies (see supabase/schema.sql). */

const SUPABASE_URL = 'https://bzldejdfunnsijsheict.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kcQhwBerkJ_RS1EquBufZg_CLNb9q_R';

/* The CDN UMD bundle declares a global `var supabase`, so redeclaring it
   with `const` here would be a SyntaxError (can't redeclare a var with a
   lexical binding). Reassign the same global instead of shadowing it. */
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
