/* IC Creator Hub — mock database backed by localStorage.
   Phase 1 prototype only: a real build should replace this with an actual
   backend (see spec §37/§38 Option B: Next.js + Supabase). */

const DB_KEY = 'ic_platform_db_v1';
const SESSION_KEY = 'ic_platform_session_v1';

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) return JSON.parse(raw);
  const fresh = seedDB();
  saveDB(fresh);
  return fresh;
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function logActivity(db, { userId, entityType, entityId, action, campaignId, meta }) {
  db.activityLog.push({
    id: uid('log'),
    userId,
    entityType,
    entityId,
    campaignId: campaignId || null,
    action,
    meta: meta || null,
    timestamp: nowISO(),
  });
}

function addNotification(db, { userId, type, title, message, campaignId }) {
  db.notifications.push({
    id: uid('notif'),
    userId,
    type,
    title,
    message,
    campaignId: campaignId || null,
    read: false,
    createdAt: nowISO(),
  });
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
function createCollaboration(db, { campaignId, creatorId, autoAccept }) {
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  const collaboration = {
    id: uid('collab'),
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
  };
  db.collaborations.push(collaboration);

  defaultTaskTemplate().forEach((tpl) => {
    const isAcceptTask = tpl.type === 'accept';
    db.tasks.push({
      id: uid('task'),
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
    });
  });

  return collaboration;
}

function seedDB() {
  const adminId = uid('user');
  const creatorUserId = uid('user');
  const creatorProfileId = uid('creator');
  const brandId = uid('brand');
  const campaignId = uid('campaign');

  const db = {
    users: [
      {
        id: adminId,
        role: 'admin',
        email: 'admin@influencecrafter.cz',
        password: 'admin123',
        firstName: 'InfluenceCrafter',
        lastName: 'Team',
        status: 'active',
        createdAt: nowISO(),
      },
      {
        id: creatorUserId,
        role: 'creator',
        email: 'anna@example.com',
        password: 'creator123',
        firstName: 'Anna',
        lastName: 'Nováková',
        status: 'approved',
        createdAt: nowISO(),
      },
    ],
    creatorProfiles: [
      {
        id: creatorProfileId,
        userId: creatorUserId,
        instagramUsername: '@anna.nk',
        tiktokUsername: '',
        youtubeUsername: '',
        city: 'Prague',
        country: 'Czech Republic',
        languages: ['English', 'Czech'],
        phone: '',
        social: {
          instagram: { followers: 18400, avgReach: 6200, avgStoryViews: 4100, avgReelViews: 9800, engagementRate: 4.2 },
          tiktok: { followers: 0, avgReach: 0, avgStoryViews: 0, avgReelViews: 0, engagementRate: 0 },
        },
        categories: ['Food', 'Lifestyle', 'Local Prague'],
        preferences: {
          barter: true,
          paid: true,
          events: true,
          restaurantVisits: true,
          productGifting: true,
          storiesOnly: false,
          reels: true,
          tiktokCollabs: false,
          availableForPlusOne: true,
          availableForTravel: false,
          minNoticeDays: 5,
        },
        dietary: [],
        internal: {
          reliabilityRating: 4,
          contentQualityRating: 4,
          communicationRating: 5,
          internalTags: ['reliable'],
          blacklisted: false,
          vip: false,
          internalNotes: '',
          totalCompleted: 2,
          totalCancelled: 0,
          totalMissedDeadlines: 0,
        },
        profilePhoto: '',
      },
    ],
    brands: [
      {
        id: brandId,
        name: 'Hoxton Fried Chicken',
        logo: '',
        website: '',
        active: true,
      },
    ],
    campaigns: [
      {
        id: campaignId,
        brandId,
        title: 'Hoxton Fried Chicken Creator Campaign',
        managerName: 'InfluenceCrafter Team',
        category: 'Food',
        city: 'Prague',
        address: 'Hoxton Fried Chicken, Vinohrady, Prague',
        status: 'open_for_applications',
        collaborationType: 'barter',
        compensation: {
          type: 'Barter',
          barterValue: 'Dinner for 2 (approx. 1200 CZK)',
          creatorFee: 0,
          plusOneBudget: 'Included',
        },
        shortDescription: 'Visit Hoxton Fried Chicken and create a Reel showcasing the new spicy menu.',
        fullDescription:
          'Hoxton Fried Chicken is launching a new spicy chicken menu and is looking for Prague-based food and lifestyle creators to visit the venue, enjoy a complimentary dinner for two, and produce authentic content capturing the atmosphere and new dishes.',
        criteria: {
          minFollowers: 5000,
          requiredCity: 'Prague',
          requiredCategory: 'Food',
          requiredPlatform: 'Instagram',
        },
        deliverables: [
          { id: uid('del'), type: 'Instagram Reel', quantity: 1, requiresApproval: true },
          { id: uid('del'), type: 'Instagram Stories', quantity: 3, requiresApproval: false },
        ],
        brief: {
          intro: 'Help us launch the new spicy chicken menu at Hoxton Fried Chicken.',
          brandInfo: 'Hoxton Fried Chicken is a modern fried chicken restaurant in Prague, known for its playful branding and bold flavors.',
          keyMessages: ['New spicy menu launch', 'Casual, fun dining experience', 'Great for groups and dates'],
          contentInstructions: 'Film candid moments of ordering and tasting. Show close-ups of the food. Keep the tone fun and authentic, not overly polished.',
          mandatoryTags: ['@hoxtonfriedchicken'],
          mandatoryHashtags: ['#HoxtonFriedChicken', '#PragueEats'],
          whatToAvoid: 'Do not compare to other fried chicken brands. Do not use filters that alter food color.',
          disclosureRequirements: 'Use #ad or #gifted per local advertising guidelines.',
          usageRights: 'InfluenceCrafter and Hoxton Fried Chicken may reshare approved content on brand channels for 6 months.',
          updatedAt: nowISO(),
        },
        applicationDeadline: addDays(7),
        campaignStart: addDays(3),
        campaignEnd: addDays(21),
        reportingDeadline: addDays(24),
        capacity: 6,
        visibility: 'public',
        createdAt: nowISO(),
      },
    ],
    applications: [],
    collaborations: [],
    tasks: [],
    contentSubmissions: [],
    publishedContent: [],
    statistics: [],
    messages: [],
    notifications: [],
    activityLog: [],
  };

  logActivity(db, { userId: adminId, entityType: 'campaign', entityId: campaignId, action: 'Campaign created', campaignId });
  return db;
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/* Auto-completes a collaboration once every task except the terminal
   "complete" task itself is done (spec §34 automation #13). */
function maybeCompleteCollaboration(db, collaborationId) {
  const tasks = db.tasks.filter((t) => t.collaborationId === collaborationId);
  const substantive = tasks.filter((t) => t.type !== 'complete');
  const allDone = substantive.every((t) => ['completed', 'approved', 'waived'].includes(t.status));
  if (!allDone) return false;

  const completeTask = tasks.find((t) => t.type === 'complete');
  if (completeTask && completeTask.status !== 'completed') {
    completeTask.status = 'completed';
    completeTask.completedDate = nowISO();
  }
  const collab = db.collaborations.find((c) => c.id === collaborationId);
  if (collab && collab.status !== 'completed') {
    collab.status = 'completed';
    const profile = db.creatorProfiles.find((p) => p.id === collab.creatorId);
    if (profile) {
      profile.internal.totalCompleted = (profile.internal.totalCompleted || 0) + 1;
      profile.internal.lastCampaignDate = nowISO();
    }
    logActivity(db, { userId: profile ? profile.userId : null, entityType: 'collaboration', entityId: collaborationId, action: 'Collaboration completed', campaignId: collab.campaignId });
    const creatorUser = profile ? db.users.find((u) => u.id === profile.userId) : null;
    if (creatorUser) {
      addNotification(db, { userId: creatorUser.id, type: 'campaign', title: 'Collaboration completed', message: 'Your collaboration has been marked completed. Thank you!', campaignId: collab.campaignId });
    }
  }
  return true;
}

function resetDB() {
  localStorage.removeItem(DB_KEY);
  return loadDB();
}
