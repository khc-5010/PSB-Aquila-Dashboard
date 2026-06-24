# Task: Add two IEP prospects (Arburg, Blue Moose) to `prospect_companies`

**Branch:** `claude/cool-keller-rp2a72`
**Type:** Data task — no application code changes.
**Goal:** Create two `prospect_companies` rows (+ contacts) so Kyle can promote them into the
Kanban pipeline via the existing "Add to Pipeline" UI. Both are non-converter ecosystem/partner
contacts and must NOT be scored on the converter readiness rubric.

## Decisions (confirmed with Kyle)
- Arburg → `category = 'Strategic Partner'`; Blue Moose → `category = 'Ecosystem'`.
- Both → `outreach_group = 'Infrastructure'` (the only scoring-exemption lever on the prospects side;
  mirrors RJG/DME/Husky/Mold-Masters/Beaumont). Result: `priority_score = NULL`, `ai_readiness = 'exempt'`.
- Both → `prospect_status = 'Outreach Ready'` so the promote button shows immediately.
- `signal_count = 0` (no converter scoring / no inflated signals).
- DB access: env-secret route (applies to a new session); `.sql` is the no-setup fallback.

## Checklist
- [x] Plan mode + subagent recon (schema, exemption rule, ontology wiring, contacts table)
- [x] Dedupe scan — no existing Arburg / Blue Moose / Shibaura rows
- [x] Resolve category values with Kyle (Strategic Partner / Ecosystem)
- [x] Write `scripts/add-iep-prospects.sql` (idempotent, transactional, Neon SQL Editor path)
- [x] Write `scripts/add-iep-prospects.mjs` (Neon HTTP driver path + `--dry-run`)
- [x] Write `implementation-notes.html`
- [x] Update `CLAUDE.md` with the durable decision
- [x] Validate `.mjs --dry-run`; validate `.sql` against throwaway local Postgres 16 — PASS (both rows + contacts; re-run idempotent at 2/2)
- [x] Commit + push to `claude/cool-keller-rp2a72`
- [x] **(Kyle)** Set `DATABASE_URL` env var + Custom network access (`*.neon.tech`) — done
- [ ] **(new session)** Run the insert via `.mjs` (or `.sql` in Neon Editor); verify rows/contacts
- [ ] **(new session)** Trigger ontology Layer-1 rebuild for the two new rows
- [ ] **(Kyle)** Promote each prospect into the pipeline via the existing UI (manual — out of scope here)

## Guardrails honored
- Prospects only — no `opportunities` writes, no Kanban cards, no promotion.
- No converter scoring — exemption via Infrastructure; `signal_count = 0`.
- Idempotent + transactional — check-then-insert on `LOWER(TRIM(company))` + `state`; `BEGIN`/`COMMIT`.
- Wrote through the project's own data layer (Neon `sql`) — no importing server actions from other modules.
- "Unknown/unconfirmed" values left NULL rather than guessed.

## Review
_(filled in after the insert runs — see implementation-notes.html for the running decision log)_
- Status: scripts written + validated; awaiting a session with `DATABASE_URL` (or a Neon SQL Editor run).
