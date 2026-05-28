# Structural Threads Diagnostic

*Read-only diagnostic of the PSB-Aquila Dashboard codebase and Neon production database. Prepared 2026-05-28. No production code or schema was modified. Database figures come from a single read-only `SELECT` run against production (934 prospect rows live). This report is decision-support for Brett and Kyle — it presents trade-offs and does not pick winners.*

## How to read this report
Each of the four threads has the same four sub-sections: **Current State** (how it works today, with file/line and column citations), **Upstream & Downstream Dependencies** (what else breaks if this changes), **Data Quality Findings** (counts and example rows from production), and **Recommendations** (2–3 options with trade-offs, no winner). A **Cross-Thread Dependencies** section ties them together, followed by **Incidental Findings** and **Diagnostic Metadata**.

**The single most important finding up front:** the database has **two free-text columns** — `parent_company` and `also_known_as` — that are each being asked to mean three or four different things at once. Nearly every symptom in Threads 1 and 4 traces back to that overload. Meanwhile, the ontology layer *already contains the correct vocabulary* to fix it (`subsidiary_of`, `legacy_name_of`, `absorbed_into`) but only one of those three is ever populated.

---

## Thread 1: Subsidiary vs. Absorption (FKA)

### Current State

**Two free-text columns carry the entire concept — there is no relationship table for prospects.**
- `parent_company TEXT` — `scripts/create-prospect-table.sql:38` (commented "Holding company or acquiring entity"); indexed at `:70`. Confirmed live as `text`, nullable.
- `also_known_as TEXT` — `scripts/create-prospect-table.sql:9`. Confirmed live as `text`, nullable.
- There is **no** prospect-to-prospect join/junction table. The only place typed company-to-company relationships exist is the **ontology** (`scripts/create-ontology-tables.sql`), which already seeds `subsidiary_of`/`parent_of` (`:143-154`), `acquired_by` (`:147-150`), **`legacy_name_of`** ("former name for what is now the object", `:171-174`), and **`absorbed_into`** ("absorbed or consolidated into object", `:175-178`).

**The taxonomy is real in the ontology but not wired up.** Layer-1 ontology rebuild reads only `parent_company` and only ever emits `subsidiary_of` — `api/prospects.js:226-232` (bulk) and `:371-377` (per-prospect). `also_known_as` is **never** read by any ontology code. So `legacy_name_of` and `absorbed_into` exist as empty vocabulary; absorption history never enters the graph.

**"Subsidiary" and "absorption" are disambiguated only by a render-time heuristic, never stored.** In the prospect table, a child row shows a `GitMerge` icon next to "fka …" **only when it is rendered as a child** of a parent group — `src/components/prospects/ProspectTable.jsx:844-849`. A standalone row with the same `also_known_as` shows plain "fka …" with no icon; a parent header row shows "fka …" with no icon (`:1063`). So "absorbed" vs "renamed" is inferred purely from grouping position — there is no column that records which pattern applies.

**Where the two fields surface:**
- **Table grouping** (`ProspectTable.jsx:652-721`): groups are keyed entirely on `parent_company` (`:656-662`). "Real parents" = a row whose `company` equals another row's `parent_company` (`:664-670`); otherwise a "virtual parent" header is synthesized (`:701-702`). `also_known_as` plays **no** role in grouping.
- **Company hover card** (`ProspectTable.jsx:321-447`): shows `parent_company` (`:426-431`); does **not** show `also_known_as`.
- **Detail panel** (`ProspectDetail.jsx`): `also_known_as` renders read-only in the header as "aka …" (`:388-390`) — there is no editable input for it anywhere in the detail panel. `parent_company` is a separate editable "Parent Company" field much further down, in the relationship section (`:911-915`). The two are rendered independently with no reconciliation — **confirming the reported inconsistency**: a record with both set shows an "aka" label at the top *and* a parent value below, as if unrelated facts.
- **Search** (`ProspectTable.jsx:602-606`): the searchable string includes **both** `also_known_as` and `parent_company` (plus company, city, state, country, category, notes, suggested_next_step). So typing "Pyramid Mold" *does* surface a record whose `also_known_as` contains it (case-insensitive substring, `:604-606`).
- **CSV export** (`ProspectTable.jsx:265-297`): the column list includes both `also_known_as` (`:267`) and `parent_company` (`:273`); flat, grouping not reflected.
- **Bulk import / add / seed**: `BulkImportModal.jsx` maps `'also known as'→also_known_as` and `'parent company'→parent_company`; `AddCompanyModal.jsx` has inputs for both; `scripts/seed-prospects.js` maps `also_known_as` but not `parent_company`. The import upsert overwrites both columns when a non-empty value is supplied (`api/prospects.js:2703, :2726`).

**What the data shows the two columns are actually being used for.** `parent_company` conflates *three* distinct relationships, and `also_known_as` conflates *four*:

| `parent_company` is used for… | Example (live row) |
|---|---|
| Operational parent, brand keeps identity (true subsidiary) | Nolato GW sites → `Nolato AB`; Barnes brands → `Barnes Molding Solutions` |
| Absorbing acquirer (brand absorbed, name should be legacy) | `AMA Plastics` → `Westfall Technik`; `Custom Tool & Design` → `Tessy Plastics Corporation` |
| Financial sponsor / PE owner (not an operational parent at all) | `SyBridge Technologies` → `Crestview Partners (PE, $9B)`; many one-off PE firms (Blackstone, Platinum Equity, Apollo…) |

| `also_known_as` is used for… | Example (live row) |
|---|---|
| True former name / spelling variant | `STIHL Inc.` aka "Stihl Inc."; `Canon Virginia, Inc.` aka "Canon Virginia Inc." |
| Absorbed brand's former name (real FKA) | `SyBridge Technologies` aka "X-Cell Tool & Mold"; `Westfall Technik` aka "Integrity Mold (Tempe)" |
| A list of *owned brands* (should be subsidiaries, not aka) | `Barnes Molding Solutions` aka "Synventive / Manner / Thermoplay / Foboha / Priamus / Gammaflux" |
| A parent/sister label | `Priamus System Technologies` aka "Barnes Group subsidiary"; `AMA Plastics` aka "Westfall Technik Company" |

### Upstream & Downstream Dependencies

If `parent_company`/`also_known_as` are restructured (typed fields or a typed relationship), the following must change:
- **Schema/migration:** `scripts/create-prospect-table.sql` plus a Neon migration; the ontology already has `legacy_name_of`/`absorbed_into` ready (`create-ontology-tables.sql:171-178`).
- **`api/prospects.js`:** PATCH `allowedFields`; import UPSERT + INSERT column lists (`:2702-2758`); Layer-1 ontology rebuild (`:226-232`, `:371-377`) to emit the absorption/legacy edges; `ONTOLOGY_FIELDS` (`:388`) so edits re-trigger rebuild; data-audit rule `parent_no_ownership`.
- **`ProspectTable.jsx`:** grouping logic (`:652-721`); the GitMerge/fka render (`:844-849`, `:1063`); `CompanyHoverCard` (`:321-447`); search array (`:604`); CSV columns (`:266-277`); the parent-header aggregate path (`:1089-1110`).
- **`ProspectDetail.jsx`:** header "aka" (`:388-390`) and "Parent Company" field (`:911-915`) — reconcile so FKA vs subsidiary aren't shown as disconnected facts; add an editable FKA control (none exists today).
- **`AddCompanyModal.jsx`, `BulkImportModal.jsx`, `scripts/seed-prospects.js`:** column mappings.
- **`CLAUDE.md`:** several sections document the current `also_known_as`/GitMerge heuristic.

### Data Quality Findings

- **934 prospects total.** 279 (29.9%) have a `parent_company`; 247 (26.4%) have an `also_known_as`; **131 (14.0%) have both** — this is the conflation surface where the two facts are most likely to disagree.
- **Real vs. virtual parents:** of the distinct `parent_company` strings, only a handful resolve to an actual prospect row (`parent_row_exists = true`): **Westfall Technik (14 children), Nolato AB (6), Barnes Molding Solutions (6)**, and singletons including **Tessy Plastics Corporation, SyBridge Technologies, Silgan Dispensing, Revere Plastics Systems, Adler Industrial Solutions, Arcane Capital Partners**. The overwhelming majority of `parent_company` values are *strings with no matching row* — many are PE firms (Blackstone, Platinum Equity, Apollo, Crestview…), confirming `parent_company` is doubling as a "financial owner" field.

**The four reported records, dumped from production:**

- **SyBridge Technologies (id 58)** — the headline case. `company="SyBridge Technologies"`, `also_known_as="X-Cell Tool & Mold"`, `parent_company="Crestview Partners (PE, $9B)"`, Fairview PA, `year_founded=1996`, `revenue_est_m=12.0` ("~$12.1M, Plastics News #45 mold maker"), `employees=50`, `press_count=7`, **`site_count=17`, `acquisition_count=15`**, `signal_count=13`, `decision_location="Southfield, MI (SyBridge HQ)"`. **This single row blends two entities:** founding year (1996), revenue ($12M), presses (7) and employees (50) are the *X-Cell Tool & Mold* local shop in Fairview PA, while *17 sites / 15 acquisitions* are *SyBridge-corporate* figures. Brett's hypothesis is correct — the founded date and revenue are the absorbed entity's (X-Cell, not "Excel"), now displayed under the parent's name. Separately, **Pyramid Mold & Tool (id 935)** exists as its own row, Rancho Cucamonga CA, `parent_company="SyBridge Technologies"`. So SyBridge simultaneously presents as "formerly X-Cell" (absorption) at the top *and* as the parent of a separate Pyramid subsidiary row underneath — exactly the internal inconsistency reported.
- **AMA Plastics (id 182)** — `company="AMA Plastics"`, `also_known_as="Westfall Technik Company"`, `parent_company="Westfall Technik"`, Riverside CA, `recent_ma="Acquired by Westfall Technik April 2018"`, notes "Westfall's largest facility…95 presses." Brett's read (the names are reversed) is defensible: the *current* entity is the Westfall Riverside site; "AMA Plastics" is the legacy name. But note this is **systematic, not a one-off** — Westfall's other absorbed sites are *also* named by legacy name (`Fairway Injection Molds` id 920, `Delta Pacific Products` id 921, `Prism Plastics Products` id 925, `AMS Plastics` id 192 — all `parent_company="Westfall Technik"`), while the **Westfall parent row itself (id 648)** is named "Westfall Technik" with `also_known_as="Integrity Mold (Tempe)"`. So "Integrity" is treated as an absorbed-aka on the parent, while the other absorptions are treated as legacy-named children — inconsistent handling of the same pattern.
- **Tessy Plastics Corporation (id 14)** — `parent_company=null`, real parent. Child **Custom Tool & Design (id 101)**: `also_known_as="Tessy Tooling"`, `parent_company="Tessy Plastics Corporation"`, Erie PA, `recent_ma="Acquired by Tessy Plastics Dec 2019"`. An absorption modeled as a subsidiary-with-aka — consistent with the SyBridge/Westfall pattern.
- **Barnes Molding Solutions (id 66)** — `also_known_as="Synventive / Manner / Thermoplay / Foboha / Priamus / Gammaflux"`, `parent_company="Apollo Global Management (pending)"`, 6 children. **Double representation:** the owned brands are listed *both* as a slash-delimited string in Barnes's own `also_known_as` *and* as individual subsidiary rows (`Männer` id 913, `Synventive Molding Solutions` id 912, `Priamus System Technologies` id 72, `Gammaflux` id 916, `Thermoplay` id 914). These are identity-preserving subsidiaries, so stuffing them into `also_known_as` is a misuse of the FKA field.

### Recommendations (Trade-Offs)

**Option A — Typed discriminator + dedicated FKA field on `prospect_companies`.** Keep `parent_company` for the true operational parent; add `parent_relationship_kind` (`subsidiary` | `absorbed` | `financial_sponsor`) and a dedicated `former_names` field for FKA. *Schema:* 2 new columns. *Migration:* classify the 279 parent rows and split the 131 both-populated records (mostly mechanical, but needs a human pass). *Blast radius:* grouping, GitMerge render (drive off the flag, not position), detail reconciliation, search/export, ontology emit. *Effort:* **M–L.**

**Option B — Promote relationships into the ontology that already supports them.** Stop treating `parent_company`/`also_known_as` as the source of truth; make `subsidiary_of`, `legacy_name_of`, and `absorbed_into` first-class edges in `ontology_relationships`, and drive grouping/detail/search from the graph. *Schema:* no new prospect columns; populate the existing ontology types. *Migration:* a cleaned parent/aka → relationship mapping, then a Layer-1 rebuild. *Blast radius:* largest — grouping would read the ontology instead of a string column; ontology rebuild expands (`:226-232`); UI refactor. *Effort:* **L.** Upside: aligns with the documented Phase-4+ ontology direction and the `legacy_name_of`/`absorbed_into` vocabulary that already exists.

**Option C — Minimal disambiguation.** Add a single `parent_relationship_type` enum to record subsidiary-vs-absorbed at the row level (so the GitMerge icon stops being a positional guess), and clean the `also_known_as` misuse (remove owned-brand lists like Barnes's, move them to subsidiary rows). *Schema:* 1 column. *Migration:* classify 279 parent rows; fix the worst aka-stuffing. *Blast radius:* render logic + detail reconciliation only. *Effort:* **S–M.** Does not solve the `parent_company`-as-financial-sponsor overload.

---

## Thread 2: Action Item Assignment and Filtering

### Current State

**Action items are 100% derived client-side — there is no table, no persistence, and no assignee anywhere.** `getProspectUrgency(prospect)` (`ProspectTable.jsx:223-263`) returns at most one urgency object per prospect. Precedence: if `follow_up_date` is set → `overdue`(p1) / `due_today`(p2) / `due_soon ≤3d`(p3) / `due_week ≤7d`(p4) / `scheduled`(p10); **else** staleness by status + `updated_at` — `Outreach Ready ≥14d`=`stale`(p5), `Prioritized ≥14d`=`stalled`(p6), `Research Complete ≥7d`(p7). Parked statuses (`Converted`/`Nurture`/`Identified`) return `null` (`:241-242`).

- **The badge** (`actionItemCount`, `:561-564`) counts the *full* prospect list (filter-independent) where `priority <= 7`. Rendered as the red pill in `ProspectFilters.jsx`; clicking it sets the `action_items` preset.
- **The preset** (`ProspectTable.jsx:568-571`) excludes a row if `!urgency || urgency.priority > 7`. A separate "Stale" preset (`:572-575`) keeps only `stale`/`stalled`.
- **No assignment concept exists.** A codebase-wide search for `assigned_to`/`assignee`/`owner` finds nothing on prospects; `owner` exists only on the unrelated **opportunities** table. The live `prospect_companies` schema (52 columns) has no person field beyond provenance (`added_by`, `last_edited_by`, `review_flagged_by`).

**The user model is usable as an assignment target.** Live `users` table: 4 active users — **Kyle (admin), Duane, Steve, Brett (members)** — with `name`, `email`, `color`, `role` (`api/auth.js`; `AuthContext.jsx` exposes `useAuth().user`). Crucially, **the whole app keys on the user's `name` string, not a `user_id`**: activity `created_by`, `added_by`, `last_edited_by`, opportunity `owner`, `transitioned_by` are all name strings.

**The activity log is pure history and does not feed action items.** Endpoints in `api/prospects.js`: `add-activity` (`:2522-2547`), `get-activity-log` (`:1844`), `flag-for-review`/`resolve-review`. `getProspectUrgency` reads only `follow_up_date`, `prospect_status`, `updated_at` — never the log.

**The daily digest sends the same firm-wide list to everyone.** In `daily-digest` (`api/prospects.js:591`), `actionItems` and `peWindowProspects` are computed **once** (`:619-627`) *before* the `for (const user of users)` loop (`:633`). Per-user `digest_preferences` only toggle which *sections* appear (`:639-661`), never *which* prospects. There is no `WHERE assigned_to = user` anywhere.

### Upstream & Downstream Dependencies
- Badge + presets: `ProspectTable.jsx:561-575`; `ProspectFilters.jsx` preset buttons.
- Filter state shape `{ group, category, priority, geo, status, search, preset }` (`ProspectTable.jsx:459`) — an owner filter would add one array key, mirroring `filters.status` (`:601`).
- Digest: `api/prospects.js:619-661` (would need a per-user filter to make assignment meaningful in email).
- PATCH `allowedFields` (for an `assigned_to` column).
- Cross-ref **Thread 3**: both threads need a "who," and neither field exists today.

### Data Quality Findings
- **20 action items today** (matches the badge). Breakdown: 3 follow-up due/overdue + 10 stale (Outreach Ready ≥14d) + 3 stalled research (Prioritized ≥14d) + 4 needs-outreach (Research Complete ≥7d). **17 of 20 are auto-staleness, only 3 are real dated follow-ups.**
- **`needs_review` flag: 0 rows.** The flag-for-review feature is built but unused.
- **Authorship is effectively one person.** `added_by`: Kyle 929 (the bulk import), Brett 4, null 1. `last_edited_by`: null 908, **Brett 26** (nobody else has edited a prospect). Activity log `created_by`: "System (migrated)" 629, **Brett 16** (every human-written log entry is Brett's). So today the tool is operated almost entirely by Brett; assignment would matter as the team scales to actually use it.
- **Activity-log aging:** 645 entries, 637 older than 30 days (the migrated seed), only 4 in the last 24h — i.e., genuine ongoing logging is light.

### Recommendations (Trade-Offs)

**Option A — `assigned_to TEXT` column on `prospect_companies` (stores `user.name`).** *Scope:* add column; add to PATCH `allowedFields`; add an "Owner" multi-select to `ProspectFilters` and a one-line predicate mirroring `filters.status`; optionally make the digest per-user. *Schema:* 1 column. *Migration:* none (nullable). *Blast radius:* small. *Effort:* **S.** *Caveat:* one assignee per *prospect*, and the action item itself is still derived — you're assigning the company, not the specific item.

**Option B — Dedicated `tasks`/`action_items` table** with `assigned_to`, due date, status, `prospect_id` FK. *Scope:* new table + endpoints folded into `prospects.js` (no new serverless function — stays under the Vercel Hobby 12-function limit) + new UI. *Schema:* 1 table. *Blast radius:* large (new UI surface) but this is the only option that gives a *stable, assignable item*; **converges with Thread 3.** *Effort:* **M–L.**

**Option C — Label/tag model** (assignee as a label). *Scope:* a labels table + join. *Blast radius:* medium; **poor fit** — there is no existing prospect-label infrastructure to extend, and "assignee" is a single-valued attribute, not a tag. *Effort:* **M.**

**What the code suggests:** an action item has *no stable identity* — it is recomputed every render and its type flips as dates pass (`due_soon`→`overdue`) or as `follow_up_date` is cleared (switches to staleness). There is no row to hang `assigned_to` on. Assignment therefore must live on a **stable carrier**: the prospect (Option A) or a real task row (Option B). Because the app already keys on `user.name` everywhere, an `assigned_to TEXT` storing the name matches every existing convention (a `user_id` FK would be cleaner but breaks that convention).

---

## Thread 3: Task Field on Company Records

### Current State

**`follow_up_date` is the only forward-looking signal, and it's barely used.** Set/edited in `ProspectDetail.jsx:638-683` (a `<input type="date">` plus quick-set buttons Tomorrow/+3d/+1wk/+2wk/+1mo that build a local `YYYY-MM-DD` to avoid UTC drift, `:668-674`). Displayed in the "Due" column (`ProspectTable.jsx:906-919`). Sorted nulls-last (it's in `NUMERIC_COLUMNS`, `:66-70`, coerced via `parseLocalDate(...).getTime()`, `:93-95`). Drives Tier-1 urgency (`:228-238`). `parseLocalDate` is duplicated verbatim in `api/prospects.js:527` with a `// SYNC` contract.

**There is no task/todo concept.** A repo-wide search for `task`/`todo` finds only the `action_items` *preset* (a derived view, not a stored entity). The live 52-column `prospect_companies` schema has no task columns.

**`suggested_next_step` looks like a task but is not one.** Displayed in the "Next Step" column (`ProspectTable.jsx:955`). It is **auto-overwritten on every activity-log entry**: `add-activity` runs `UPDATE prospect_companies SET suggested_next_step = ${entry_text}` (`api/prospects.js:2536-2540`). Why it does not serve as a task description, argued from code: (1) **no due-date binding** — it's unrelated to `follow_up_date`; (2) **no assignee**; (3) **it's the latest log entry, overwritten wholesale** each time, so a standing intent is clobbered by the next status note; (4) by design it's now backward-looking — CLAUDE.md says the activity log "replaces the old overwriteable `suggested_next_step` field."

**Activity-log writers never touch `follow_up_date`.** `add-activity`, `flag-for-review`, `resolve-review` write the log + `suggested_next_step`/flags + `updated_at`, but none reads or writes `follow_up_date` (`:2522-2609`). So setting a date and logging activity are fully independent: logging never clears a date, clearing a date never logs.

**Digest** buckets by urgency level (`api/prospects.js:639-661`); Overdue and Due-This-Week are 100% `follow_up_date`-driven; email rows show only company / location / urgency label — no task text or owner, because none exists.

### Upstream & Downstream Dependencies
- `follow_up_date` readers: Due column (`:906-919`), urgency badge (`:934`), `actionItemCount` (`:561`), digest (`:639-661`), sort (`:93-95`).
- `parseLocalDate` SYNC pair (`ProspectTable.jsx:21` ↔ `api/prospects.js:527`).
- `suggested_next_step` auto-sync at `api/prospects.js:2536-2540` is the single blocker to reusing it as a stable task description.
- Cross-ref **Thread 2** (assignee).

### Data Quality Findings
- **Only 3 of 934 prospects (0.3%) have a `follow_up_date`.** They are **Silgan Dispensing (2026-05-29), FOBOHA (2026-05-25), Nolato GW Inc. (2026-04-21)**. The forward-date feature is effectively unadopted.
- **637 of 934 (68%) have a `suggested_next_step`** — the team populates *this* field, not the date field. A sample shows it is a **mix of forward intent and backward/contact notes**: "Contact David Moyak (GM, Behrend alumnus)…" (forward) vs. "Matt Davis: 303-204-9050" and "Brad Cain (Former Silgan) works here now" (contact data, not a task). So it is not a reliable task field.
- **`date_but_no_step` = 0** — every dated prospect also has a next-step, but (see Silgan) the text is a status update, not a task.
- **The Silgan example, confirmed:** Silgan Dispensing (id 917) has `follow_up_date=2026-05-29` and `suggested_next_step="Followed up with Viswa RE AI committee meeting that took place yesterday. Viswa is awaiting feedback. Expect to hear soon."` Its 5-entry activity log (all Brett) is a running status history. So clicking into Silgan shows a date and a backward-looking status — **no explicit "what to do next / by when / who,"** exactly the reported symptom. (The task referenced "May 27"; the live date is 2026-05-29 — it has since moved.)
- **9 active prospects have recent activity but no `follow_up_date`** (ALPLA, Westfall Technik, Barnes, C&J Industries, SyBridge, Matrix Tool, Erie Molded Packaging, Adler, Caplugs) — work is in flight with no scheduled next touch.

### Recommendations (Trade-Offs)

**Option A — Task fields directly on `prospect_companies` (`task_description`, `task_due_date`, `task_assignee`) — single task per company.** *Interaction with existing fields:* `follow_up_date` becomes redundant → rename/repurpose to `task_due_date` (low-friction: urgency already keys off one date column). `suggested_next_step` → repurpose to `task_description`, **but the auto-overwrite at `api/prospects.js:2536-2540` must be severed** or every log entry wipes the task. *Schema:* 3 columns (or 1 rename + 2 add). *Effort:* **M.** *Limit:* can't model "call Tuesday AND send SOW Friday."

**Option B — Dedicated `tasks` table, 1:N with company.** *Interaction:* `follow_up_date` kept short-term as a denormalized "soonest open due date" the Due column/digest read (cheapest), or the Due column is rewritten to `MIN(due_date WHERE not done)`. `suggested_next_step` kept as the latest-activity display. *Schema:* 1 table; endpoints fold into `prospects.js`. *Effort:* **M–L.** Mirrors the existing `prospect_attachments`/`prospect_activity_log` 1:N precedent; **converges with Thread 2.**

**Option C — Unified tasks + action-items model (one entity satisfies Threads 2 and 3).** *Interaction:* `follow_up_date` deprecated → `task.due_date`; the badge/preset/digest become queries over real assigned tasks instead of derived urgency (Tier-1 of `getProspectUrgency` and its SYNC server copy retire or refactor). `suggested_next_step` kept as latest-activity. *Schema:* 1 table + assignee. *Effort:* **L.** Only option that natively answers "who's doing it," because no current field stores an assignee.

**Adoption signal for the decision:** the team writes `suggested_next_step` (637 rows) far more than it sets `follow_up_date` (3 rows). Whatever model is chosen, the task *description* needs to be where people already type (repurpose `suggested_next_step`, severing the overwrite) and the *due date* needs to stop being an optional afterthought.

---

## Thread 4: Spot-Check Data Quality Issues

### Current State

**Display logic determines whether a symptom is bad data or an artifact — and that logic is now fully mapped.** The hover card (`CompanyHoverCard`, `ProspectTable.jsx:321-447`) pulls every field straight from the row's **own** columns: Sites=`site_count` (`:380-389`), Acquisitions=`acquisition_count`, Founded=`year_founded` (`:394-405`), Revenue=`revenue_est_m` — **no aggregation**. Aggregation happens only in **parent-group header table cells** (`:706-716`, summing `[parent, ...children]`): six numeric columns (Signal, Presses, Sites, Acquisitions, CWP, plus an unrendered employees total) show rollups (`:1089-1110` real parent; `:995-1001` virtual parent). `year_founded` and `revenue_est_m` are **never** aggregated and have no table column.

**Therefore:** a hover card showing "17 sites, 15 acquisitions" reflects that row's **own** stored values. A *column cell* showing a large number on a parent header is a rollup. The import upsert keys on `LOWER(TRIM(company))` (`api/prospects.js:2695`) and overwrites every research column with `COALESCE(incoming, existing)` (`:2702-2735`) — so a non-empty incoming value wins; it cannot blend two distinct rows, but it *will* attribute whatever a spreadsheet row carries to the matching company name.

### Upstream & Downstream Dependencies
`parent_company` and `also_known_as` are plain `TEXT` with **no foreign key** and `company` has **no unique constraint** — so corrections are plain string `UPDATE`s, but with two caveats: (1) grouping is **name-string-matched** (`:653-670`), so fixing a reversed name can silently turn a real-parent group into a virtual/standalone one unless both the child's `company` and others' `parent_company` stay consistent; (2) a raw SQL `UPDATE` to ontology-relevant fields **bypasses** the PATCH-triggered `rebuildOntologyForProspect`, leaving `subsidiary_of` edges stale until a manual `rebuild-ontology-layer1`.

### Data Quality Findings
- **SyBridge Technologies (id 58):** confirmed blended row (see Thread 1). `site_count=17` and `acquisition_count=15` are SyBridge-corporate; `year_founded=1996`, `revenue_est_m=12`, `press_count=7`, `employees=50` are the X-Cell/Fairview site. The "17 sites, 15 acquisitions" hover figure is **this row's own data** (not a rollup) — so it is a *data* problem, not a display artifact. The fix requires a human decision about what the row represents.
- **Westfall vs. AMA Plastics (id 182):** `company="AMA Plastics"`, `parent_company="Westfall Technik"`, `aka="Westfall Technik Company"`. Brett's "reversed" read is reasonable, but the same legacy-name convention is applied across all Westfall sites (Fairway 920, Delta Pacific 921, Prism Plastics Products 925, AMS 192), while the parent row (648) carries its own absorption as an aka ("Integrity Mold"). This is a **convention question**, not a single typo.
- **Matrix (id 906 vs id 47):** **NOT duplicates.** `Matrix Inc.` (East Providence RI, founded 1988, "small precision molder…needs further research," score 5) and `Matrix Tool, Inc.` (Fairview PA, founded 1972, 150 employees, 42 presses, the Group-1 ranked prospect, score 67) are **two distinct companies** that share the word "Matrix." They did not surface in the exact-duplicate scan. No merge — just a labeling-clarity risk.
- **Duplicate company names:** **34 exact (case-insensitive) duplicate-name clusters** — one triple (`Bemis Manufacturing` ids 60/253/273) and 33 pairs, ≈ **35 redundant rows**. The pairs cluster suspiciously in two id bands — **243–262 mirrored at 263–282** (e.g., Technimark 243/263, Bright Plastics 245/265, Schaefer 258/278, Wilbert 252/272, Raleigh 261/281) and **843–848 mirrored at 849–854** — strongly indicating **two double-import events** that bypassed the name-keyed upsert. These are independent of Thread 1.
- **Shared founded+revenue** (a cross-contamination probe): 13 clusters, but almost all are either the duplicate rows above or coincidences (e.g., Cascade Engineering & Tessy both 1973/$400M). **No evidence of founded/revenue copied across distinct rows** — consistent with the SyBridge issue being a *within-row* blend, not a cross-row leak.

### Recommendations (Trade-Offs)

**Option A — Manual, record-by-record cleanup.** *Scope:* a human fixes each flagged row in the UI. *Accuracy:* highest. *Scale:* low. *Inputs needed from Brett/Kyle:* for SyBridge, which entity the row should represent and the correct per-entity values; for AMA/Westfall (and the other Westfall sites), the canonical naming rule (legacy-named vs. parent-named); for each duplicate cluster, which row is canonical.

**Option B — Heuristic SQL audit + bulk update with manual review.** *Scope:* a script proposes merges/fixes; a human approves before write. *Speed:* high for the mechanical cases. *Inputs needed:* a confirmed de-dup rule (the +20 / +6 id-offset batches look safely bulk-removable once the lower-id row is verified canonical); a naming convention for absorbed sites; confirmation that ontology rebuild is re-run after any direct write. *Risk:* the parent/FKA "inversion" heuristic (parent-name-shorter-than-company) is **noisy** — it flagged 90+ rows, most of them legitimate (a short corporate parent like "Nolato AB" is not an error), so inversion fixes are **not** safely automatable and need per-record eyes.

---

## Cross-Thread Dependencies

**Are Thread 2 (assignment) and Thread 3 (task) the same concept?** *Related, not identical — and they converge on one entity.* Argued from code: an action item (Thread 2) has **no stored identity** — `getProspectUrgency` recomputes it every render (`ProspectTable.jsx:223-263`), so there is nowhere to attach an assignee. A task (Thread 3) is precisely the **stable, stored, forward-looking row** that an action item lacks. The two threads share exactly one new dimension — an **assignee** — which exists *nowhere* in the schema today. Consequently: if a real task entity is built (Thread 3 Option B/C), it becomes the natural carrier for assignment (Thread 2) and for owner-filtering, and the badge can count *assigned tasks* instead of (or beside) derived urgency. Building Thread 2 as a bare `assigned_to` column (Thread 2 Option A) and Thread 3 as a separate task table would create two "who" mechanisms; a **unified task/action-item model** (Thread 2 Option B + Thread 3 Option C) is the only path that satisfies both with one assignee field. *Decision lever:* do Brett/Kyle want assignment on the **company** (cheap, one-owner) or on **discrete tasks** (richer, ties both threads)?

**Blast radius of Thread 1's restructuring on UI components:**
- **Search** (`ProspectTable.jsx:604`): a new FKA/legacy field must be added to the searchable array, or "Pyramid Mold"-style lookups regress.
- **Hover card** (`:321-447`): would gain an FKA/absorption row; today it shows only `parent_company`.
- **Table grouping** (`:652-721`): currently keyed on the `parent_company` *string*; a typed split (subsidiary vs absorbed vs sponsor) changes which rows group and removes PE-firm "parents" from grouping.
- **Exports** (`:266-277`): column set changes.
- **Ontology rebuild** (`api/prospects.js:226-232`, `:371-377`): would emit `legacy_name_of`/`absorbed_into` in addition to `subsidiary_of` — these types already exist (`create-ontology-tables.sql:171-178`), so this is wiring, not new vocabulary.
- **Detail panel** (`ProspectDetail.jsx:388-390`, `:911-915`): the disconnected "aka" header and "Parent Company" field must be reconciled, and an editable FKA control added.

**How many Thread 4 issues auto-resolve under Thread 1's architecture vs. independent cleanup?**
- **Architecturally related (Thread 1 enables the fix):** SyBridge blend, AMA/Westfall naming, Barnes aka-stuffing — **3 of the named issues**. A typed model lets these be expressed correctly (absorbed legacy name vs. owned subsidiary vs. financial sponsor), and Barnes's owned-brand list moves out of `also_known_as` into the subsidiary rows that already exist. *But* none auto-resolve the underlying values — e.g., splitting SyBridge's blended numbers still needs a human to assign each figure to the right entity.
- **Independent cleanup (Thread 1 irrelevant):** the **~35 duplicate-name rows** (a de-dup/import-hygiene task) and the **Matrix Inc. vs Matrix Tool** labeling clarity. These are unaffected by the subsidiary/FKA model.

Net: Thread 1 is the **structural keystone** — it makes Threads 4's *relationship* symptoms expressible and prevents their recurrence, but the duplicate rows and the per-record value corrections are separate one-time cleanups.

---

## Incidental Findings
*Recorded but not investigated further, per scope.*
- **~35 duplicate prospect rows** from two apparent double-imports (id bands 243–262↔263–282 and 843–848↔849–854). The import upsert keys on `LOWER(TRIM(company))` (`api/prospects.js:2695`), so these were created by a path that bypassed it (direct insert, pre-upsert seed, or invisible name differences). Worth a dedicated de-dup pass.
- **`needs_review` flag is built but unused (0 rows).** The flag-for-review/resolve workflow (`api/prospects.js:2550-2609`, UI in `ProspectDetail`/`ProspectTable`) ships but has never been used in production.
- **`parent_company` is doubling as a financial-sponsor field.** A large share of values are PE firms with no operational-parent meaning (Blackstone, Platinum Equity, Apollo, Crestview…). If Thread 1 proceeds, consider a separate `financial_sponsor`/`pe_owner` field so grouping isn't polluted by ownership-only relationships.
- **Stale `geography_tier`.** Still present and shown in the hover card (`ProspectTable.jsx:418-421`) though CLAUDE.md documents it as deprecated in favor of corridors.
- **Migrated activity dominates history:** 629 of 645 log entries are "System (migrated)"; only 16 are human-authored (all Brett). Analytics over the log should exclude the migration batch.
- **`create-prospect-table.sql` is stale** relative to the live schema (missing `follow_up_date`, `site_count`, `acquisition_count`, `priority_score`, `ai_readiness`, `priority_manual`, `needs_review`+3, `added_by`, `country`). Live introspection (this report's §0) is the source of truth.

---

## Diagnostic Metadata
- **Files inspected:** ~22 across the main pass and 4 parallel sub-agents — incl. `api/prospects.js`, `src/components/prospects/{ProspectTable,ProspectDetail,BulkImportModal,AddCompanyModal}.jsx`, `src/context/AuthContext.jsx`, `api/auth.js`, `scripts/{create-prospect-table,create-auth-tables,create-ontology-tables}.sql`, `scripts/seed-prospects.js`, `package.json`, `CLAUDE.md`.
- **SQL queries run:** 1 consolidated read-only query (20 logical sub-queries: schema introspection, population counts, action-item proxy, authorship, parent/FKA structure, duplicate detection, and the spot-check record dumps). Zero writes.
- **Records examined:** all 934 prospect rows scanned for aggregates; ~150 specific rows dumped (131 parent+aka, the 4 named records + related Westfall/Barnes/SyBridge/Tessy children, 34 duplicate clusters, 3 follow-up rows, Silgan's 5 log entries).
- **Time spent:** ~one focused session.
- **Blockers encountered:** the Neon database was not directly reachable from the execution container (no `DATABASE_URL` configured). Resolved by handing Kyle a single read-only query to run and paste back — all data findings derive from that production result set.
