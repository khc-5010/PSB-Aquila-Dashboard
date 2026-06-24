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
- **Update (Flex session):** the Arburg/Blue Moose insert was since run live (both rows exist, now `Converted` — Kyle promoted them). Ontology rebuild still pending — folded into the shared rebuild below.

---

# FOLLOW-UP — Add Flex Technologies, Inc. (a SCORED converter)

**Branch:** `claude/sharp-tesla-zp41y6`
**Type:** Data task — no application code changes.
**Goal:** One `prospect_companies` row (+ contacts) for Flex Technologies, Inc. (Midvale, OH) so Kyle can
promote it into Outreach. Independent of Arburg/Blue Moose — does NOT touch those rows.
**Key difference:** Flex is a genuine converter w/ in-house tooling → it gets a REAL readiness score
(NOT exempt like the prior two).

## Decisions
- `category = 'Converter + In-House Tooling'` (existing value, matched exactly — not an exempt category).
- `state = 'OH'`, `country = 'US'` (HQ/decision Midvale OH; also operates in TN).
- `outreach_group = 'Time-Sensitive'` (founder-succession window; NOT Infrastructure — that would exempt it).
- `signal_count = 5` (5 distinct signals; RJG/cavity-pressure NOT credited — unconfirmed).
- Score computed in-script via `src/utils/priorityScore.js`: `priority_score = 32`, `ai_readiness = 'green'`.
  Computed tier = WATCH; set `priority` + `priority_manual = 'HIGH PRIORITY'` per brief (human override;
  modest computed score is gated by unknown press_count + zero CWP warmth, not weakness).
- `ownership_type = 'Family/Founder'` (founder-built Burket family/estate; matches converter cohort convention).
- `prospect_status = 'Outreach Ready'` so the promote button shows.
- Contacts: Scott Cecil, Caden Haynes, Jacoby Jackson, Brandon Nisewonger, Francie Williams (Sales Manager).
  **Glenn E. Burket EXCLUDED** — founder/president, died Nov 2024.

## Checklist
- [x] Read live scoring (`priorityScore.js` + `api/prospects.js`), pull Plastikos + converter cohort, dedupe Flex
- [x] Map data block → live columns; compute score (32 / green) via the canonical util
- [x] Write `scripts/add-flex-prospect.mjs` (idempotent, transactional, `--dry-run`, in-script score)
- [x] Dry-run, then **run live** — Flex id 952 + 5 contacts inserted
- [x] Verify: row present + scored, idempotent re-run (1/1, 5/5), Arburg/Blue Moose untouched, dedupe clean,
      OH state-map count includes it, converter filter matches, promote-button gate satisfied (not promoted)
- [x] Update `implementation-notes.html` (Flex follow-up section) + this file
- [ ] **(shared)** Trigger ontology Layer-1 rebuild — one rebuild covers Arburg + Blue Moose + Flex
- [ ] **(Kyle)** Promote Flex into Outreach via the existing UI (manual — out of scope)

## Guardrails honored
- Prospects only — no `opportunities` writes, no Kanban card, no promotion.
- Scored normally (NOT exempt) — real `priority_score`/`ai_readiness`, not 0/null.
- Idempotent + transactional — check-then-insert on `LOWER(TRIM(company))` + `state`; single `sql.transaction([...])`.
- No importing other modules' server actions (ontology fn isn't exported anyway); score via the pure UI util only.
- "Unknown/unconfirmed" left null (press_count, recent_ma, RJG); founder (deceased) excluded from contacts.

## Open discovery question
- **RJG / cavity-pressure NOT confirmed** — left `Unknown`, not credited. Confirm whether Flex runs in-mold
  pressure/process monitoring; if yes without an AI layer → clean "RJG without AI" entry (+7 Technology).
