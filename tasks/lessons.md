# Codebase Lessons (from Structural Threads Diagnostic, 2026-05-28)

## Database access in this environment
- There is **no `DATABASE_URL`** in the cloud container, session-env, or repo (only the placeholder in `.env.example`/`README.md`). `psql` exists but has no connection string. The API uses `neon(process.env.DATABASE_URL)` (`api/prospects.js:1`).
- Working pattern: hand the user **one** read-only query that returns a single JSON cell, using `json_build_object(...)` with nested `json_agg(row_to_json(...))` / scalar sub-selects. The user runs it in the Neon SQL editor and pastes the JSON back. The Neon editor shows one result set per run, so a single all-in-one JSON query beats many separate queries (the user will push back on running 20 queries).
- `create-prospect-table.sql` is **stale** vs. live schema. Always confirm columns via `information_schema.columns`. Live `prospect_companies` has 52 columns incl. `follow_up_date` (date), `site_count`, `acquisition_count`, `priority_score`, `ai_readiness`, `priority_manual`, `needs_review`(+`review_note`/`review_flagged_by`/`review_flagged_at`), `added_by`, `country`.

## Subsidiary / FKA (Thread 1)
- `parent_company` and `also_known_as` are **free-text `TEXT`, no FK, no unique constraint on `company`**. Corrections are plain string UPDATEs, but table grouping is **name-string-matched** (`ProspectTable.jsx:653-670`), so renames can silently break groups.
- `parent_company` is overloaded: operational parent **and** absorbing acquirer **and** PE/financial sponsor (Crestview, Apollo, Blackstone…). `also_known_as` is overloaded: true rename **and** absorbed-brand FKA **and** owned-brand lists (Barnes) **and** parent labels.
- The ontology already seeds `subsidiary_of`/`parent_of`/`legacy_name_of`/`absorbed_into` (`scripts/create-ontology-tables.sql:143-178`) but Layer-1 rebuild only ever emits `subsidiary_of` from `parent_company` (`api/prospects.js:226-232`, `:371-377`). `also_known_as` is never read by ontology code.
- "Absorbed" vs "renamed" is a **render-time guess** (`isChild && also_known_as` → GitMerge icon, `ProspectTable.jsx:844-849`), never stored.

## Action items & tasks (Threads 2 & 3)
- Action items are **derived, not stored**: `getProspectUrgency` (`ProspectTable.jsx:223-263`) + `actionItemCount = priority <= 7` (`:561`). Staleness branch only applies when `follow_up_date` is null.
- **No assignee field exists anywhere** on prospects (only `owner` on the unrelated opportunities table). App keys on `user.name` strings, not `user_id`.
- `follow_up_date` is used by only **3 of 934** rows; `suggested_next_step` by 637 — but `suggested_next_step` is **auto-overwritten on every activity-log entry** (`api/prospects.js:2536-2540`), so it's the latest-log-entry, not a stable task.
- Daily digest computes action items **once, firm-wide**, before the per-user loop (`api/prospects.js:619-627` then `:633`); prefs only toggle sections, never which prospects.

## SYNC pairs to keep identical
- `parseLocalDate`: `ProspectTable.jsx:21` ↔ `api/prospects.js:527`.
- `getProspectUrgency`: client `ProspectTable.jsx:223` ↔ server copy in `api/prospects.js` digest.
- Corridor mapping + priority-score functions (per CLAUDE.md).

## Data hygiene
- ~35 **exact duplicate-name rows** from two double-imports (id bands 243–262↔263–282, 843–848↔849–854) that bypassed the name-keyed upsert.
- `needs_review` flag feature is built but unused (0 rows).
- Activity log: 629/645 entries are "System (migrated)"; exclude that batch from analytics.

## Threads 2+3 build (2026-05-28/29)
- New table `prospect_tasks` with `(prospect_id, status)`, `(assignee, status)`, `(due_date)` indexes.
- All task routes added to `api/prospects.js` under `?action=tasks` + HTTP method dispatch (no new functions; count stays at 11/12).
- `?action=tasks&format=count` is the single-endpoint shortcut for the badge — avoids action proliferation. Pattern is reusable for other count-style endpoints.
- Activity log lifecycle entries use prefix symbols matching the existing pattern: `✓` completed, `✗` dismissed, `↺` reopened, `⌫` deleted. The `add-activity` auto-overwrite of `suggested_next_step` is preserved by NOT calling the same UPDATE from task lifecycle handlers.
- Auth gained an unprivileged `?action=team-members` endpoint (returns name+color for active users only) so the assignee dropdown doesn't need admin role.
- Tasks column replaces the Due column in ProspectTable — sort is custom (`compareTaskColumn`) reading from a `taskCounts` Map fetched alongside the prospect list. Tasks lifecycle mutations trigger a `refreshTaskData` callback chain that re-fetches counts.
- "My Tasks" badge query (assignee = me OR unassigned, status = open) is SYNC'd between server SQL and client `isMyTaskInBadge` in `taskUtils.js`. Mark with the same `// SYNC: badge logic` comment on both sides.

## Company JSON Export (2026-06-03)
- **Exports must follow corporate links.** A "this row only" company export silently drops the absorbed/legacy entities where the real warmth lives — the canonical failure is Sybridge (a roll-up shell) whose workable contacts (Jaeger, Przybylski) sit under the absorbed **X-Cell Tool & Mold** record (+ Pyramid Mold). The export walks 1-hop: typed children (`parent_company` + `parent_relationship_kind IN ('subsidiary','absorbed_into')`), typed parent, and **`former_names[]` entries resolved to their own rows** — so an absorbed shop is caught whether it's wired via `parent_company` OR only listed in `former_names`. Dedup by row id (typed label wins); exclude `financial_sponsor` PE siblings (overloaded, ~200 strings); cycle-guard with a `visited` Set seeded with the primary id.
- **No structured contacts exist for prospects.** `cwp_contacts` is an integer count; person names live only in free text (`notes`, `psb_connection_notes`) and `research_brief` attachments. Anything wanting "contacts" must carry those free-text fields + attachments (on the linked record too), not expect a contacts table. The export keeps `contacts: []` as a forward-compat placeholder.
- **`SELECT p.*` for the company row** sidesteps the stale-DDL problem (live `prospect_companies` has columns not in `create-prospect-table.sql`).
- **Round-trip stays safe for free:** the import upsert only references its own known columns, so an export re-imported as `{ prospects:[payload.company] }` ignores all export-only + partner-managed keys (no clobber). `former_names` re-imports as an array directly.
- **Verification without a DB:** `scripts/verify-export.js --mock` runs a reference implementation of the walk/shaping over a fixture (no DATABASE_URL needed here) and `--url` hits a deployed instance. Reference impl is marked `SYNC` with the endpoint to guard drift.

## QA Audit Fix Bundle (2026-06-10)
- **The login screen was the only auth.** Every data API accepted tokenless requests; `App.jsx` even fetched successfully *behind* the login screen. Fix pattern: shared `requireAuth` in root **`lib/`** (NOT `api/` — every `api/*.js` deploys as a function and we sit at the 12-slot Hobby limit; NOT `src/` — serverless can't import it). Default-closed rule going forward: every new endpoint starts with the `requireAuth` guard; client calls go through `authFetch` (module export from AuthContext, no hook needed). Never send the session token to third-party APIs (openFDA call keeps plain `fetch`).
- **dnd-kit: `over.id` is NOT the column.** Cards are themselves droppable targets, so dropping on/near a card yields that card's UUID — which got written into `stage` and the card vanished from every column (no server-side stage validation on PATCH). Resolution order: stage key → `over.data.current.sortable.containerId` (requires explicit `id={stage.key}` on `SortableContext`; without it dnd-kit auto-generates "Sortable-N") → hovered card's own stage. Plus `VALID_STAGES` validation in the PATCH handler so no client bug can corrupt `stage` again.
- **`ON DELETE CASCADE` + shared entities = silent cross-layer data loss.** `DELETE FROM ontology_entities WHERE layer = 1` cascaded away every Layer 2 relationship hanging off company entities (full rebuild runs after every bulk import). Layer tags on shared rows don't partition ownership — delete only what nothing else references (`NOT EXISTS` guard), and let the upsert's `ON CONFLICT` reuse survivors.
- **Two disjoint matchers, each blind to the other's values:** scorer matched `'private equity'`, UI icons matched `.includes('PE')`, the dropdown writes `'PE-Backed'` → every PE company scored 0/15 on Brett's highest-conviction signal. One predicate (`isPEOwnership`, `/\bpe\b|private equity/i`), SYNC'd client+server, used everywhere. After deploy: run `POST ?action=recalculate-all-priorities` (stored scores are stale until then).
- **Graph highlighting needs a stable key across views.** Overview node ids are `{type}-{name}`, neighborhood ids are numeric entity ids, query results are prospect ids — the old code fabricated `company-{id}` strings that matched neither (any query dimmed the whole graph). Pass raw prospect ids down; map to node ids where the nodes are known (`memberProspectIds` on super-nodes / `prospectId` on company nodes).

## QA Fix Bundle 2 (2026-06-10)
- **Date-only deadlines need midnight on BOTH sides of every comparison.** key-dates compared a midnight-constructed recurring date against `new Date()` (with time) — so at 00:01 on the due day the deadline "rolled to next year"; and `daysUntil <= 0 → 'past'` hid fixed deadlines on the due day itself (DeadlineBanner filters 'past'). Rule: parse DATE columns with the parseLocalDate pattern, normalize `today` to start-of-day, treat 0 days as due-today (red), and only negative as past.
- **Neon HTTP driver queries are lazy** — `sql`...`` doesn't execute until awaited, which is what makes `sql.transaction([q1, q2, ...])` (one HTTP round-trip per chunk, atomic) possible. Used to collapse the import loop's 360+ sequential round-trips; same collect-then-bulk approach turned the Layer 1 rebuild into ~7 chunked multi-row statements (dedupe tuples by key FIRST — a multi-row `INSERT ... ON CONFLICT DO UPDATE` with an in-statement duplicate throws "cannot affect row a second time").
- **Catch-all CASE branches hide unmapped values.** DE/MD/WV fell through the corridor SQL CASE into Mountain/Central while both IN-list filters excluded them — chart, table, and click-through each told a different story. When a CASE has a catch-all, the IN-lists it must mirror can drift silently; all three SYNC sites now list the three states explicitly (→ Northeast Tool).
- **Same-z-index modals stack by DOM order, not intent.** UploadStateReportModal (z-60) was invisible behind StateReportModal's z-61 wrapper from one of its two entry points — and E2E testing missed it because the other entry point worked. Sub-modals that can be opened from inside another modal need an explicitly higher layer (z-70) and the parent's Escape handler suppressed while they're open.
- **Never wire `onChange` of a number input straight to a PATCH.** Typing "15" fired PATCH(1) then PATCH(15) with no ordering guarantee and reset `updated_at` (staleness detection) per digit. `CommitNumberInput` (ProspectDetail) holds a draft and commits on blur/Enter — same pattern the table's rank editor already used.

## Section E Bundle B (2026-06-10)
- **Self-ensuring schema beats "run this SQL first" in a no-local-dev repo.** `ensureProspectSchemaAdditions()` (module-flag-guarded, once per warm instance) creates `prospect_status_transitions` and adds `ma_date` from every endpoint that touches them — the app can never error against a not-yet-migrated DB, and deploy order stops mattering. The committed `scripts/create-status-transitions.sql` stays the reproducibility record (C2). Distinct from the flagged antipattern in `api/opportunities.js`, which runs an unguarded ALTER on every request.
- **History-accruing features should ship before the features that read them.** `logStatusChange()` writes from the PATCH handler and the brief auto-advance starting now; the trends chart reads whatever exists. Every week of delay would have been a week of unreconstructable "outreach-ready over time" history (the audit confirmed past changes can't be backfilled from `updated_at`).
- **Date inputs need the same commit-on-blur discipline as number inputs.** `<input type="date">` fires onChange with `''` for incomplete typed dates — wiring it straight to PATCH would clear `ma_date` mid-keystroke. `CommitDateInput` mirrors `CommitNumberInput` (draft + blur/Enter commit + Escape revert).
