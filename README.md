# InfluenceCrafter Creator Hub — Phase 1 Prototype

A clickable, functional prototype of the InfluenceCrafter Creator Platform, built per the technical spec §38/§44 ("first version to build today"). It implements the full creator-collaboration workflow — opportunity discovery, application, approval, brief, task checklist, content submission, publication, statistics, and completion — as a static HTML/CSS/vanilla-JS app.

## Why static HTML/JS instead of Next.js/Supabase (spec Option B)

This machine had no Node.js, npm, or Homebrew installed. Rather than install a system toolchain without asking, this prototype was built to run with **zero installs**, using the browser's `localStorage` as a mock database. It mirrors the spec's data model and workflow logic closely enough that migrating to the real stack (Next.js + Supabase + Postgres, per spec §38 "MVP Development Phases") is a matter of swapping the persistence layer (`js/db.js`) for real API calls — the page logic, task template, and status flows stay the same.

## Running it locally

No installation needed — just Python 3 (preinstalled on macOS):

```bash
cd "IC platform"
python3 -m http.server 8935
```

Then open `http://localhost:8935` in a browser. It will redirect to the login page.

(A `.claude/launch.json` is also included so this can be launched via Claude's preview tooling.)

## Demo accounts

Seeded automatically on first load:

| Role    | Email                       | Password    |
|---------|------------------------------|-------------|
| Admin   | admin@influencecrafter.cz    | admin123    |
| Creator | anna@example.com             | creator123  |

A seeded test campaign ("Hoxton Fried Chicken Creator Campaign") and one open application-ready opportunity are included, matching spec §44.

To reset all data back to the seed state, open the browser console and run `resetDB()`, then reload.

## What's implemented

- **Auth & roles**: login, creator self-registration (with admin approval gate), session handling, role-based route guards (`js/auth.js`).
- **Creator dashboard**: upcoming deadlines, active collaborations with progress bars, open opportunities, notifications, profile completeness.
- **Opportunities marketplace**: filterable by city/category/collaboration type, eligibility checking against a creator's profile, full campaign detail modal, application form.
- **Collaboration workspace**: tabs for Overview / Brief / Tasks / Messages / Activity; invite accept/decline; a 9-step task checklist (accept → read brief → confirm brief → visit date → venue visit → draft upload → publish + link → statistics → complete) with deadline urgency indicators (color + icon + text, never color-only) and inline submission forms.
- **Creator profile**: editable bio, social stats, category chips, collaboration preferences.
- **Admin dashboard**: Overview (stat tiles + attention feed), Applications, Creators (approve/reject/suspend/invite-to-campaign), Campaigns (list + simplified create-campaign form), Review Queue (generalized approve / request-changes for visit dates, draft content, and statistics), Reports (per-campaign aggregate stats + CSV export), Activity Log.
- **Notifications & activity log**: in-app only, generated automatically at each workflow step (application submitted, approved, content uploaded, task completed, collaboration completed, etc).
- **Automations**: task-template generation on collaboration creation, deadline derivation from campaign dates, auto-completion of a collaboration once every task is done (updates the creator's internal reliability stats).

Verified end-to-end via live testing: registration → admin approval, direct campaign invitation → accept, application → admin approval → collaboration creation, and the full task checklist through to auto-completion, admin review/approval at each gated step, and report generation with CSV export.

## What's simplified vs. the full spec

- **Campaign creation** is a single form, not the full 8-step wizard described in spec §24.
- **File uploads** are simulated — file name/size are recorded, but no binary is actually stored (there's no backend). Swapping in Supabase Storage or S3 is the natural next step.
- **Email notifications** are not sent — only in-app notifications, per the "Phase 1" note in spec §38.
- **Team member / Campaign Manager role and future Brand Account role** (spec §5) are not built — only Creator and Admin.
- **Messaging tab** exists as a UI shell but isn't wired to a real thread/send flow yet.
- **Task ordering** is enforced by required-field validation on each form, not by hard-blocking access to later tasks.
- **Multi-campaign capacity limits / waitlisting** (spec §25) are not implemented.

## Suggested next steps

1. Validate the workflow with a few real creators/admins using this prototype.
2. Once validated, migrate `js/db.js`'s functions to real API routes backed by Postgres (Supabase), keeping the same function signatures so the page-level JS barely changes.
3. Add real file storage, transactional email (e.g. Resend/Postmark) for the notification triggers already logged in-app, and the full campaign creation wizard.
4. Add the Team Member role and campaign-manager-scoped permissions.
