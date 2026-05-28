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
