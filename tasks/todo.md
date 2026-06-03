# TODO — Per-Company "Export JSON" Button

Approved plan: `/root/.claude/plans/claude-code-handoff-lucky-prism.md`
Branch: `claude/sleepy-lovelace-qRi2X`

## Phase 4 — Execution

### Server
- [x] Add `action=export-json&id=X` GET branch to `api/prospects.js` (before the generic `if (id)`)
  - [x] Primary company read (reuse `SELECT p.*, conversion_count` shape) + 404
  - [x] Link walk: typed children, typed parent, former_names→rows (case-insensitive, `= ANY`)
  - [x] Dedup by id (typed label wins), cycle guard via visited Set, cap at 25
  - [x] Batch sub-entity fetch (`= ANY(${allIds})`); group by prospect_id
  - [x] Shape payload (generated_at, schema_version, company, contacts[], attachments, activity_log w/ derived type, tasks, linked_entities[])

### Client
- [x] `src/utils/exportProspect.js` — `downloadJson` + `copyText` + `formatBytes` + `companySlug`
- [x] `src/components/prospects/ExportJsonModal.jsx` — preview modal (fetch, pretty-print, size indicator, Copy primary / Download fallback, loading+error, z-[60], Escape+backdrop close)
- [x] `src/components/prospects/ProspectDetail.jsx` — "Export JSON" header button + `showExportModal` state + Escape-stacking guard + modal render

### Verification
- [x] `node --check api/prospects.js` — PASS
- [x] `npm run build` — PASS (new modal/util/wiring compile)
- [x] `scripts/verify-export.js --mock` — PASS (26/26): Sybridge → X-Cell + Pyramid; standalone → empty
- [x] Round-trip check: import never writes partner-managed fields; `former_names` stays array
- [x] Provided read-only Neon SQL + deployed-endpoint steps (no DATABASE_URL in this container)

### Docs / wrap-up
- [x] `implementation-notes.html` — maintained continuously + verification results
- [x] `CLAUDE.md` — export feature + final JSON schema + linked-entity serialization rule
- [x] `tasks/lessons.md` — APPENDED lesson: exports must follow corporate links
- [ ] Commit + push to `claude/sleepy-lovelace-qRi2X`

## Guardrails (honored)
- OFF LIMITS untouched: import internals, partner-managed fields, ontology rebuild, CSV export, unrelated components. No refactors.
- No new files under `api/` (function count stays 10). Server logic inside `api/prospects.js`.
- Server does not import from `src/` (Vercel). Pure assembly inlined server-side; reference copy in `scripts/verify-export.js`.
