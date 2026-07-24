/* Session + auth helpers — Supabase Auth-backed (Phase 2).
   supabase-js persists its own session in localStorage; we never touch it directly. */

/* Lightweight "who's logged in" check — used by entry pages before a full loadDB(). */
async function currentUser() {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const { data: row } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
  return row ? toJs('users', row) : null;
}

function currentCreatorProfile(db, user) {
  if (!user || user.role !== 'creator') return null;
  return db.creatorProfiles.find((p) => p.userId === user.id) || null;
}

/* Call at the top of every protected page. Redirects if not authorized. */
async function requireRole(allowedRoles) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  const db = await loadDB();
  const user = db.users.find((u) => u.id === session.user.id) || null;
  if (!user) {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }
  if (!allowedRoles.includes(user.role)) {
    window.location.href = user.role === 'admin' ? 'admin-dashboard.html' : 'creator-dashboard.html';
    return null;
  }
  if (user.status === 'suspended' || user.status === 'archived') {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }
  return { db, user };
}

function mapAuthError(error) {
  const msg = error.message || '';
  if (msg.toLowerCase().includes('invalid login credentials')) return 'Invalid email or password.';
  return msg;
}

async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: mapAuthError(error) };
  const { data: row } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
  const user = toJs('users', row);
  if (user.status === 'suspended') {
    await supabase.auth.signOut();
    return { ok: false, error: 'This account has been suspended.' };
  }
  if (user.status === 'archived') {
    await supabase.auth.signOut();
    return { ok: false, error: 'This account is no longer active.' };
  }
  await supabase.from('profiles').update({ last_login_at: nowISO() }).eq('id', user.id);
  return { ok: true, user };
}

function creatorProfileFields(fields) {
  return {
    instagramUsername: fields.instagramUsername || '',
    city: fields.city || '',
    country: fields.country || '',
    languages: fields.language ? [fields.language] : [],
  };
}

async function registerCreator(fields) {
  const { data, error } = await supabase.auth.signUp({
    email: fields.email,
    password: fields.password,
    options: {
      data: { role: 'creator', first_name: fields.firstName, last_name: fields.lastName, status: 'pending_approval' },
    },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return { ok: false, error: 'An account with this email already exists.' };
    }
    return { ok: false, error: error.message };
  }
  const userId = data.user.id;
  await dbInsert('creatorProfiles', { userId, ...creatorProfileFields(fields) });
  await logActivity(null, { userId, entityType: 'user', entityId: userId, action: 'Creator registered' });
  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
  for (const admin of admins || []) {
    await addNotification(null, { userId: admin.id, type: 'account', title: 'New creator registration', message: `${fields.firstName} ${fields.lastName} registered and is awaiting approval.` });
  }
  /* signUp() leaves the browser signed in as the new (pending) account —
     sign back out so the person must explicitly log in once approved. */
  await supabase.auth.signOut();
  return { ok: true };
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/* Admin-initiated creator account creation. A static, backend-less client
   can't call Supabase's admin.createUser() itself — that requires the
   service_role key, which must never reach the browser. Instead this calls
   a Supabase Edge Function (supabase/functions/admin-create-creator) that
   holds that key server-side, verifies the caller is an admin, and creates
   the auth user + creator profile. */
async function adminCreateCreator(fields) {
  const password = generatePassword();
  const { data, error } = await supabase.functions.invoke('admin-create-creator', {
    body: { ...fields, password },
  });
  if (error) {
    let message = error.message || 'Could not create account.';
    if (error.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.json();
        if (body && body.error) message = body.error;
      } catch (_) { /* keep the generic error.message */ }
    }
    return { ok: false, error: message };
  }
  if (data && data.error) return { ok: false, error: data.error };
  return { ok: true, userId: data.userId, password };
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}
