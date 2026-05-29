# Threads 2+3 Implementation Plan: Task Entity

Companion to `docs/diagnostics/structural-threads-diagnostic.md`. Implements the unified `prospect_tasks` model that solves both Thread 2 (assignment + filtering) and Thread 3 (forward-looking task on company records).

The 8 QPA presumptions in the user prompt are locked. This plan is execution detail only.

## Phase 1 — Schema + API

### 1.1 New table `prospect_tasks`

```sql
CREATE TABLE prospect_tasks (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER NOT NULL REFERENCES prospect_companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  due_date DATE,
  assignee TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completed_by TEXT
);

CREATE INDEX idx_prospect_tasks_assignee_status ON prospect_tasks(assignee, status);
CREATE INDEX idx_prospect_tasks_prospect_status ON prospect_tasks(prospect_id, status);
CREATE INDEX idx_prospect_tasks_due_date ON prospect_tasks(due_date);
```

Migration file: `scripts/create-prospect-tasks-table.sql`. Idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Kyle runs in Neon SQL console once.

### 1.2 API: all routes on `api/prospects.js` under `?action=tasks`

The existing convention groups by HTTP method first, then action. I follow that — adds an `if (action === 'tasks')` branch in each of the GET / POST / PATCH / DELETE blocks.

**GET `/api/prospects?action=tasks`** — list / count

Query params:
- `assignee` — `'me'` | `'unassigned'` | `'all'` | a specific name string. Default `'all'`.
- `current_user` — required when `assignee='me'`. Client passes `user.name`.
- `status` — `'open'` | `'done'` | `'dismissed'` | `'all'`. Default `'open'`.
- `prospect_id` — restrict to one prospect (used by ProspectDetail Tasks section).
- `format` — `'full'` (default) returns array of task rows; `'count'` returns `{ count: N }` for the badge.

Sort: `due_date ASC NULLS LAST, created_at ASC`.

Badge default semantics (matches user spec point 4):
- `format=count`, `assignee=me`, `current_user=<user.name>`, `status=open`
- The SQL adds `(assignee = current_user OR assignee IS NULL)` to combine assigned-to-me + unassigned in one count.

Response (full): `[{ id, prospect_id, company_name, description, due_date, assignee, status, created_by, created_at, completed_at, completed_by }]` — joins `prospect_companies` for `company_name`.

Response (count): `{ count: 5 }`.

**POST `/api/prospects?action=tasks`** — create

Body: `{ prospect_id, description, due_date?, assignee?, created_by }`.

Required: `prospect_id`, `description`, `created_by`.

Side effect: inserts a `prospect_activity_log` entry: `"Task created: <description>"` with `created_by` matching the body's `created_by`. **Does NOT update `suggested_next_step`** (that auto-overwrite is reserved for the existing `add-activity` flow — task lifecycle entries should not clobber the manual next-step note).

Returns: the created task row (201).

**PATCH `/api/prospects?action=tasks&task_id=X`** — update

Body: any subset of `{ description, due_date, assignee, status, updated_by }`.

Required: `updated_by` (for activity log attribution).

Special status handling:
- `status: 'done'` → auto-fill `completed_at = NOW()`, `completed_by = updated_by`. Log: `"✓ Task completed: <description>"`.
- `status: 'dismissed'` → auto-fill `completed_at = NOW()`, `completed_by = updated_by`. Log: `"✗ Task dismissed: <description>"`.
- `status: 'open'` from done/dismissed → clear `completed_at = NULL`, `completed_by = NULL`. Log: `"↺ Task reopened: <description>"`.
- Other field changes without a status transition do NOT generate an activity log entry (avoid log spam on each due_date tweak).

Returns: updated task row (200).

**DELETE `/api/prospects?action=tasks&task_id=X`** — hard delete

Body: `{ deleted_by }` (or accept as query param).

Side effect: log entry `"⌫ Task deleted: <description>"`.

Returns: `{ deleted: true, id: X }` (200).

### 1.3 Verification before moving on
- Use `curl` (against a deployed env if available) OR just call from the new UI components: create a task, query it, mark done, dismiss, delete, verify activity log entries via the existing `get-activity-log` route.
- Note: no local dev environment per CLAUDE.md — verification happens after Kyle deploys.

## Phase 2 — UI Components

### 2.1 New components

| File | Purpose |
|------|---------|
| `src/components/prospects/tasks/TaskRow.jsx` | Single task row (used in both ProspectDetail and TasksView). Shows description, due_date with urgency styling, assignee badge, status badge, action buttons (mark done, dismiss, edit, delete). |
| `src/components/prospects/tasks/TaskInlineEditor.jsx` | Add/edit form. Uses `EditableField` pattern. Editable: description (textarea), due_date (date picker with quick-set buttons like the current follow_up_date UI), assignee (dropdown of known users + "Unassigned"). |
| `src/components/prospects/tasks/TasksSection.jsx` | Per-prospect section embedded in ProspectDetail. "Add Task" button, list of open tasks (most urgent first), collapsed completed/dismissed list. |
| `src/components/prospects/tasks/TasksView.jsx` | Cross-prospect filtered list view. Filter chips (Assigned to me / Unassigned / All / by assignee), status chips (Open / Completed / Dismissed). Default mount: "Assigned to me + Unassigned", "Open". |
| `src/components/prospects/tasks/taskUtils.js` | Shared helpers: `getTaskUrgency(task)` (mirrors `getProspectUrgency` but reads `task.due_date` and `task.status`), `formatTaskUrgency(level)` for color classes. |

### 2.2 Modified components

**`api/prospects.js`** — task action handlers under each method block (~300 lines added).

**`src/components/prospects/ProspectDetail.jsx`**:
- Add `TasksSection` placement: directly above the Activity Log section (Engagement Planning area).
- Hide the existing `follow_up_date` block (lines 638-683). Leave a one-line comment `{/* follow_up_date deprecated in UI — see prospect_tasks. Column remains in schema. */}` and remove the JSX. Or wrap with `{false && ...}` if Kyle wants quick revert — I'll remove cleanly with a comment.
- Pass `currentUserName` (from `useAuth`) through to TasksSection.

**`src/components/prospects/ProspectTable.jsx`**:
- Replace the "Due" column (lines 906-919) with a new "Tasks" column. Shows `<count> open` with a small urgency dot for earliest due_date, or `—` if zero open tasks.
- Sort: by earliest open task due_date ASC, NULLS LAST.
- Tasks data: fetch per-prospect open-task counts in a separate small query when the prospect list loads. Add a `taskCounts` state on ProspectTable. Fetch via `GET /api/prospects?action=tasks&status=open` once on mount + after any task mutation, then build a `{prospect_id: {count, earliestDueDate}}` map.
- The badge count (currently `actionItemCount`) re-routes: server-side count via `?action=tasks&format=count&assignee=me&current_user=...&status=open`. Client-side `actionItemCount` keeps the existing name but its value now equals the server count for "assigned to me + unassigned, open."
- Sub-view toggle: existing pattern has Table / Charts. ADD a third option "Tasks" which renders TasksView. The badge click switches to this sub-view with the default filter set.
- Click handler on a row in TasksView: closes TasksView sub-view AND opens prospect detail modal for that prospect_id, scrolled to Tasks section.

**`src/components/prospects/ProspectFilters.jsx`**:
- The `action_items` preset button (line 14) becomes either:
  - Hidden (we're moving tasks out of the prospect-filter paradigm), OR
  - Re-labeled "My Tasks" and re-wired to switch to Tasks sub-view (clearer connection).
- The action item badge (lines 211-219) likewise re-wires to switch to Tasks sub-view.
- The "Stale" preset (line 15) stays unchanged — staleness is now decoupled from tasks per spec.

### 2.3 SYNC pattern

Two functions get SYNC comments:

1. **Badge query rule** — `assignee = currentUser OR assignee IS NULL` AND `status = 'open'`. SQL in `api/prospects.js` GET handler; mirrored as a JS predicate `isMyTaskInBadge(task, currentUser)` in `taskUtils.js` for any client-side filtering. Mark both with `// SYNC: badge logic — keep aligned`.

2. **Task urgency** — `getTaskUrgency(task)` in `taskUtils.js` reads `task.due_date` + `task.status` and returns the same urgency levels as `getProspectUrgency` (overdue/due_today/due_soon/due_week/scheduled). No server mirror is needed because the badge logic is the only thing the server computes; urgency is purely UI-side. Note: a task's `status` is the gate (only `status='open'` tasks contribute urgency); `status='done'`/`'dismissed'` always return null.

## Phase 3 — Presets + Filters

The "Action Items" preset is replaced. The "Stale" preset is preserved.

In `ProspectFilters.jsx`:
- Rename the "Action Items" preset to "My Tasks". Its click handler switches the sub-view to Tasks (not just applying a filter on prospects).
- Keep "Stale" — it's a prospect-level signal (auto-detected staleness via `getProspectUrgency` Tier 2), independent of tasks.

In `ProspectTable.jsx`:
- Remove the `filters.preset === 'action_items'` branch (lines 568-571). The replacement Tasks sub-view is the new home for that workflow.
- Keep the `filters.preset === 'stale'` branch (lines 572-575). Unchanged.

## Phase 4 — Migration Script

File: `scripts/migrate-followup-to-tasks.js`.

Behavior:
- Default: dry-run. Connects to DB (via `DATABASE_URL`), runs `SELECT id, company, follow_up_date, suggested_next_step FROM prospect_companies WHERE follow_up_date IS NOT NULL`, prints the proposed task rows it would create.
- `--apply` flag: actually inserts.
- For each row, the proposed task:
  - `prospect_id = id`
  - `description = suggested_next_step` if non-empty AND looks forward-looking (heuristic: starts with a verb-ish word — "Follow", "Contact", "Reach", "Schedule", "Send", "Call", "Email"; OR contains "next step"); else `"Follow up with " + company`.
  - `due_date = follow_up_date`
  - `assignee = NULL` (let user reassign)
  - `created_by = 'Migration (follow_up_date)'`
  - `status = 'open'`
- After apply, prints the new task IDs and any failures.

Documentation in script header:
```
# Usage:
#   node scripts/migrate-followup-to-tasks.js              # dry-run (prints proposed tasks)
#   node scripts/migrate-followup-to-tasks.js --apply      # actually inserts
```

## Phase 5 — Wrap-up

1. Update `CLAUDE.md` — add a "Prospect Tasks" subsection under Database Schema with the new table schema and a one-paragraph summary of the lifecycle + assignment + badge model.
2. Finalize `implementation-notes.html` (Design Decisions / Deviations / Tradeoffs / Open Questions).
3. Append to `tasks/lessons.md` (only if a non-obvious pattern emerged).

## Test Plan

Manual verification (per user spec Guardrails section):

1. **Task lifecycle.** Create a task on a prospect. Assign to Brett. Verify it appears in TasksView under "Assigned to Brett" and "Open". Mark done. Verify it moves to "Completed". Dismiss it. Verify it's in "Dismissed". Reopen. Verify it comes back to "Open".
2. **Badge logic.** As Kyle, create one unassigned task and one task assigned to Brett. Verify Kyle's badge shows 1 (the unassigned only; Brett's task is hidden). As Brett, verify badge shows 1 (his own assigned task; Kyle's unassigned overlap depends on whether unassigned counts for Brett too — per spec it does: `assignee = me OR assignee IS NULL`, so Brett sees both → badge = 2).
3. **Filter chips.** Verify each chip in TasksView: "Assigned to me" filters to current user, "Unassigned" filters to NULL assignee, "All" shows everything, assignee dropdown filters to specific person. Verify status chips (Open / Completed / Dismissed) work and combine with assignee chips.
4. **Tasks column sort.** In ProspectTable, click the Tasks column header. Verify prospects with open tasks bubble up, then sort by earliest due_date. Verify prospects with zero open tasks sink to the bottom (nulls last).
5. **Activity log integration.** Create a task → check activity log entry "Task created: ...". Mark done → "✓ Task completed: ...". Dismiss → "✗ Task dismissed: ...". Reopen → "↺ Task reopened: ...". Delete → "⌫ Task deleted: ...".
6. **No auto-dismiss on activity logging.** Create a task. Then log a separate activity entry. Verify the task's status is still 'open' (not auto-dismissed).
7. **`suggested_next_step` preservation.** Create a task with description "Call Brett". Log a separate activity "Met with David Moyak today". Verify `suggested_next_step` reads "Met with David Moyak today" (the activity log wins, as it does today). Verify the task description is still "Call Brett" (unchanged).
8. **Vercel function count.** After all changes, verify `ls api/` still shows ≤ 12 functions. No new .js files.

Document the test results in `implementation-notes.html`.

## File-by-file change manifest

**New:**
- `scripts/create-prospect-tasks-table.sql`
- `scripts/migrate-followup-to-tasks.js`
- `src/components/prospects/tasks/TaskRow.jsx`
- `src/components/prospects/tasks/TaskInlineEditor.jsx`
- `src/components/prospects/tasks/TasksSection.jsx`
- `src/components/prospects/tasks/TasksView.jsx`
- `src/components/prospects/tasks/taskUtils.js`
- `tasks/threads-2-3-plan.md` (this file)
- `implementation-notes.html` (running notes)

**Modified:**
- `api/prospects.js` — add task action handlers (GET/POST/PATCH/DELETE branches)
- `src/components/prospects/ProspectDetail.jsx` — add TasksSection, hide follow_up_date block
- `src/components/prospects/ProspectTable.jsx` — replace Due column with Tasks column, sub-view toggle gains Tasks, badge re-wires, fetch task counts
- `src/components/prospects/ProspectFilters.jsx` — rename "Action Items" preset to "My Tasks", re-wire badge click
- `CLAUDE.md` — Database Schema + Prospect Tasks subsection
