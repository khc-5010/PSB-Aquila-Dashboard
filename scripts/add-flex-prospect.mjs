#!/usr/bin/env node
/**
 * scripts/add-flex-prospect.mjs
 *
 * One-time data load: add ONE prospect to prospect_companies — Flex Technologies, Inc.
 * (Midvale, OH) — a vertically integrated converter with in-house tooling, plus its
 * conference/PoC contacts. Follow-up to scripts/add-iep-prospects.mjs (Arburg + Blue
 * Moose); this row is independent and does NOT touch those two.
 *
 * Unlike the Arburg/Blue Moose Infrastructure rows (scoring-exempt), Flex is a genuine
 * client prospect and gets a REAL readiness score. The score is computed in-script via
 * src/utils/priorityScore.js (the canonical scoring source — a pure UI util, NOT a server
 * action), so priority_score / ai_readiness match exactly what the app would compute.
 * No drift, self-documenting.
 *
 * Scoring (see implementation-notes.html for full rationale):
 *   priority_score = 32  (scale 7 + warmth 0 + urgency 8 + vertical 8 + signals 6 + tech 3)
 *   ai_readiness   = green (Tooling + ISO + Automotive)
 *   computed tier  = WATCH, but priority + priority_manual are set to HIGH PRIORITY per the
 *                    task's explicit "Priority: HIGH" (human judgment: multi-signal converter,
 *                    time-sensitive founder succession, warm conference touch). The modest
 *                    computed number is gated by the unknown press_count and zero CWP warmth
 *                    (half the model) — not by weakness. Same set-both-fields manual-override
 *                    pattern as add-iep-prospects.mjs.
 *
 * Idempotent + transactional: check-then-insert (WHERE NOT EXISTS on company+state for the
 * company; per-name guard for contacts), wrapped in a single sql.transaction([...]). Safe to
 * re-run. Dedupe verified: the only pre-existing "flex"-ish row is "Flexcraft" (NJ) — a
 * different company — so company+state ('Flex Technologies, Inc.' + 'OH') is collision-free.
 *
 * Connects via Neon's HTTP driver (@neondatabase/serverless) over HTTPS/443 — the only DB
 * transport this sandbox's egress proxy allows (raw-TCP Postgres is blocked). Requires the
 * egress policy to allow *.neon.tech (or Full network access).
 *
 * RUN (live):
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
 *   DATABASE_URL='postgresql://USER:PASS@ep-xxxx.REGION.aws.neon.tech/DB?sslmode=require' \
 *   node scripts/add-flex-prospect.mjs
 *
 * PREVIEW (no DB connection):
 *   node scripts/add-flex-prospect.mjs --dry-run
 *
 * AFTER RUNNING: regenerate ontology Layer-1 (raw inserts don't trigger it — application-level
 * only). One rebuild now covers Arburg + Blue Moose + Flex together:
 *   POST /api/prospects?action=rebuild-ontology-layer1   (or edit an ontology field on the row)
 */

import { calculatePriorityScore, getTierFromScore, calculateAiReadiness } from '../src/utils/priorityScore.js'

const DRY_RUN = process.argv.includes('--dry-run')

const SOURCE = `IEP Conference (Behrend), June 2026`
const NEXT_STEP = `Intro email sent at IEP (June 2026). Promote to pipeline -> Outreach.`

// ---- Notes text (no apostrophes/backticks, matching add-iep-prospects.mjs convention) ----
const FLEX_NOTES = `Met at IEP Conference (Behrend), June 17-18 2026; intro email already sent (Brett cleared Flex for send). CONVERTER + IN-HOUSE TOOLING - a genuine client prospect (score normally). Vertically integrated thermoplastics manufacturer, founded 1975 in Midvale OH as Flex Plastics, Inc.; Polyflex is its PVC-compounding division (est. 1978; six lines, 150M+ lbs/yr). Self-performs the full chain: proprietary PVC compounding (Polyflex), custom extrusion (PVC tubing, profiles, marine rub rails, weighted aeration tubing), injection molding (85-440 ton presses), shuttle molding / overmolding, thermoplastic tube forming, plastic / spin welding, automated + manual assembly. Flagship assembled products are automotive fluid-handling: sunroof drain tubes, fuel-line assemblies, vacuum/air assemblies, fuel-vapor / carbon-canister assemblies, mechanical push-pull cable assemblies. Markets: automotive OEM (core), plus marine, RV, outdoor power equipment, lawn and garden, consumer, food and beverage, industrial, agricultural, some medical. ~5 US locations: HQ + extrusion + in-house tooling Midvale OH (5479 Gundy Dr, Tuscarawas County 44653); Polyflex (PVC compounding) Baltic OH; injection molding + assembly Mount Eaton OH and Lafayette TN. HQ/decision in OH. In-house tool shop: CNC mill, lathe, EDM; prototype + production tooling; 3D printing. Certs: ISO 9001; IATF 16949:2016 (automotive); Polyflex REACH / RoHS compliant. Size ~50+ employees (directory estimate; likely larger across five sites); ~30M USD estimated revenue. Privately held, independent, founder-built (Burket family / estate). SIGNALS (signal_count=5): in-house tooling + molding [highest]; 50-year legacy mold/process/formulation library [highest]; founder succession - Glenn Burket led ~50 years and died Nov 2024, knowledge-capture / succession window open NOW [highest, time-sensitive]; active technology investment - new CNC mold-making, 3D printing, mechanical-engineering hires [high]; multi-process / multi-site complexity across 5 sites [high]. WHY STRONG: in-house tooling + molding is the highest readiness signal; a 50-year vertically integrated legacy (compounding to tooling to molding to assembly) means a deep, fragmented data/knowledge base (formulations, tool histories, process settings) across five sites and many markets - the alliance core legacy-data-chaos + tribal-knowledge fit. They are actively modernizing (new CNC, 3D printing, engineering hires) = receptive posture. DISCOVERY QUESTION (the one gap): no public evidence of RJG / Kistler / cavity-pressure monitoring or scientific molding - rjg_cavity_pressure left Unknown (NOT credited). Confirm whether they run in-mold pressure/process monitoring; if they do without an AI layer, this becomes a clean RJG-without-AI entry. PRIORITY NOTE: priority_manual = HIGH PRIORITY (human judgment); computed priority_score = 32 (WATCH tier) is gated by unknown press_count + zero CWP warmth (half the scoring model), not by weakness - confirming press count and any PSB contacts would raise it. ai_readiness = green. Engagement read: Pilot / Multiple. PSB connection: none identified (the conference handshake is the relationship). Current top leadership post-Burket unconfirmed - Kyle to confirm. Pipeline intent: Kyle to promote into Outreach.`

const TOP_SIGNAL = `In-house tooling + 50yr vertically integrated legacy; founder-succession window open (Glenn Burket, Nov 2024)`

// ---- Contacts. NOTE: Glenn E. Burket (founder/president) is DELIBERATELY EXCLUDED - he died
//      early Nov 2024; some directories still list him. ----
const CONTACTS = [
  { name: 'Scott Cecil',        role: null,            notes: 'Conference rep (IEP paid roster).' },
  { name: 'Caden Haynes',       role: null,            notes: 'Conference rep (IEP paid roster).' },
  { name: 'Jacoby Jackson',     role: null,            notes: 'Conference rep (IEP paid roster).' },
  { name: 'Brandon Nisewonger', role: null,            notes: 'Conference rep (IEP paid roster).' },
  { name: 'Francie Williams',   role: 'Sales Manager', notes: 'Public point of contact.' },
]

// ---- The prospect field object. Score inputs feed priorityScore.js below. ----
const flex = {
  company: 'Flex Technologies, Inc.',
  also_known_as: 'Flex Plastics, Inc.',
  website: 'https://www.flextechnologies.com',
  category: 'Converter + In-House Tooling',
  in_house_tooling: 'Yes',
  city: 'Midvale',
  state: 'OH',
  country: 'US',
  source_report: SOURCE,
  year_founded: 1975,
  years_in_business: 50,
  employees_approx: 50,           // directory estimate (~50+); likely larger across 5 sites
  revenue_est_m: 30,              // ~$30M estimated (not disclosed)
  press_count: null,             // UNKNOWN - 85-440 ton presses across sites, but no count
  site_count: 5,
  acquisition_count: null,       // independent, no acquisitions
  signal_count: 5,
  top_signal: TOP_SIGNAL,
  rjg_cavity_pressure: 'Unknown', // NOT confirmed - open discovery question
  medical_device_mfg: 'No',      // medical is a minor served market; no ISO 13485 evidence
  key_certifications: 'ISO 9001, IATF 16949:2016',
  ownership_type: 'Family/Founder',
  recent_ma: null,               // independent; founder succession is NOT M&A
  parent_company: null,          // independent
  cwp_contacts: null,            // no PSB contacts
  psb_connection_notes: null,
  decision_location: 'Midvale, OH',
  engagement_type: 'Pilot / Multiple',
  suggested_next_step: NEXT_STEP,
  notes: FLEX_NOTES,
  outreach_group: 'Time-Sensitive', // founder-succession window; NOT Infrastructure (that = exempt)
  prospect_status: 'Outreach Ready', // intro email sent -> show "Add to Pipeline" promote button
  added_by: 'Kyle',
  last_edited_by: 'Kyle',
}

// ---- Compute the real score from the canonical client util (matches the app exactly) ----
const scoreResult = calculatePriorityScore(flex)        // { score, breakdown }
const PRIORITY_SCORE = scoreResult.score
const AI_READINESS = calculateAiReadiness(flex).readiness
const COMPUTED_TIER = getTierFromScore(PRIORITY_SCORE)
const PRIORITY = 'HIGH PRIORITY'        // human-judgment override (task: Priority HIGH)
const PRIORITY_MANUAL = 'HIGH PRIORITY' // set both so future recalcs preserve the override

function dryRunSummary() {
  console.log('[dry-run] No DB connection made. Planned operations (single transaction, idempotent):\n')
  console.log(`  prospect_companies + ${flex.company}`)
  console.log(`      city=${flex.city}  state=${flex.state}  category=${flex.category}`)
  console.log(`      outreach_group=${flex.outreach_group}  prospect_status=${flex.prospect_status}`)
  console.log(`      in_house_tooling=${flex.in_house_tooling}  ownership_type=${flex.ownership_type}  certs=${flex.key_certifications}`)
  console.log(`      signal_count=${flex.signal_count}  site_count=${flex.site_count}  years_in_business=${flex.years_in_business}  medical=${flex.medical_device_mfg}  rjg=${flex.rjg_cavity_pressure}`)
  console.log(`      COMPUTED: priority_score=${PRIORITY_SCORE} (${COMPUTED_TIER})  ai_readiness=${AI_READINESS}  breakdown=${JSON.stringify(scoreResult.breakdown)}`)
  console.log(`      OVERRIDE: priority=${PRIORITY}  priority_manual=${PRIORITY_MANUAL}`)
  console.log(`      notes(${FLEX_NOTES.length} chars): ${FLEX_NOTES.slice(0, 70)}...`)
  console.log(`  prospect_contacts + ${CONTACTS.length} contacts -> ${flex.company}:`)
  for (const c of CONTACTS) console.log(`      ${c.name}${c.role ? ' (' + c.role + ')' : ''}`)
  console.log('      (Glenn E. Burket DELIBERATELY EXCLUDED - deceased Nov 2024)')
  console.log('\nEach insert is guarded by WHERE NOT EXISTS, so re-running is a no-op.')
  const apostrophe = /'/.test(FLEX_NOTES + TOP_SIGNAL + CONTACTS.map(c => (c.notes || '') + c.name).join(''))
  console.log('Sanity checks:', apostrophe ? 'FAIL apostrophe present' : 'OK no apostrophes')
}

async function main() {
  if (DRY_RUN) { dryRunSummary(); return }

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('ERROR: DATABASE_URL is not set. Run with --dry-run to preview without connecting.')
    process.exit(1)
  }

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)

  // Defensive schema guards (idempotent no-ops if already present in prod).
  await sql`ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US'`
  await sql`ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS added_by TEXT`
  await sql`ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS priority_manual TEXT`
  await sql`ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS priority_score INTEGER`
  await sql`ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS ai_readiness TEXT`
  await sql`ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS site_count INTEGER`
  await sql`ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS acquisition_count INTEGER`
  await sql`CREATE TABLE IF NOT EXISTS prospect_contacts (
    id SERIAL PRIMARY KEY,
    prospect_id INTEGER NOT NULL REFERENCES prospect_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL, role TEXT, email TEXT, phone TEXT, notes TEXT, source TEXT,
    last_contacted DATE, created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE INDEX IF NOT EXISTS idx_prospect_contacts_prospect ON prospect_contacts(prospect_id)`

  // Build the transaction: 1 company insert (guarded) + N contact inserts (each guarded).
  const ops = [
    sql`INSERT INTO prospect_companies (
      company, also_known_as, website, category, in_house_tooling, city, state, country,
      source_report, priority, priority_manual, priority_score, ai_readiness,
      year_founded, years_in_business, employees_approx, revenue_est_m, press_count,
      site_count, acquisition_count, signal_count, top_signal, rjg_cavity_pressure,
      medical_device_mfg, key_certifications, ownership_type, recent_ma, parent_company,
      cwp_contacts, psb_connection_notes, decision_location, engagement_type,
      suggested_next_step, notes, outreach_group, added_by, last_edited_by, prospect_status
    )
    SELECT ${flex.company}, ${flex.also_known_as}, ${flex.website}, ${flex.category}, ${flex.in_house_tooling}, ${flex.city}, ${flex.state}, ${flex.country},
      ${flex.source_report}, ${PRIORITY}, ${PRIORITY_MANUAL}, ${PRIORITY_SCORE}, ${AI_READINESS},
      ${flex.year_founded}, ${flex.years_in_business}, ${flex.employees_approx}, ${flex.revenue_est_m}, ${flex.press_count},
      ${flex.site_count}, ${flex.acquisition_count}, ${flex.signal_count}, ${flex.top_signal}, ${flex.rjg_cavity_pressure},
      ${flex.medical_device_mfg}, ${flex.key_certifications}, ${flex.ownership_type}, ${flex.recent_ma}, ${flex.parent_company},
      ${flex.cwp_contacts}, ${flex.psb_connection_notes}, ${flex.decision_location}, ${flex.engagement_type},
      ${flex.suggested_next_step}, ${flex.notes}, ${flex.outreach_group}, ${flex.added_by}, ${flex.last_edited_by}, ${flex.prospect_status}
    WHERE NOT EXISTS (
      SELECT 1 FROM prospect_companies WHERE LOWER(TRIM(company)) = LOWER(${flex.company}) AND COALESCE(state,'') = ${flex.state}
    )`,
    ...CONTACTS.map(c =>
      sql`INSERT INTO prospect_contacts (prospect_id, name, role, notes, source, created_by)
      SELECT p.id, ${c.name}, ${c.role}, ${c.notes}, ${SOURCE}, ${'Kyle'}
      FROM prospect_companies p
      WHERE LOWER(TRIM(p.company)) = LOWER(${flex.company}) AND COALESCE(p.state,'') = ${flex.state}
        AND NOT EXISTS (SELECT 1 FROM prospect_contacts c WHERE c.prospect_id = p.id AND LOWER(TRIM(c.name)) = LOWER(${c.name}))`
    ),
  ]
  await sql.transaction(ops)

  // Verify.
  const rows = await sql`SELECT id, company, state, category, outreach_group, prospect_status,
      signal_count, site_count, priority, priority_score, ai_readiness
    FROM prospect_companies WHERE LOWER(TRIM(company)) = LOWER(${flex.company}) AND COALESCE(state,'') = ${flex.state}`
  const contacts = await sql`SELECT c.name, c.role, c.prospect_id, p.company AS company
    FROM prospect_contacts c JOIN prospect_companies p ON p.id = c.prospect_id
    WHERE LOWER(TRIM(p.company)) = LOWER(${flex.company}) AND COALESCE(p.state,'') = ${flex.state} ORDER BY c.name`

  console.log('\nProspect:'); console.table(rows)
  console.log('Contacts:'); console.table(contacts)
  console.log(`\nDone. ${rows.length}/1 prospect row present, ${contacts.length}/${CONTACTS.length} contacts present.`)
  console.log(`Score: priority_score=${rows[0]?.priority_score} (${COMPUTED_TIER} computed), ai_readiness=${rows[0]?.ai_readiness}, priority=${rows[0]?.priority} (manual override).`)
  console.log('NEXT: regenerate ontology Layer-1 -> POST /api/prospects?action=rebuild-ontology-layer1 (covers Arburg + Blue Moose + Flex).')
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1) })
