/* Shared UI helpers: formatting, badges, nav, deadline logic. */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso) {
  const target = new Date(iso);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

/* Deadline urgency: color + label, per spec §7.2. Color is never the only signal. */
function deadlineUrgency(iso, completed) {
  if (completed) return { cls: 'due-done', label: 'Completed', icon: '✓' };
  const d = daysUntil(iso);
  if (d < 0) return { cls: 'due-overdue', label: `Overdue by ${Math.abs(d)}d`, icon: '⚠' };
  if (d === 0) return { cls: 'due-today', label: 'Due today', icon: '⏰' };
  if (d <= 3) return { cls: 'due-soon', label: `Due in ${d}d`, icon: '⏳' };
  if (d <= 7) return { cls: 'due-week', label: `Due in ${d}d`, icon: '📅' };
  return { cls: 'due-neutral', label: `Due in ${d}d`, icon: '📅' };
}

const STATUS_LABELS = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
  archived: 'Archived',
  active: 'Active',
  open_for_applications: 'Open',
  closing_soon: 'Closing Soon',
  full: 'Full',
  invite_only: 'Invite Only',
  closed: 'Closed',
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  not_started: 'Not Started',
  in_progress: 'In Progress',
  changes_requested: 'Changes Requested',
  completed: 'Completed',
  overdue: 'Overdue',
  invited: 'Invited',
  accepted: 'Accepted',
  cancelled: 'Cancelled',
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeClass(status) {
  const positive = ['approved', 'active', 'open_for_applications', 'completed', 'accepted', 'shortlisted'];
  const negative = ['rejected', 'suspended', 'archived', 'closed', 'expired', 'withdrawn', 'overdue', 'cancelled', 'changes_requested'];
  const warn = ['pending_approval', 'under_review', 'submitted', 'closing_soon', 'waitlisted', 'draft', 'full'];
  if (positive.includes(status)) return 'badge-positive';
  if (negative.includes(status)) return 'badge-negative';
  if (warn.includes(status)) return 'badge-warn';
  return 'badge-neutral';
}

function badge(status) {
  return `<span class="badge ${statusBadgeClass(status)}">${escapeHtml(statusLabel(status))}</span>`;
}

/* ---------------- Nav bar ---------------- */
function renderNav(activePage) {
  const db = loadDB();
  const user = currentUser(db);
  const container = document.getElementById('nav');
  if (!container || !user) return;

  const creatorLinks = [
    ['creator-dashboard.html', 'Dashboard'],
    ['opportunities.html', 'Opportunities'],
    ['profile.html', 'My Profile'],
  ];
  const adminLinks = [
    ['admin-dashboard.html', 'Dashboard'],
  ];
  const links = user.role === 'admin' ? adminLinks : creatorLinks;

  const unread = db.notifications.filter((n) => n.userId === user.id && !n.read).length;

  container.innerHTML = `
    <div class="nav-inner">
      <div class="nav-brand">InfluenceCrafter <span>Creator Hub</span></div>
      <div class="nav-links">
        ${links
          .map(
            ([href, label]) =>
              `<a href="${href}" class="${activePage === href ? 'active' : ''}">${label}${
                label === 'Dashboard' && unread ? ` <span class="nav-dot">${unread}</span>` : ''
              }</a>`
          )
          .join('')}
      </div>
      <div class="nav-user">
        <span>${escapeHtml(user.firstName)}</span>
        <button class="btn btn-ghost btn-sm" onclick="logout()">Log out</button>
      </div>
    </div>`;
}

/* ---------------- Eligibility check §8 ---------------- */
function checkEligibility(campaign, profile) {
  const reasons = [];
  const c = campaign.criteria || {};
  const igFollowers = (profile.social && profile.social.instagram && profile.social.instagram.followers) || 0;
  if (c.minFollowers && igFollowers < c.minFollowers) {
    reasons.push(`Minimum ${c.minFollowers.toLocaleString()} Instagram followers required`);
  }
  if (c.requiredCity && profile.city && c.requiredCity !== profile.city) {
    reasons.push(`Creator must be based in ${c.requiredCity}`);
  }
  if (c.requiredCategory && profile.categories && !profile.categories.includes(c.requiredCategory)) {
    reasons.push(`Creator must have the "${c.requiredCategory}" category`);
  }
  if (reasons.length === 0) return { eligible: true, label: 'You match this collaboration', reasons };
  return { eligible: false, label: 'Your profile does not currently match one or more requirements', reasons };
}

/* ---------------- Collaboration progress ---------------- */
function collaborationProgress(db, collaborationId) {
  const tasks = db.tasks.filter((t) => t.collaborationId === collaborationId);
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === 'completed' || t.status === 'approved').length;
  return Math.round((done / tasks.length) * 100);
}

function nextActionableTask(db, collaborationId) {
  const tasks = db.tasks
    .filter((t) => t.collaborationId === collaborationId)
    .filter((t) => !['completed', 'approved', 'waived'].includes(t.status));
  return tasks[0] || null;
}

function profileCompleteness(profile) {
  const fields = [
    profile.city,
    profile.country,
    profile.instagramUsername,
    profile.categories && profile.categories.length,
    profile.social && profile.social.instagram && profile.social.instagram.followers,
    profile.social && profile.social.instagram && profile.social.instagram.avgStoryViews,
    profile.tiktokUsername,
    profile.languages && profile.languages.length,
    profile.profilePhoto,
  ];
  const missing = [];
  if (!profile.tiktokUsername) missing.push('TikTok profile');
  if (!(profile.social && profile.social.instagram && profile.social.instagram.avgStoryViews)) missing.push('Average story views');
  if (!profile.profilePhoto) missing.push('Profile photo');
  const filled = fields.filter(Boolean).length;
  const pct = Math.round((filled / fields.length) * 100);
  return { pct, missing };
}

function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast show';
  setTimeout(() => {
    el.className = 'toast';
  }, 2600);
}
