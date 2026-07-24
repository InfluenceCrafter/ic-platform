// Admin-initiated creator account creation.
// Runs server-side (Deno) with the service_role key, which must never reach
// the browser. Verifies the caller is a logged-in admin, then creates the
// auth user (via admin.createUser) plus its creator_profiles row.
// Deploy: supabase functions deploy admin-create-creator

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not authenticated.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !caller) return json({ error: 'Not authenticated.' }, 401);

  const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', caller.id).single();
  if (!callerProfile || callerProfile.role !== 'admin') return json({ error: 'Admins only.' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const { email, password, firstName, lastName, instagramUsername, city, country, language } = body as {
    email?: string; password?: string; firstName?: string; lastName?: string;
    instagramUsername?: string; city?: string; country?: string; language?: string;
  };
  if (!email || !password || !firstName || !lastName) {
    return json({ error: 'Missing required fields.' }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'creator', first_name: firstName, last_name: lastName, status: 'approved' },
  });
  if (createErr) {
    const msg = createErr.message.toLowerCase().includes('already registered')
      ? 'An account with this email already exists.'
      : createErr.message;
    return json({ error: msg }, 400);
  }

  const userId = created.user.id;

  const { error: profileErr } = await adminClient.from('creator_profiles').insert({
    user_id: userId,
    instagram_username: instagramUsername || '',
    city: city || '',
    country: country || '',
    languages: language ? [language] : [],
  });
  if (profileErr) {
    await adminClient.auth.admin.deleteUser(userId);
    return json({ error: `Creator profile insert failed: ${profileErr.message}` }, 500);
  }

  const { error: activityErr } = await adminClient.from('activity_log').insert({
    user_id: userId,
    entity_type: 'user',
    entity_id: userId,
    action: 'Creator account created by admin',
  });

  const { error: notifErr } = await adminClient.from('notifications').insert({
    user_id: userId,
    type: 'account',
    title: 'Welcome to InfluenceCrafter Creator Hub',
    message: 'Your account was created by the InfluenceCrafter team. Log in with the email and password you were given.',
  });

  return json({ userId, warnings: [activityErr?.message, notifErr?.message].filter(Boolean) });
});
