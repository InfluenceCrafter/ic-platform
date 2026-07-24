/* Session + auth helpers (mock — Phase 1 prototype). */

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setSession(userId) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function currentUser(db) {
  const session = getSession();
  if (!session) return null;
  return db.users.find((u) => u.id === session.userId) || null;
}

function currentCreatorProfile(db, user) {
  if (!user || user.role !== 'creator') return null;
  return db.creatorProfiles.find((p) => p.userId === user.id) || null;
}

/* Call at the top of every protected page. Redirects if not authorized. */
function requireRole(allowedRoles) {
  const db = loadDB();
  const user = currentUser(db);
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  if (!allowedRoles.includes(user.role)) {
    window.location.href = user.role === 'admin' ? 'admin-dashboard.html' : 'creator-dashboard.html';
    return null;
  }
  if (user.status === 'suspended' || user.status === 'archived') {
    clearSession();
    window.location.href = 'login.html';
    return null;
  }
  return { db, user };
}

function login(email, password) {
  const db = loadDB();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) return { ok: false, error: 'Invalid email or password.' };
  if (user.status === 'suspended') return { ok: false, error: 'This account has been suspended.' };
  if (user.status === 'archived') return { ok: false, error: 'This account is no longer active.' };
  setSession(user.id);
  user.lastLoginAt = nowISO();
  saveDB(db);
  return { ok: true, user };
}

function defaultCreatorProfile(profileId, userId, fields) {
  return {
    id: profileId,
    userId,
    instagramUsername: fields.instagramUsername || '',
    tiktokUsername: '',
    youtubeUsername: '',
    city: fields.city || '',
    country: fields.country || '',
    languages: fields.language ? [fields.language] : [],
    phone: '',
    social: {
      instagram: { followers: 0, avgReach: 0, avgStoryViews: 0, avgReelViews: 0, engagementRate: 0 },
      tiktok: { followers: 0, avgReach: 0, avgStoryViews: 0, avgReelViews: 0, engagementRate: 0 },
    },
    categories: [],
    preferences: {
      barter: true,
      paid: true,
      events: false,
      restaurantVisits: false,
      productGifting: false,
      storiesOnly: false,
      reels: false,
      tiktokCollabs: false,
      availableForPlusOne: false,
      availableForTravel: false,
      minNoticeDays: 7,
    },
    dietary: [],
    internal: {
      reliabilityRating: null,
      contentQualityRating: null,
      communicationRating: null,
      internalTags: [],
      blacklisted: false,
      vip: false,
      internalNotes: '',
      totalCompleted: 0,
      totalCancelled: 0,
      totalMissedDeadlines: 0,
    },
    profilePhoto: '',
  };
}

function registerCreator(fields) {
  const db = loadDB();
  if (db.users.some((u) => u.email.toLowerCase() === fields.email.toLowerCase())) {
    return { ok: false, error: 'An account with this email already exists.' };
  }
  const userId = uid('user');
  const profileId = uid('creator');
  db.users.push({
    id: userId,
    role: 'creator',
    email: fields.email,
    password: fields.password,
    firstName: fields.firstName,
    lastName: fields.lastName,
    status: 'pending_approval',
    createdAt: nowISO(),
  });
  db.creatorProfiles.push(defaultCreatorProfile(profileId, userId, fields));
  logActivity(db, { userId, entityType: 'user', entityId: userId, action: 'Creator registered' });
  db.users.filter((u) => u.role === 'admin').forEach((admin) => {
    addNotification(db, {
      userId: admin.id,
      type: 'account',
      title: 'New creator registration',
      message: `${fields.firstName} ${fields.lastName} registered and is awaiting approval.`,
    });
  });
  saveDB(db);
  return { ok: true };
}

/* Admin-initiated creator account creation — skips the pending_approval gate
   since an admin is vouching for the account directly. */
function adminCreateCreator(db, fields) {
  if (db.users.some((u) => u.email.toLowerCase() === fields.email.toLowerCase())) {
    return { ok: false, error: 'An account with this email already exists.' };
  }
  const userId = uid('user');
  const profileId = uid('creator');
  db.users.push({
    id: userId,
    role: 'creator',
    email: fields.email,
    password: fields.password,
    firstName: fields.firstName,
    lastName: fields.lastName,
    status: 'approved',
    createdAt: nowISO(),
  });
  db.creatorProfiles.push(defaultCreatorProfile(profileId, userId, fields));
  logActivity(db, { userId, entityType: 'user', entityId: userId, action: 'Creator account created by admin' });
  addNotification(db, {
    userId,
    type: 'account',
    title: 'Welcome to InfluenceCrafter Creator Hub',
    message: `Your account was created by the InfluenceCrafter team. Log in with the email and password you were given.`,
  });
  return { ok: true, userId };
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}
