# Thread 1 Implementation Plan — Option A

**Branch:** `claude/thread1-parent-fka-cleanup`, off `origin/main` (6d6ba73).
**Mode:** Phase 1 + Phase 2 autonomous → HARD CHECKPOINT → Phase 3 only after explicit confirmation.

## Schema additions (Phase 1 — additive only)
Three nullable columns on `prospect_companies`:
- `parent_relationship_kind TEXT` — values `'subsidiary'` | `'absorbed_into'` | `'sister_company'` | NULL. No CHECK constraint (kept flexible; UI dropdown restricts).
- `financial_sponsor TEXT` — free text, like `parent_company`. Carries PE / holding owners separated from operational parents.
- `former_names TEXT[]` — multi-entry FKA list (decision: TEXT[] over JSONB; see implementation-notes.html).

Migration: `scripts/add-parent-type-columns.sql` (additive `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, plus two btree indexes).

`parent_company` and `also_known_as` are **kept** for backward compatibility through the transition.

## File changes per phase

### Phase 1 — schema + write-path
- `scripts/add-parent-type-columns.sql` (NEW) — the migration.
- `api/prospects.js` — PATCH `allowedFields`; import UPSERT UPDATE + INSERT column lists; `ONTOLOGY_FIELDS` array (triggers rebuild on edits; rebuild *logic* stays unchanged until Phase 3).
- `src/components/prospects/BulkImportModal.jsx` — `EXCEL_TO_DB` mapping for the three new columns; `former_names` parsed from a pipe-delimited string.
- `scripts/seed-prospects.js` — `EXCEL_TO_DB` mapping for the three new columns; same pipe-delimited handling.

### Phase 2 — heuristic backfill (READ-ONLY route + write route, both gated by human review)
- `api/prospects.js` — two new actions:
  - `GET ?action=backfill-parent-types-dryrun` — returns candidates JSON. **No writes.**
  - `POST ?action=apply-parent-type-classifications` — accepts the human-reviewed candidates and applies. **Does not auto-run.**
- `docs/diagnostics/parent-type-backfill-candidates.json` (NEW, populated from the dryrun query result).

### Phase 3 — UI read-paths + Layer-1 rebuild (DEFERRED past checkpoint)
- `api/prospects.js` — Layer-1 rebuild branches on `parent_relationship_kind` and `financial_sponsor`.
- `src/components/prospects/ProspectTable.jsx` — grouping scope, GitMerge render, search index, CSV export, CompanyHoverCard.
- `src/components/prospects/ProspectDetail.jsx` — Formerly display + edit, kind selector, financial sponsor field.
- `src/components/prospects/AddCompanyModal.jsx` — three new fields in "More Details".
- `CLAUDE.md` — Database Schema section.

## Heuristic patterns (for Phase 2 dryrun)

Multi-signal scoring, no auto-write. Each candidate gets `{id, company, current, suggested, confidence, reason}`.

### A) `financial_sponsor` (move out of `parent_company`)
**High confidence** — both signals must hit:
- `parent_company` matches `~ '(Capital|Private Equity|\bPE\b|\bLP\b|\bFund\b)'` (word-boundaried)
- `ownership_type` ILIKE `'%PE%'` OR ILIKE `'%PE-Backed%'`

**Medium confidence** — one of:
- `parent_company` matches the pattern above but `ownership_type` is "Corporate/Strategic" or absent
- `parent_company` ends in "Partners" OR "Equity" AND `parent_row_exists = false` AND `child_count = 1` (singleton in the parent landscape)

**Excluded patterns (avoid false positives):**
- bare "Group" (Marmon Group, Heico Companies are operational)
- "Holdings" alone (Atlas Holdings is borderline; flag-for-review only)
- "Inc.", "Corp", "LLC", "Ltd" (standard suffixes)

### B) `parent_relationship_kind = 'absorbed_into'` + `former_names`
**High confidence:**
- `also_known_as IS NOT NULL` AND `parent_company IS NOT NULL`
- `also_known_as` contains no `,` or `/` (single name pattern)
- `recent_ma` ILIKE `'%acquired by%'` OR ILIKE `'%absorbed%'`
- Suggest: `parent_relationship_kind = 'absorbed_into'`, `former_names = [also_known_as]`

**Medium confidence:**
- Above signal set minus the `recent_ma` confirmation.

### C) `parent_relationship_kind = 'subsidiary'`
**High confidence:**
- `parent_company IS NOT NULL` AND `also_known_as IS NULL`
- The parent appears in ≥2 child rows (real operational parent in current grouping sense)
- `ownership_type` contains `'Corporate/Strategic'`
- Suggest: `parent_relationship_kind = 'subsidiary'`

**Medium confidence:**
- Same minus the `ownership_type` confirmation.

### D) Brand-list aka cleanup (Barnes pattern)
**High confidence:**
- `also_known_as` contains ≥3 names separated by `,` or `/`
- ≥2 of those name-tokens (case-insensitive, trimmed) match other rows' `company` values
- Suggest: clear `also_known_as` (the brands already exist as child rows with `parent_company = <this row>`)

## Test records (Phase 3 verification)
- **SyBridge Technologies** (id 58) — expect `parent_relationship_kind = 'absorbed_into'`, `former_names = ['X-Cell Tool & Mold', 'Pyramid Mold']` after manual review.
- **Westfall Technik** (id 648) + ≥3 children (AMA 182, Fairway 920, Delta Pacific 921, Prism 925).
- **Barnes Molding Solutions** (id 66) + ≥3 children (Männer 913, Synventive 912, Priamus 72, Gammaflux 916, Thermoplay 914).
- **One PE cluster** — e.g. a Crestview portfolio company; expect `financial_sponsor` set, `parent_company` cleared, no parent-group rendering.

## Search verification (Phase 3)
Typing "Pyramid Mold" must still surface SyBridge — via `former_names` joined into the searchable string (replacing the role `also_known_as` plays today).

## Verification approach (DB-blocked container)
This container has no `DATABASE_URL`. All schema and data verification is done by handing Kyle SQL to run in the Neon SQL Editor and pasting results back, same workflow as the diagnostic. The migration + the Phase 1 round-trip check + the Phase 2 dryrun get bundled into one consolidated query at the checkpoint.

## Wrap-up at checkpoint
- Phase 1 summary (schema migrated, code changes landed)
- Candidates JSON saved to `docs/diagnostics/parent-type-backfill-candidates.json`
- Breakdown by category (PE / absorbed / subsidiary / aka cleanup)
- Open questions in `implementation-notes.html` for Kyle to resolve before Phase 3
