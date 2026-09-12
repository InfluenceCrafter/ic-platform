/* IC Creator Hub — data layer backed by Supabase (Postgres + RLS).
   Business logic below mirrors the original localStorage prototype exactly;
   only the persistence boundary (loadDB / inserts / updates) is real now. */

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10);
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------------- Table registry: JS camelCase field <-> Postgres column ---------------- */
const TABLES = {
  users: {
    table: 'profiles',
    map: { id: 'id', role: 'role', email: 'email', firstName: 'first_name', lastName: 'last_name', status: 'status', createdAt: 'created_at', lastLoginAt: 'last_login_at' },
  },
  creatorProfiles: {
    table: 'creator_profiles',
    map: { id: 'id', userId: 'user_id', instagramUsername: 'instagram_username', tiktokUsername: 'tiktok_username', youtubeUsername: 'youtube_username', city: 'city', country: 'country', languages: 'languages', phone: 'phone', social: 'social', categories: 'categories', preferences: 'preferences', dietary: 'dietary', internal: 'internal', profilePhoto: 'profile_photo' },
  },
  brands: {
    table: 'brands',
    map: { id: 'id', name: 'name', logo: 'logo', website: 'website', active: 'active' },
  },
  campaigns: {
    table: 'campaigns',
    map: { id: 'id', brandId: 'brand_id', title: 'title', managerName: 'manager_name', city: 'city', category: 'category', collaborationType: 'collaboration_type', status: 'status', visibility: 'visibility', shortDescription: 'short_description', fullDescription: 'full_description', address: 'address', deliverables: 'deliverables', compensation: 'compensation', brief: 'brief', capacity: 'capacity', campaignStart: 'campaign_start', campaignEnd: 'campaign_end', applicationDeadline: 'application_deadline', reportingDeadline: 'reporting_deadline', criteria: 'criteria', createdAt: 'created_at' },
  },
  applications: {
    table: 'applications',
    map: { id: 'id', campaignId: 'campaign_id', creatorId: 'creator_id', why: 'why', preferredDate: 'preferred_date', altDate: 'alt_date', plusOne: 'plus_one', contentIdea: 'content_idea', note: 'note', status: 'status', submittedAt: 'submitted_at', reviewedAt: 'reviewed_at', reviewer: 'reviewer', collaborationId: 'collaboration_id' },
  },
  collaborations: {
    table: 'collaborations',
    map: { id: 'id', campaignId: 'campaign_id', creatorId: 'creator_id', status: 'status', acceptedDate: 'accepted_date', visitDate: 'visit_date', visitStatus: 'visit_status', publicationDate: 'publication_date', statisticsDeadline: 'statistics_deadline', internalNotes: 'internal_notes', createdAt: 'created_at' },
  },
  tasks: {
    table: 'tasks',
    map: { id: 'id', collaborationId: 'collaboration_id', type: 'type', title: 'title', requiresLink: 'requires_link', requiresFile: 'requires_file', adminApproval: 'admin_approval', deadline: 'deadline', status: 'status', completedDate: 'completed_date', submission: 'submission', adminComment: 'admin_comment' },
  },
  contentSubmissions: {
    table: 'content_submissions',
    map: { id: 'id', collaborationId: 'collaboration_id', taskId: 'task_id', version: 'version', fileName: 'file_name', fileSize: 'file_size', note: 'note', status: 'status', submittedAt: 'submitted_at', reviewerComment: 'reviewer_comment' },
  },
  publishedContent: {
    table: 'published_content',
    map: { id: 'id', collaborationId: 'collaboration_id', platform: 'platform', url: 'url', publishedDate: 'published_date', disclosure: 'disclosure', brandTagged: 'brand_tagged' },
  },
  statistics: {
    table: 'statistics',
    map: { id: 'id', collaborationId: 'collaboration_id', views: 'views', reach: 'reach', likes: 'likes', comments: 'comments', screenshotName: 'screenshot_name', submittedAt: 'submitted_at', status: 'status' },
  },
  messages: {
    table: 'messages',
    map: { id: 'id', collaborationId: 'collaboration_id', senderId: 'sender_id', text: 'body', timestamp: 'created_at', read: 'read' },
  },
  notifications: {
    table: 'notifications',
    map: { id: 'id', userId: 'user_id', type: 'type', title: 'title', message: 'message', campaignId: 'campaign_id', read: 'read', createdAt: 'created_at' },
  },
  activityLog: {
    table: 'activity_log',
    map: { id: 'id', userId: 'user_id', entityType: 'entity_type', entityId: 'entity_id', action: 'action', campaignId: 'campaign_id', meta: 'meta', timestamp: 'created_at' },
  },
  bloggerDirectory: {
    table: 'blogger_directory',
    map: { id: 'id', profileName: 'profile_name', instagramUrl: 'instagram_url', tiktokUrl: 'tiktok_url', email: 'email', followersCount: 'followers_count', engagementRate: 'engagement_rate', avgReach90d: 'avg_reach_90d', audienceNotes: 'audience_notes', audienceStats: 'audience_stats', city: 'city', languageGroup: 'language_group', audienceCountries: 'audience_countries', gender: 'gender', collabType: 'collab_type', reelPrice: 'reel_price', storyPrice: 'story_price', termsNotes: 'terms_notes', status: 'status', statsUpdatedAt: 'stats_updated_at', createdAt: 'created_at' },
  },
  projects: {
    table: 'projects',
    map: { id: 'id', brandId: 'brand_id', title: 'title', status: 'status', brief: 'brief', address: 'address', startDate: 'start_date', endDate: 'end_date', contentDeadline: 'content_deadline', notes: 'notes', createdAt: 'created_at' },
  },
  projectBloggers: {
    table: 'project_bloggers',
    map: { id: 'id', projectId: 'project_id', bloggerId: 'blogger_id', expectedVisitDate: 'expected_visit_date', visitTrackStatus: 'visit_track_status', actualVisitDate: 'actual_visit_date', visitConfirmed: 'visit_confirmed', contentStatus: 'content_status', contentWhat: 'content_what', contentLink: 'content_link', statsRequested: 'stats_requested', statsSubmitted: 'stats_submitted', notes: 'notes', createdAt: 'created_at' },
  },
};

function toRow(entity, obj) {
  const row = {};
  for (const [jsKey, col] of Object.entries(TABLES[entity].map)) {
    if (obj[jsKey] !== undefined) row[col] = obj[jsKey];
  }
  return row;
}

function toJs(entity, row) {
  const obj = {};
  for (const [jsKey, col] of Object.entries(TABLES[entity].map)) {
    obj[jsKey] = row[col] !== undefined ? row[col] : null;
  }
  return obj;
}

async function dbInsert(entity, jsObj) {
  const { data, error } = await supabase.from(TABLES[entity].table).insert(toRow(entity, jsObj)).select().single();
  if (error) throw error;
  return toJs(entity, data);
}

async function dbInsertMany(entity, jsObjs) {
  if (!jsObjs.length) return [];
  const { data, error } = await supabase.from(TABLES[entity].table).insert(jsObjs.map((o) => toRow(entity, o))).select();
  if (error) throw error;
  return data.map((r) => toJs(entity, r));
}

async function dbUpdate(entity, id, patch) {
  const { data, error } = await supabase.from(TABLES[entity].table).update(toRow(entity, patch)).eq('id', id).select().single();
  if (error) throw error;
  return toJs(entity, data);
}

async function dbDelete(entity, id) {
  const { error } = await supabase.from(TABLES[entity].table).delete().eq('id', id);
  if (error) throw error;
}

async function fetchAll(entity) {
  const { data, error } = await supabase.from(TABLES[entity].table).select('*');
  if (error) throw error;
  return data.map((r) => toJs(entity, r));
}

/* Loads every row the current signed-in user can see (enforced by RLS)
   into the same shape the rest of the app already expects. */
async function loadDB() {
  const entities = Object.keys(TABLES);
  const results = await Promise.all(entities.map((e) => fetchAll(e)));
  const db = {};
  entities.forEach((e, i) => { db[e] = results[i]; });
  return db;
}

async function logActivity(db, { userId, entityType, entityId, action, campaignId, meta }) {
  const row = await dbInsert('activityLog', { userId, entityType, entityId, campaignId: campaignId || null, action, meta: meta || null, timestamp: nowISO() });
  if (db) db.activityLog.push(row);
  return row;
}

async function addNotification(db, { userId, type, title, message, campaignId }) {
  const row = await dbInsert('notifications', { userId, type, title, message, campaignId: campaignId || null, read: false, createdAt: nowISO() });
  if (db) db.notifications.push(row);
  return row;
}

/* ---------------- Task template ---------------- */
/* Mirrors spec §13 example task template. */
function defaultTaskTemplate() {
  return [
    { type: 'accept', title: 'Accept collaboration', requiresLink: false, requiresFile: false, adminApproval: false },
    { type: 'read_brief', title: 'Read brief', requiresLink: false, requiresFile: false, adminApproval: false },
    { type: 'confirm_brief', title: 'Confirm brief', requiresLink: false, requiresFile: false, adminApproval: false },
    { type: 'visit_date', title: 'Select visit date', requiresLink: false, requiresFile: false, adminApproval: true },
    { type: 'visit', title: 'Complete venue visit', requiresLink: false, requiresFile: false, adminApproval: false },
    { type: 'draft', title: 'Upload draft content', requiresLink: false, requiresFile: true, adminApproval: true },
    { type: 'publish', title: 'Publish Reel & add link', requiresLink: true, requiresFile: false, adminApproval: false },
    { type: 'stats', title: 'Upload statistics', requiresLink: false, requiresFile: true, adminApproval: true },
    { type: 'complete', title: 'Complete collaboration', requiresLink: false, requiresFile: false, adminApproval: false },
  ];
}

/* ---------------- Collaboration + task creation ---------------- */
/* Deadlines derived from campaign dates, per the task's role in the lifecycle. */
function taskDeadline(taskType, campaign) {
  switch (taskType) {
    case 'visit_date':
      return campaign.campaignStart;
    case 'visit':
      return campaign.campaignStart;
    case 'draft':
      return midDate(campaign.campaignStart, campaign.campaignEnd);
    case 'publish':
      return campaign.campaignEnd;
    case 'stats':
      return campaign.reportingDeadline;
    default:
      return null;
  }
}

function midDate(startISO, endISO) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  return new Date(start + (end - start) / 2).toISOString();
}

/* Creates a Creator Collaboration + its Task checklist from the default template.
   `autoAccept` is true when the collaboration originates from an approved
   application (the creator already expressed intent by applying); false for
   a direct admin invite, which requires an explicit Accept/Decline (spec §10). */
async function createCollaboration(db, { campaignId, creatorId, autoAccept }) {
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  const collaboration = await dbInsert('collaborations', {
    campaignId,
    creatorId,
    status: autoAccept ? 'accepted' : 'invited',
    acceptedDate: autoAccept ? nowISO() : null,
    visitDate: null,
    visitStatus: null,
    publicationDate: null,
    statisticsDeadline: campaign.reportingDeadline,
    internalNotes: '',
    createdAt: nowISO(),
  });
  db.collaborations.push(collaboration);

  const taskRows = defaultTaskTemplate().map((tpl) => {
    const isAcceptTask = tpl.type === 'accept';
    return {
      collaborationId: collaboration.id,
      type: tpl.type,
      title: tpl.title,
      requiresLink: tpl.requiresLink,
      requiresFile: tpl.requiresFile,
      adminApproval: tpl.adminApproval,
      deadline: taskDeadline(tpl.type, campaign),
      status: isAcceptTask && autoAccept ? 'completed' : 'not_started',
      completedDate: isAcceptTask && autoAccept ? nowISO() : null,
      submission: null,
      adminComment: '',
    };
  });
  const tasks = await dbInsertMany('tasks', taskRows);
  db.tasks.push(...tasks);

  return collaboration;
}

/* Auto-completes a collaboration once every task except the terminal
   "complete" task itself is done (spec §34 automation #13). */
async function maybeCompleteCollaboration(db, collaborationId) {
  const tasks = db.tasks.filter((t) => t.collaborationId === collaborationId);
  const substantive = tasks.filter((t) => t.type !== 'complete');
  const allDone = substantive.every((t) => ['completed', 'approved', 'waived'].includes(t.status));
  if (!allDone) return false;

  const completeTask = tasks.find((t) => t.type === 'complete');
  if (completeTask && completeTask.status !== 'completed') {
    completeTask.status = 'completed';
    completeTask.completedDate = nowISO();
    await dbUpdate('tasks', completeTask.id, { status: 'completed', completedDate: completeTask.completedDate });
  }
  const collab = db.collaborations.find((c) => c.id === collaborationId);
  if (collab && collab.status !== 'completed') {
    collab.status = 'completed';
    await dbUpdate('collaborations', collab.id, { status: 'completed' });
    const profile = db.creatorProfiles.find((p) => p.id === collab.creatorId);
    if (profile) {
      profile.internal.totalCompleted = (profile.internal.totalCompleted || 0) + 1;
      profile.internal.lastCampaignDate = nowISO();
      await dbUpdate('creatorProfiles', profile.id, { internal: profile.internal });
    }
    await logActivity(db, { userId: profile ? profile.userId : null, entityType: 'collaboration', entityId: collaborationId, action: 'Collaboration completed', campaignId: collab.campaignId });
    const creatorUser = profile ? db.users.find((u) => u.id === profile.userId) : null;
    if (creatorUser) {
      await addNotification(db, { userId: creatorUser.id, type: 'campaign', title: 'Collaboration completed', message: 'Your collaboration has been marked completed. Thank you!', campaignId: collab.campaignId });
    }
  }
  return true;
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
