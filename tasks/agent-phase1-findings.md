# Phase 1 Recon — In-Dashboard Read-Only AI Reasoning Assistant

**Date:** 2026-06-24
**Branch:** `claude/loving-allen-ubj6j4`
**Mode:** Read-only reconnaissance. No code changed, nothing migrated/installed/committed. This file is the only artifact created.
**Paths** are repo-relative to `/home/user/PSB-Aquila-Dashboard`. (Dev/target env is Windows/PowerShell; this recon clone is Linux — path separators in the doc are POSIX for readability.)

## Executive summary

The future assistant fits the existing architecture cleanly:

- **Where it lives:** a new `?action=` branch inside **`api/prospects.js`** (already the home of every prospect + ontology endpoint). No new serverless file → the Vercel function count stays at **10 / 12** (2 slots of headroom regardless).
- **How it calls Anthropic:** there is **no Anthropic SDK and no `ANTHROPIC_API_KEY`** anywhere yet. House style is **plain `fetch()`** to external APIs (exactly how Resend is called server-side). The agentic loop should `fetch('https://api.anthropic.com/v1/messages', …)` with a new `ANTHROPIC_API_KEY` env var, awaiting all work before `res.json()`.
- **What the tools wrap:** real, auth-gated GET endpoints already exist for prospect list/search, single-prospect full context, `ontology-query` / `ontology-similar` / `ontology-neighborhood`, and research-brief retrieval (`?action=attachments`). Response shapes are documented below.
- **Where the UI mounts:** `src/components/prospects/ProspectDetail.jsx` — a two-column modal at `z-40` with a header action-cluster (ideal launch button) and a stack of `z-[60]` sub-modals (the panel pattern to copy). **No existing chat/streaming UI** to reuse — it's a greenfield panel.
- **Read-only is feasible at the data layer**, but note: reads are **not centralized** — each `?action=` branch issues its own inline SQL. A read-only tool layer enforces "no writes" by *only wrapping the existing GET endpoints*, not by a single gate.

---

## 1. API and serverless functions

**Prospect + ontology endpoints live in one file:** `api/prospects.js` (**4,114 lines**). No separate `ontology.js`; all 8 ontology actions are branches here.

**`?action=` dispatch is an if-chain, keyed by HTTP method then action.** Entry point:

```javascript
// api/prospects.js:854–856
export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)
  const { action, id } = req.query
```

Method-level structure and the final fall-through:

| Method | Block opens | First action arm |
|--------|-------------|------------------|
| `GET`    | line 867  | `if (action === 'daily-digest')` (870) |
| `DELETE` | line 3046 | `if (action === 'delete-attachment')` (3047) |
| `POST`   | line 3114 | `if (action === 'rebuild-ontology-layer1')` (3116) |
| `PATCH`  | line 3879 | `if (id && req.body)` |
| — | line 4113 | `return res.status(405).json({ error: 'Method not allowed' })` |

Every arm is the same shape:

```javascript
if (action === '<name>') {
  try {
    // ...all SQL awaited here...
    return res.status(200).json({ /* response */ })
  } catch (error) {
    console.error('Error:', error)
    return res.status(500).json({ error: error.message })
  }
}
```

**Exact insertion point for the assistant.** Because the agentic loop POSTs a conversation body, add it as a **POST arm inside the POST block (after line 3114, before the final 405 at 4113)** — same level as `rebuild-ontology-layer1`. (Note: the H1 investigator's GET-block line refs around 2388–2390 were internally inconsistent and are superseded by this structural placement.) Existing ontology GET arms to mirror for read tools: `ontology-stats` (1250), `ontology-state-summary` (1292), `ontology-density-by-state` (1382), `ontology-existing-entities` (1465), `ontology-graph` (1486), `ontology-neighborhood` (1588), `ontology-query` (1784), `ontology-similar` (1887).

**Serverless function count (against Vercel's 12):**

| # | File |
|---|------|
| 1 | `api/activities.js` |
| 2 | `api/analytics.js` |
| 3 | `api/auth.js` |
| 4 | `api/health.js` |
| 5 | `api/key-dates.js` |
| 6 | `api/meeting-minutes.js` |
| 7 | `api/opportunities.js` |
| 8 | `api/opportunities/[id].js` (dynamic route — counts) |
| 9 | `api/prospects.js` |
| 10 | `api/stage-transitions.js` |

**Total: 10. Headroom: 2.** The one cron in `vercel.json` (`/api/prospects?action=daily-digest`, `0 12 * * 1-5`) re-invokes an existing handler and does **not** consume a function slot.

**House convention is confirmed:** new capability = new `?action=` branch in the owning handler, **never a new `.js` file**. `prospects.js` at 4,114 lines is large but coherent (20+ GET / 9 POST / 2 DELETE / 2 PATCH arms, one shared `sql` client, one auth gate). Adding one more POST arm is the idiomatic move; no refactor required. (If one wanted to avoid growing this file, `api/meeting-minutes.js` is the only other handler that already does AI-shaped work — but that would diverge from the "endpoints the tools wrap all live in prospects.js" co-location and is **not** the house pattern.)

**SQL client setup** — `@neondatabase/serverless` is the only DB driver:

```javascript
// api/prospects.js:855  — request-scoped, created once per invocation
const sql = neon(process.env.DATABASE_URL)
```

`sql` is a template-tag function. Convention (verified throughout): **all DB work is awaited before any `res.status().json()`** — no async-after-response, no fire-and-forget. Parallel reads use `Promise.all([...])` then await. This matters for the agentic loop: the multi-turn tool calls + final Anthropic call must all resolve before the handler returns (Vercel freezes the execution context after `res.end()`).

**Anthropic surface today: none.**
- `ANTHROPIC_API_KEY` / `ANTHROPIC_*` — **zero matches** anywhere (code, `vercel.json`, `.env.example`, docs, scripts).
- No `@anthropic-ai/*` in `package.json`.
- External HTTP is **plain `fetch`**. Resend (server-side) is the template to copy:

```javascript
// api/prospects.js:1062–1074
const sendRes = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ from: '…', to: user.email, subject, html: emailHtml }),
})
if (sendRes.ok) { /* success */ } else { const err = await sendRes.text() /* handle */ }
```

(openFDA is fetched the same way client-side in `FdaEnrichment.jsx:7–19`, with an `AbortController` timeout — a good pattern for the Anthropic call's timeout handling.)

**→ Implementation steer:** plain `fetch` to `https://api.anthropic.com/v1/messages` with headers `x-api-key: ${process.env.ANTHROPIC_API_KEY}` + `anthropic-version`, new env var `ANTHROPIC_API_KEY` added in Vercel. No SDK.

---

## 2. Endpoints the assistant's tools will wrap

All four below already enforce auth via `requireAuth(req, res)` at **`api/prospects.js:862`**, so a server-side tool layer that calls these (or replicates their SQL) inherits the same gate; a server-side agentic loop will itself need a valid session token.

### a. Prospect search / list — `GET /api/prospects`
- **Inputs (all optional query params, comma-separated, AND across types / OR within):** `category`, `priority`, `geography_tier`, `corridor`, `outreach_group`, `medical_device_mfg`, `prospect_status`. No pagination — returns all matching rows.
- **Response:** array of full `prospect_companies` rows (`SELECT p.*`) plus computed `conversion_count`. Canonical SELECT at `api/prospects.js:3003–3024` (filtered) / `3021–3035` (unfiltered fallback). Field set = the column list in §3.
- **Table:** `prospect_companies`.

> Note: "search" here is **structured filtering**, not free-text. There is text search, but it's **client-side** in `ProspectTable.jsx` (covers `company`, `also_known_as`, `city`, `state`, `category`, `parent_company`, `notes`, `suggested_next_step`). A server-side name/keyword search tool would either add a small `?search=` param to this list branch or filter in the tool layer after fetching.

### b. Single prospect full context — `GET /api/prospects?id=X`
- **Input:** `id` (integer, required).
- **Response:** one `prospect_companies` row (`p.*`) + computed `conversion_count`:

```sql
-- api/prospects.js:2900–2901
(SELECT COUNT(*)::int FROM opportunities o WHERE o.source_prospect_id = p.id) as conversion_count
```

- For the richest single-company payload there is also **`GET ?action=export-json&id=X`** (`api/prospects.js:2450+`): the live row **plus** 1-hop corporate links and each record's contacts/attachments/activity-log/tasks, assembled server-side. This is the closest thing to a ready-made "full context" tool and worth wrapping directly.

### c. Ontology — query / similar / neighborhood (action names confirmed)

**`GET ?action=ontology-query`** — companies matching ontology criteria.
- Inputs (≥1 required): `certifications`, `technologies`, `markets`, `ownership`, `equipment`, `quality_methods` (each comma-separated entity names), `state` (or `'INTL'`).
- Response (`api/prospects.js:1873–1879`):
```js
{ results: [ { id, company, state, city, matchScore, matchCount, totalCriteria, matchedEdges: string[], hookLine } ],
  meta: { totalMatches, criteria: { 'Certification': [...], 'Technology / Software': [...], ... } } }
```

**`GET ?action=ontology-similar`** — companies sharing the most ontology edges with a target.
- Inputs: `prospect_id` (required), `limit` (default 10, capped 50).
- Response (`api/prospects.js:1949–1963`):
```js
{ target: { id, company },
  similar: [ { id, company, state, city, sharedEdges, sharedEntities: string[], totalEdgesTarget, similarity } ] }
```

**`GET ?action=ontology-neighborhood`** — 1–2 hop neighborhood around an **ontology entity** (not a prospect id).
- Inputs: `entity_id` (required, `ontology_entities.id`), `depth` (default 1, cap 2), `state` (optional; filters Company nodes).
- Response (`api/prospects.js:1765–1776`):
```js
{ nodes: [ { id, label, type, isSuper, prospectId } ],
  links: [ { source, target, relType } ],
  meta: { rootEntityId, rootLabel, rootType, depth, nodeCount, linkCount, stateFilter } }
```
> Gotcha: `ontology-neighborhood` keys off `entity_id` (an `ontology_entities` row), **not** a prospect id. To go from a prospect → its neighborhood you resolve the entity id first (the UI's `NeighborhoodPanel` does this via `ontology-similar` → `ontology-graph` probing). A prospect-centric tool should prefer `ontology-similar` (takes `prospect_id` directly).

### d. Research briefs — `GET /api/prospects?action=attachments&id=X`
- **Input:** `id` (prospect id, required).
- **Response:** array of attachment rows; brief text is the `content` field:
```js
[ { id, prospect_id, attachment_type, title, content, created_by, created_at, updated_at } ]
```
- **Storage confirmed:** `prospect_attachments` table; research briefs carry `attachment_type = 'research_brief'` (other types: `note`, `fda_snapshot`). Schema is **inferred from the INSERT** at `api/prospects.js:3419–3421` (no `CREATE TABLE` for it in `scripts/`; it's assumed to pre-exist). The brief-retrieval tool filters this array to `attachment_type === 'research_brief'`.

---

## 3. Prospect data model

**Table: `prospect_companies`** (`scripts/create-prospect-table.sql:4–71`).

**Base columns (CREATE TABLE):**

| Column | Type | | Column | Type |
|--------|------|---|--------|------|
| `id` | SERIAL PK | | `signal_count` | INTEGER |
| `company` | TEXT NOT NULL | | `top_signal` | TEXT |
| `also_known_as` | TEXT | | `rjg_cavity_pressure` | TEXT |
| `website` | TEXT | | `medical_device_mfg` | TEXT |
| `category` | TEXT | | `key_certifications` | TEXT |
| `in_house_tooling` | TEXT | | `ownership_type` | TEXT |
| `city` | TEXT | | `recent_ma` | TEXT |
| `state` | TEXT | | `parent_company` | TEXT |
| `geography_tier` | TEXT (deprecated) | | `decision_location` | TEXT |
| `source_report` | TEXT | | `cwp_contacts` | INTEGER |
| `priority` | TEXT | | `psb_connection_notes` | TEXT |
| `employees_approx` | INTEGER | | `engagement_type` | TEXT |
| `year_founded` | INTEGER | | `suggested_next_step` | TEXT |
| `years_in_business` | INTEGER | | `legacy_data_potential` | TEXT |
| `revenue_known` | TEXT | | `notes` | TEXT |
| `revenue_est_m` | NUMERIC | | `outreach_group` | TEXT DEFAULT 'Unassigned' |
| `press_count` | INTEGER | | `outreach_rank` | INTEGER |
| | | | `group_notes` | TEXT |
| | | | `last_edited_by` | TEXT |
| | | | `prospect_status` | TEXT DEFAULT 'Identified' |
| | | | `created_at` | TIMESTAMPTZ DEFAULT NOW() |
| | | | `updated_at` | TIMESTAMPTZ DEFAULT NOW() |

**Columns added beyond the base CREATE** (some self-ensured, some assumed-present — flagged because the inventory matters for a lane filter):
- Self-ensured via `ensureProspectSchemaAdditions()` (`api/prospects.js:~735`): `ma_date DATE`.
- In the PATCH `allowedFields` array (`api/prospects.js:3996–4010`) and used in code, so present in the live DB even though not all are in a tracked `CREATE`/`ALTER` (verify against live schema before relying on any one): `country TEXT`, `priority_score INTEGER`, `ai_readiness TEXT`, `priority_manual TEXT`, `follow_up_date DATE`, `site_count INTEGER`, `acquisition_count INTEGER`, `needs_review BOOLEAN`, `review_note TEXT`, `review_flagged_by TEXT`, `review_flagged_at TIMESTAMPTZ`, `parent_relationship_kind TEXT`, `financial_sponsor TEXT`, `former_names TEXT[]`, `added_by TEXT`.

**Institutional / CWP / internal vs. public-source split** (inventory only — for a future "lane" filter; *not used now*):

| Institutional / CWP / internal | Public / web / research-derived |
|---|---|
| `cwp_contacts`, `psb_connection_notes` | `employees_approx`, `revenue_known`, `revenue_est_m` |
| `outreach_group`, `outreach_rank`, `group_notes` | `press_count`, `site_count`, `acquisition_count` |
| `last_edited_by`, `added_by` | `signal_count`, `top_signal` |
| `prospect_status`, `follow_up_date` | `year_founded`, `years_in_business` |
| `parent_company`, `parent_relationship_kind`, `financial_sponsor`, `former_names`, `decision_location` | `key_certifications`, `rjg_cavity_pressure`, `medical_device_mfg`, `in_house_tooling` |
| `needs_review`, `review_note`, `review_flagged_by`, `review_flagged_at` | `website`, `also_known_as`, `city`, `state`, `country`, `category`, `geography_tier` |
| `ma_date`, `priority_manual` | `source_report`, `ownership_type`, `recent_ma` |
| `priority_score`, `ai_readiness` (computed from a mix) | `engagement_type`, `suggested_next_step`, `legacy_data_potential`, `notes` |

> Judgment calls worth flagging for the lane filter: `notes`/`suggested_next_step`/`recent_ma`/`ownership_type` are "public-derived" in origin but are **edited by the team**, so they carry internal commentary in practice. `priority_score`/`ai_readiness` are computed from both lanes. Treat the split as a starting taxonomy, not a hard contract.

**Data access is NOT centralized.** Every `?action=` branch issues its own inline SQL. The two canonical reads a tool layer would route through (or replicate):
- **Single prospect:** `api/prospects.js:2897–2913` (`SELECT p.*, …conversion_count… WHERE p.id = ${id}`).
- **List:** `api/prospects.js:2915–3043` (dynamic WHERE + `SELECT p.*`, ordered by `outreach_group, outreach_rank, signal_count`).
- Other row-touching reads: `export-json` (2450+), `analytics` (2625+), `state-stats` (1104+), `data-audit` (1971+), `tasks` (2840+, JOINs `prospect_companies` for `company_name`).

There is **no shared `getProspectById()` helper**. For a clean read-only gate, the implementation can either (a) have each tool call the existing HTTP endpoints, or (b) add one small shared read helper and have the assistant's tools use only it — but do **not** assume one already exists.

---

## 4. UI

**`src/components/prospects/ProspectDetail.jsx`** — near-full-screen modal, two-column grid.

- **Container/grid:** `<div className="flex-1 overflow-y-auto">` (line 546) → `<div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-x divide-gray-100">` (line 547).
- **Left column (actions, 549–791):** Tasks, Engagement Planning (outreach group/status/rank, activity log, flag-for-review, group notes), Research Brief, Ontology Neighborhood (`NeighborhoodPanel`, 787–790).
- **Right column (reference, 793–1157):** Company Info, Company Metrics, Signals & Readiness, FDA Intelligence, Contacts, PSB Relationship.
- **Header action-cluster (485–523):** the Export button (`FileJson` icon, `showExportModal`) sits here next to prev/next nav + close. Label uses `hidden sm:inline`.

**Cleanest mount points:**
- **(a) Launch affordance** → add an "Ask AI" button to the header action-cluster (~line 485), next to Export, following the exact Export button markup (icon + `hidden sm:inline` label).
- **(b) Panel** → cleanest as a new `z-[60]` sub-modal in the same family as `ExportJsonModal`/`ResearchPromptModal` (so it stacks correctly and the existing Escape guard handles it). Alternatively, an in-column section — but the panel "queries the whole DB," so a full sub-modal/side-panel reads better than a cramped column slot. The current Ontology Neighborhood slot is the weakest right-column candidate if an embedded approach is preferred.

**Sub-modal / z-index pattern:**
- Detail modal backdrop + container: **`z-40`** (`447–456`).
- Sub-modals render at **`z-[60]`** (`ResearchPromptModal.jsx:60`, `AttachResearchModal.jsx:58`, `ExportJsonModal.jsx:74`); the upload modal goes to **`z-[70]`** to stack above a `z-[60]`.
- **Escape stacking guard (326–337):** a single `anySubModalOpen` boolean (OR of every sub-modal flag) gates whether Escape closes the parent. A new chat panel **must add its open-flag to this `anySubModalOpen` expression** (and its deps array) or Escape will close the whole detail modal out from under it.

**Frontend API calls — `authFetch`** (no `lib/api` helper; this is the only wrapper):

```javascript
// src/context/AuthContext.jsx:7–13   (TOKEN_KEY = 'session_token', line 5)
function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return fetch(url, { ...options, headers })
}
```
Exported from `AuthContext.jsx` (usable outside components — reads localStorage directly). Representative call in ProspectDetail (293–300): ``authFetch(`/api/prospects?action=attachments&id=${id}`)``. **The chat panel's fetch to the assistant endpoint must go through `authFetch`** (the server gate is `requireAuth`).

**Hash routing** — `src/App.jsx:44–50`:
```javascript
function getViewFromHash() {
  const raw = window.location.hash.replace('#', '')
  const hash = raw.split('?')[0]
  if (VALID_VIEWS.includes(hash)) return hash
  return window.matchMedia(MOBILE_QUERY).matches ? 'today' : 'pipeline'
}
```
Deep-link id parsed in `ProspectTable.jsx:706–721` via `new URLSearchParams(hash.slice(qIdx+1)).get('id')`; format `#prospects?id=123`. Selection updates use `history.replaceState` (no history pollution).

**Existing chat / streaming UI: NONE.** A thorough search across `src/**/*.jsx` for chat/message-list/streaming/typing turned up only false positives (activity-log lists, markdown accordions, inline editors). The chat panel — message list, streaming/typing state, input box — is **entirely greenfield**. No component to extend; `ResearchBriefPanel` (markdown rendering via `ReportMarkdownRenderer`) is the closest reusable piece for rendering the assistant's markdown answers.

---

## 5. Activity log

**Table: `prospect_activity_log`** (shape inferred from INSERT/SELECT usage; **not** self-ensured in `ensureProspectSchemaAdditions` — must pre-exist or the first INSERT errors). Per CLAUDE.md it is: `id SERIAL PK`, `prospect_id INTEGER FK→prospect_companies(id) ON DELETE CASCADE`, `entry_text TEXT NOT NULL`, `created_by TEXT NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`, with indexes on `prospect_id` and `created_at DESC`.

**Canonical insert pattern** (the `add-activity` action, `api/prospects.js:3497–3507`):

```sql
INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
VALUES (${prospect_id}, ${entry_text.trim()}, ${created_by || 'Unknown'})
RETURNING *
-- then auto-syncs the "current" denormalized value:
UPDATE prospect_companies
SET suggested_next_step = ${entry_text.trim()}, updated_at = NOW()
WHERE id = ${prospect_id}
```

Same 3-column INSERT is reused for task lifecycle (`Task created:` 3595, `⌫ Task deleted:` 3075, `✓/✗/↺ Task …` 3937), flag-for-review (`⚑ Flagged for review:` 3535), review-resolved (`✓ Review resolved` 3566), and contacts (`Contact added/removed:` 3477 / 3099). **Type is derived from the entry-text prefix** at read time (`api/prospects.js:2549–2554`): `Task…/✓/✗/↺/⌫ Task`→`task`; `⚑`/`✓ Review`→`flag`; else `note`.

**For logging assistant queries:** follow the `add-activity` shape with `created_by = 'AI Assistant'` (or the invoking user's name) and a plain `entry_text`. **Caveat — do NOT reuse the `add-activity` action verbatim:** its auto-sync overwrites `suggested_next_step`, which would pollute the "Next Step" column with chat text. If the assistant logs at all, write a bare INSERT into `prospect_activity_log` **without** the `suggested_next_step` UPDATE (the task/flag/contact inserts already demonstrate that "log without sync" path). Given the assistant is read-only, logging is optional — a lightweight audit row, not a state change.

---

## 6. CLAUDE.md

**Exists** at `CLAUDE.md` and is **current and accurate** against the code — the conventions below were each verified in source. The implementation must respect:

- **Vercel 12-function ceiling / one-file-per-feature** (CLAUDE.md ~932–938): route via `?action=`; never add an `api/*.js` file. Documented count "10" matches reality. The deleted 11th (`bulk-upload-reports.js`) is genuinely gone.
- **`requireAuth` in root `lib/`, not `api/` or `src/`** (~937): `lib/requireAuth.js` validates the Bearer token against `sessions` and returns `{ id, name, email, role }` or null. Every new data endpoint must call it (`const authUser = await requireAuth(req, res); if (!authUser) return`). The new assistant action is a data endpoint → it must gate.
- **Client `authFetch` rule** (~820): every `/api/*` fetch goes through `authFetch`; plain `fetch` only for static assets / external APIs. The chat panel obeys this.
- **Ontology Layer-1 rebuild + await-before-response** (~317, code at 3797–3825): rebuilds are `await`ed before `res.json()` — Vercel freezes after `res.end()`, so **no fire-and-forget**. The agentic loop's multi-step awaits must all complete before responding. (The assistant is read-only, so it triggers no rebuild, but the await-before-response discipline still governs its Anthropic/tool calls.)
- **SYNC-comment pattern** for logic duplicated between `src/` and `api/` (serverless can't import `src/`): e.g. `isPEOwnership` (line 56), category groups (69), pipeline stages (117), corridors (2734). If the assistant tools reuse scoring/category logic, copy + `// SYNC` it rather than import across the boundary.
- **Cloud-only / keep-CLAUDE.md-current** (Notes; "Keeping This File Current" ~909–919): Kyle has no local clone — never suggest local runs; run scripts in-env or via the deployed API. Update CLAUDE.md when the feature lands (new env var `ANTHROPIC_API_KEY`, new `?action=`, new chat component, the assistant section).

**Minor doc nits (not blockers):** `VITE_API_URL` is listed in env vars but the app uses relative `/api/*` exclusively (legacy/unused). No substantive contradiction between CLAUDE.md and code was found.

---

## Critical-facts cross-check (independent verification)

A 7th agent re-derived the high-stakes facts from scratch; they agree with the per-heading findings.

| Fact | Finding | Confidence |
|------|---------|-----------|
| API function count & headroom | 10 deployed; **2** slots free under 12 | HIGH (exhaustive `ls`) |
| Vercel cron | One: `?action=daily-digest`, reuses a branch, no extra function | HIGH (`vercel.json`) |
| `ANTHROPIC_API_KEY` present? | **Zero** matches repo-wide | HIGH (repo-wide grep) |
| Anthropic SDK in deps? | **No** `@anthropic-ai/*` in `package.json` | HIGH |
| Env vars in use | `DATABASE_URL`, `CRON_SECRET`, `RESEND_API_KEY`; `.env.example` documents only `DATABASE_URL` | HIGH |
| External-HTTP pattern | Plain `fetch` (Resend); no SDK | HIGH |
| `api/prospects.js` size | 4,114 lines | HIGH (`wc -l`) |
| New-action insertion | POST block: after 3114, before final 405 at 4113 | HIGH |

### Open items / caveats for the implementer
1. **`prospect_activity_log` and `prospect_attachments` are not in tracked `CREATE TABLE` migrations / self-ensure** — their schemas are inferred from INSERTs and assumed to exist in the live Neon DB. Confirm against the live schema before depending on exact column types.
2. **Reads are decentralized** — there is no single query gate. Read-only safety comes from *only wrapping GET endpoints*, not from one chokepoint.
3. **`ontology-neighborhood` takes an entity id, not a prospect id** — prospect→neighborhood needs an entity-resolution step; prefer `ontology-similar` for prospect-centric similarity.
4. **`add-activity` auto-overwrites `suggested_next_step`** — if the assistant logs, use a bare INSERT, not that action.
5. **No streaming infra exists** — decide upfront whether the chat panel streams (SSE/chunked) or returns a single JSON answer; the latter is simpler and matches the await-before-response serverless model.
