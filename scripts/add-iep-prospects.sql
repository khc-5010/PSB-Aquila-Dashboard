-- scripts/add-iep-prospects.sql
-- One-time data load: add two IEP-conference prospects to prospect_companies, plus one contact each.
--   1) Arburg, Inc.          (Rocky Hill, CT)  - injection-molding machine OEM / channel partner
--   2) Blue Moose Descaling  (Charlotte, NC)   - micro cooling-system descaling service / ecosystem
--
-- Idempotent + transactional: safe to re-run. Check-then-insert keyed on LOWER(TRIM(company)) + state.
--
-- HOW TO RUN:  console.neon.tech -> your project -> SQL Editor -> paste this whole file -> Run.
--              Verification SELECTs are at the bottom (run them after).
--
-- WHY THESE VALUES (see implementation-notes.html for the full rationale):
--   * Both are NON-converter ecosystem/partner contacts. outreach_group='Infrastructure' is the
--     prospects-side scoring-exemption lever (mirrors RJG/DME/Husky/Mold-Masters/Beaumont), so they
--     get priority_score=NULL / ai_readiness='exempt' and are never scored on the converter rubric.
--   * signal_count=0 (no inflated converter signal).
--   * prospect_status='Outreach Ready' so the "Add to Pipeline" promote button shows immediately.
--   * "Unknown/unconfirmed" fields are left NULL (omitted) rather than guessed.
--
-- ONTOLOGY: this raw insert does NOT trigger ontology Layer-1 (that is application-level only, no DB
--   trigger). After running, regenerate via  POST /api/prospects?action=rebuild-ontology-layer1
--   (or edit any ontology field on each new row). Non-critical for these light-data rows.

BEGIN;

-- Defensive guards: columns/table used below that live in prod but aren't in the repo's base
-- migration. All are no-ops if they already exist.
ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS country                  TEXT DEFAULT 'US';
ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS added_by                 TEXT;
ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS priority_manual          TEXT;
ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS parent_relationship_kind TEXT;

CREATE TABLE IF NOT EXISTS prospect_contacts (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER NOT NULL REFERENCES prospect_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  source TEXT,
  last_contacted DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prospect_contacts_prospect ON prospect_contacts(prospect_id);

-- 1) Arburg, Inc. ------------------------------------------------------------------------------
INSERT INTO prospect_companies (
  company, website, category, in_house_tooling, city, state, country,
  source_report, priority, priority_manual, year_founded, years_in_business,
  signal_count, medical_device_mfg, ownership_type, recent_ma, parent_company,
  parent_relationship_kind, decision_location, cwp_contacts, engagement_type,
  suggested_next_step, notes, outreach_group, added_by, last_edited_by, prospect_status
)
SELECT
  'Arburg, Inc.', 'https://www.arburg.com/en/us/', 'Strategic Partner', 'N/A', 'Rocky Hill', 'CT', 'US',
  'IEP Conference (Behrend), June 2026', 'STRATEGIC PARTNER', 'STRATEGIC PARTNER', 1990, 36,
  0, 'No', 'Private', 'Integrated AMKmotion (drivetrain) into the ARBURG family', 'ARBURG GmbH + Co KG',
  'subsidiary', 'Rocky Hill, CT', 0, 'Channel Partner',
  'Intro email sent at IEP (June 2026). Promote to pipeline -> Outreach.',
  'Met at IEP Conference (Behrend), June 17-18 2026; intro email already sent (Brett cleared Arburg for send). PARTNER / CHANNEL relationship - injection-molding machine OEM (ALLROUNDER hydraulic/hybrid/electric/vertical lines, freeformer additive, robotics, turnkey work cells). US subsidiary (founded 1990) handles sales/service/turnkey engineering for North America; 12,000+ machines installed (largest foreign market); top-3 IMM seller in US and Canada. US footprint: HQ Rocky Hill CT plus tech centers Irvine CA and Elgin IL; formerly operated from Newington CT (pre-2015). Parent ARBURG GmbH + Co KG, Lossburg Germany - family-owned (Hehl and Keinath), ~3,000-3,400 employees, 37 locations, ~750M EUR global turnover (2018); parent founded 1923, ALLROUNDER 1961, freeformer 2013. ISO-certified across quality, environment, energy (specific standards unconfirmed). COOPETITION - treat like Kistler, do NOT position against their data tools: Arburg runs its own digital ecosystem (smart ALLROUNDERs, ALS host computer, arburgXworld portal, Gestica HMI, arburgGREENworld, PressurePilot cavity-pressure process control). Complementarity: Arburg data lives inside one OEM closed ecosystem; Aquila is the cross-machine, cross-vendor interpretation layer above it. Org: Joshua Castonguay (met at IEP, confirm title); Martin Baumann (President/CEO Arburg Inc.); Volker Nilles (global CEO).',
  'Infrastructure', 'Kyle', 'Kyle', 'Outreach Ready'
WHERE NOT EXISTS (
  SELECT 1 FROM prospect_companies
  WHERE LOWER(TRIM(company)) = LOWER('Arburg, Inc.') AND COALESCE(state,'') = 'CT'
);

-- 2) Blue Moose Descaling ----------------------------------------------------------------------
INSERT INTO prospect_companies (
  company, category, in_house_tooling, city, state, country,
  source_report, priority, priority_manual, signal_count, medical_device_mfg,
  ownership_type, decision_location, cwp_contacts, engagement_type,
  suggested_next_step, notes, outreach_group, added_by, last_edited_by, prospect_status
)
SELECT
  'Blue Moose Descaling', 'Ecosystem', 'N/A', 'Charlotte', 'NC', 'US',
  'IEP Conference (Behrend), June 2026', 'WATCH', 'WATCH', 0, 'No',
  'Private', 'Charlotte, NC', 0, 'Ecosystem / Service Vendor',
  'Intro email sent at IEP (June 2026). Promote to pipeline -> Outreach.',
  'Met at IEP Conference (Behrend), June 17-18 2026; intro email already sent. ECOSYSTEM / RELATIONSHIP TIER - NOT a converter or mold-maker target. Small cooling-system descaling service for injection molders: removes mineral scale from mold cooling lines, machine heat exchangers, waterlines, and thermolators to restore heat transfer and cycle stability. Principal references a new RF85 offering described as not a coating but a process (details unconfirmed). Realistic value = floor-level industry access plus the thermal/cooling expertise of the principal as a connector. Micro / owner-operator scale. WEBSITE: none found (minimal web footprint; presence essentially via the LinkedIn presence of the principal) - Kyle to confirm. CONTACT CAVEAT: Kip Petrykowski (Charlotte NC; Embry-Riddle grad; cooling/thermal SME) - LinkedIn indicates he recently joined Shibaura Machine as Regional Sales Manager, Southeast Region, while his profile still lists Blue Moose Descaling; current primary affiliation may be Shibaura - Kyle to confirm directly. Possible follow-on: Shibaura Machine (IMM OEM with machiNetCloud IoT plus LEO predictive analytics) - a separate coopetition-style equipment-OEM relationship if Kyle pursues it.',
  'Infrastructure', 'Kyle', 'Kyle', 'Outreach Ready'
WHERE NOT EXISTS (
  SELECT 1 FROM prospect_companies
  WHERE LOWER(TRIM(company)) = LOWER('Blue Moose Descaling') AND COALESCE(state,'') = 'NC'
);

-- 3) Contacts (resolve prospect_id by company+state; idempotent on prospect_id + name) ----------
INSERT INTO prospect_contacts (prospect_id, name, role, notes, source, created_by)
SELECT p.id, 'Joshua Castonguay', NULL,
  'Met at IEP Conference (Behrend), June 2026; confirm title. Org context: Martin Baumann (President/CEO, Arburg Inc.); Volker Nilles (global CEO).',
  'IEP Conference (Behrend), June 2026', 'Kyle'
FROM prospect_companies p
WHERE LOWER(TRIM(p.company)) = LOWER('Arburg, Inc.') AND COALESCE(p.state,'') = 'CT'
  AND NOT EXISTS (
    SELECT 1 FROM prospect_contacts c
    WHERE c.prospect_id = p.id AND LOWER(TRIM(c.name)) = LOWER('Joshua Castonguay')
  );

INSERT INTO prospect_contacts (prospect_id, name, role, notes, source, created_by)
SELECT p.id, 'Kip Petrykowski', NULL,
  'Charlotte, NC; Embry-Riddle grad; strong cooling/thermal SME. CAVEAT: LinkedIn indicates he recently joined Shibaura Machine as Regional Sales Manager, Southeast Region, while his profile still lists Blue Moose Descaling. Current primary affiliation may be Shibaura - Kyle to confirm directly.',
  'IEP Conference (Behrend), June 2026', 'Kyle'
FROM prospect_companies p
WHERE LOWER(TRIM(p.company)) = LOWER('Blue Moose Descaling') AND COALESCE(p.state,'') = 'NC'
  AND NOT EXISTS (
    SELECT 1 FROM prospect_contacts c
    WHERE c.prospect_id = p.id AND LOWER(TRIM(c.name)) = LOWER('Kip Petrykowski')
  );

COMMIT;

-- ============================================================================================
-- VERIFICATION (run after COMMIT):
--
-- SELECT id, company, state, category, outreach_group, prospect_status, signal_count, priority,
--        priority_score, ai_readiness
-- FROM prospect_companies WHERE company IN ('Arburg, Inc.','Blue Moose Descaling');
--   -> expect 2 rows; priority_score/ai_readiness may be NULL until a recalc runs (exempt rows).
--
-- SELECT c.name, c.prospect_id, p.company FROM prospect_contacts c
-- JOIN prospect_companies p ON p.id = c.prospect_id
-- WHERE p.company IN ('Arburg, Inc.','Blue Moose Descaling');
--   -> expect 2 contacts (Joshua Castonguay -> Arburg, Kip Petrykowski -> Blue Moose).
-- ============================================================================================
