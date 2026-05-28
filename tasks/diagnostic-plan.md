# Structural Threads Diagnostic — Plan

**Date:** 2026-05-28
**Mode:** Read-only diagnostic. No production code edits, no schema changes, no git ops.
**Deliverable:** `docs/diagnostics/structural-threads-diagnostic.md`

## Execution model
- **Code analysis:** done directly / via subagents against the repo (read-only).
- **Database:** no `DATABASE_URL` is available in this container. Kyle runs the SQL
  below against Neon and pastes results into chat; I fold them into the report.
  All queries are **SELECT-only**.
- **Subagents:** one per thread for parallel code investigation; main context reserved
  for SQL authoring + cross-thread synthesis + writing the report.

## Verification rules
- Cite exact table/column/file/component names with paths or line numbers.
- Back every data-quality claim with a query result + record count.
- Present 2–3 implementation options per thread with trade-offs; declare no winner.
- Flag (don't expand into) any thread that proves larger than its symptom.
- Record incidental findings without chasing them.

## Known schema facts (from create scripts + CLAUDE.md; confirm live via §0)
- `prospect_companies` (create script columns) + later additions documented in CLAUDE.md:
  `follow_up_date`, `priority_score`, `ai_readiness`, `priority_manual`,
  `needs_review`, `review_note`, `review_flagged_by`, `review_flagged_at`,
  `added_by`, `country`, `site_count`, `acquisition_count`.
- `also_known_as` is the only FKA-ish column; `parent_company` is the only subsidiary link.
- `prospect_activity_log` (id, prospect_id, entry_text, created_by, created_at).
- `users` (id, name, email, role, is_active, digest_*).
- No `assigned_to` / `task_*` columns documented anywhere → Threads 2 & 3 are greenfield.

---

## Thread 1 — Subsidiary vs. Absorption (FKA)
**Discovery questions**
- How are parent/subsidiary relationships stored? Which columns/tables?
- Is there a dedicated FKA field, or is `also_known_as` doing double duty?
- Are "subsidiary" and "FKA" distinct in code, or conflated?
- Where does subsidiary info surface: table grouping, hover cards, detail page, search, exports?
- Does search include FKA names? Trace the "Pyramid Mold" → Sybridge path.

**Dependencies to map:** table grouping logic, hover cards, detail page sections,
search query construction, CSV export columns, ontology rebuild (subsidiary_of),
analytics/digest rollups, bulk import / seed.

**SQL:** §0 (schema), §1 (counts of parent/aka/both, real-vs-virtual parents,
inversion heuristics), §4 record dumps (shared with Thread 4).

## Thread 2 — Action Item Assignment & Filtering
**Discovery questions**
- What backs "action items" — table, derived, or computed from flags/follow-ups?
- If derived, the exact computation behind the badge count.
- Is there a usable user/owner model for assignment?
- What filter UI exists for action items today?
- Relationship between activity log and what surfaces as an action item.

**Dependencies to map:** badge counter computation, filter presets, activity-log
writers, digest summaries, cross-ref Thread 3.

**SQL:** §2 (users table, distribution by added_by/last_edited_by, activity-log
authorship, action-item proxy counts, staleness).

## Thread 3 — Task Field on Company Records
**Discovery questions**
- Where does `follow_up_date` live (table/column/type)? Where set/edited/displayed?
- Any existing task/todo concept beyond `follow_up_date`?
- How does the dashboard "due" view pull this? Walk the query.
- Why doesn't `suggested_next_step` already serve as the task description? What's missing?

**Dependencies to map:** follow_up_date readers, due column, sort/filter logic,
activity-log writers, digest, cross-ref Thread 2.

**SQL:** §3 (non-null follow_up counts, past-due w/ no recent activity,
suggested_next_step population, pending-activity-without-followup, Silgan dump+log).

## Thread 4 — Spot-Check Data Quality
**Records to dump (full rows):** Sybridge, Excel Tool, Pyramid Mold, Westfall
Technique, AMA Plastics, Integrity Mold, Fairway, Delta, Prism, Tessy, Custom Tool
& Design, Barnes + brands (Faboha/Priamus/Gammaflux/Thermoplay), all "Matrix%", Silgan.

**Discovery questions**
- Sybridge "founded"/revenue possibly Excel Tool's; verify "17 sites / 15 acquisitions".
- Westfall vs AMA name/parent inversion.
- Matrix duplicate/mislabel.
- Are issues bulk-fixable via SQL or per-record?

**SQL:** §4 (record dumps via `SELECT *`, AKA search, duplicate names,
matched founding-year+revenue pairs, inversion candidates).

---

## Cross-thread synthesis (Phase 3)
- Are Thread 2 (assignment) and Thread 3 (task) the same concept, related-by-assignee,
  or distinct? Argue from code.
- Blast radius of Thread 1 restructuring on search/hover/grouping/exports/ontology.
- How many Thread 4 issues auto-resolve under Thread 1's architecture vs independent cleanup.
