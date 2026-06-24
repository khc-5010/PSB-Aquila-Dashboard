#!/usr/bin/env node
/**
 * scripts/add-iep-prospects.mjs
 *
 * One-time data load: add two IEP-conference prospects to prospect_companies, plus one contact each.
 *   1) Arburg, Inc.          (Rocky Hill, CT)  - injection-molding machine OEM / channel partner
 *   2) Blue Moose Descaling  (Charlotte, NC)   - micro cooling-system descaling service / ecosystem
 *
 * Idempotent + transactional: check-then-insert (WHERE NOT EXISTS on company+state / prospect+name),
 * wrapped in a single sql.transaction([...]). Safe to re-run. Values are kept IDENTICAL to the
 * companion scripts/add-iep-prospects.sql.
 *
 * Connects via Neon's HTTP driver (@neondatabase/serverless) over HTTPS/443 — the only DB transport
 * this sandbox's egress proxy allows (raw-TCP Postgres is blocked). Requires the egress policy to
 * allow `*.neon.tech` (or Full network access).
 *
 * RUN (live):
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
 *   DATABASE_URL='postgresql://USER:PASS@ep-xxxx.REGION.aws.neon.tech/DB?sslmode=require' \
 *   node scripts/add-iep-prospects.mjs
 *
 * PREVIEW (no DB connection, no dependency needed):
 *   node scripts/add-iep-prospects.mjs --dry-run
 *
 * AFTER RUNNING: regenerate ontology Layer-1 (raw inserts don't trigger it — it's application-level):
 *   POST /api/prospects?action=rebuild-ontology-layer1   (or edit an ontology field on each new row)
 */

const DRY_RUN = process.argv.includes('--dry-run')

// ---- Notes text (no apostrophes/backticks so it round-trips cleanly into SQL/JS) ----
const ARBURG_NOTES = `Met at IEP Conference (Behrend), June 17-18 2026; intro email already sent (Brett cleared Arburg for send). PARTNER / CHANNEL relationship - injection-molding machine OEM (ALLROUNDER hydraulic/hybrid/electric/vertical lines, freeformer additive, robotics, turnkey work cells). US subsidiary (founded 1990) handles sales/service/turnkey engineering for North America; 12,000+ machines installed (largest foreign market); top-3 IMM seller in US and Canada. US footprint: HQ Rocky Hill CT plus tech centers Irvine CA and Elgin IL; formerly operated from Newington CT (pre-2015). Parent ARBURG GmbH + Co KG, Lossburg Germany - family-owned (Hehl and Keinath), ~3,000-3,400 employees, 37 locations, ~750M EUR global turnover (2018); parent founded 1923, ALLROUNDER 1961, freeformer 2013. ISO-certified across quality, environment, energy (specific standards unconfirmed). COOPETITION - treat like Kistler, do NOT position against their data tools: Arburg runs its own digital ecosystem (smart ALLROUNDERs, ALS host computer, arburgXworld portal, Gestica HMI, arburgGREENworld, PressurePilot cavity-pressure process control). Complementarity: Arburg data lives inside one OEM closed ecosystem; Aquila is the cross-machine, cross-vendor interpretation layer above it. Org: Joshua Castonguay (met at IEP, confirm title); Martin Baumann (President/CEO Arburg Inc.); Volker Nilles (global CEO).`

const BLUEMOOSE_NOTES = `Met at IEP Conference (Behrend), June 17-18 2026; intro email already sent. ECOSYSTEM / RELATIONSHIP TIER - NOT a converter or mold-maker target. Small cooling-system descaling service for injection molders: removes mineral scale from mold cooling lines, machine heat exchangers, waterlines, and thermolators to restore heat transfer and cycle stability. Principal references a new RF85 offering described as not a coating but a process (details unconfirmed). Realistic value = floor-level industry access plus the thermal/cooling expertise of the principal as a connector. Micro / owner-operator scale. WEBSITE: none found (minimal web footprint; presence essentially via the LinkedIn presence of the principal) - Kyle to confirm. CONTACT CAVEAT: Kip Petrykowski (Charlotte NC; Embry-Riddle grad; cooling/thermal SME) - LinkedIn indicates he recently joined Shibaura Machine as Regional Sales Manager, Southeast Region, while his profile still lists Blue Moose Descaling; current primary affiliation may be Shibaura - Kyle to confirm directly. Possible follow-on: Shibaura Machine (IMM OEM with machiNetCloud IoT plus LEO predictive analytics) - a separate coopetition-style equipment-OEM relationship if Kyle pursues it.`

const JOSH_NOTE = `Met at IEP Conference (Behrend), June 2026; confirm title. Org context: Martin Baumann (President/CEO, Arburg Inc.); Volker Nilles (global CEO).`

const KIP_NOTE = `Charlotte, NC; Embry-Riddle grad; strong cooling/thermal SME. CAVEAT: LinkedIn indicates he recently joined Shibaura Machine as Regional Sales Manager, Southeast Region, while his profile still lists Blue Moose Descaling. Current primary affiliation may be Shibaura - Kyle to confirm directly.`

const NEXT_STEP = `Intro email sent at IEP (June 2026). Promote to pipeline -> Outreach.`
const SOURCE = `IEP Conference (Behrend), June 2026`

function dryRunSummary() {
  console.log('[dry-run] No DB connection made. Planned operations (single transaction, idempotent):\n')
  console.log('  prospect_companies + Arburg, Inc.')
  console.log('      state=CT  category=Strategic Partner  outreach_group=Infrastructure')
  console.log('      prospect_status=Outreach Ready  signal_count=0  priority=STRATEGIC PARTNER')
  console.log('      parent_company=ARBURG GmbH + Co KG  parent_relationship_kind=subsidiary  ownership_type=Private')
  console.log(`      notes(${ARBURG_NOTES.length} chars): ${ARBURG_NOTES.slice(0, 70)}...`)
  console.log('  prospect_companies + Blue Moose Descaling')
  console.log('      state=NC  category=Ecosystem  outreach_group=Infrastructure')
  console.log('      prospect_status=Outreach Ready  signal_count=0  priority=WATCH  ownership_type=Private')
  console.log(`      notes(${BLUEMOOSE_NOTES.length} chars): ${BLUEMOOSE_NOTES.slice(0, 70)}...`)
  console.log('  prospect_contacts  + Joshua Castonguay -> Arburg, Inc.')
  console.log('  prospect_contacts  + Kip Petrykowski   -> Blue Moose Descaling')
  console.log('\nEach insert is guarded by WHERE NOT EXISTS, so re-running is a no-op.')
  console.log('Sanity checks:',
    /'/.test(ARBURG_NOTES + BLUEMOOSE_NOTES + JOSH_NOTE + KIP_NOTE) ? 'FAIL apostrophe present' : 'OK no apostrophes')
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
  await sql`ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS parent_relationship_kind TEXT`
  await sql`CREATE TABLE IF NOT EXISTS prospect_contacts (
    id SERIAL PRIMARY KEY,
    prospect_id INTEGER NOT NULL REFERENCES prospect_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL, role TEXT, email TEXT, phone TEXT, notes TEXT, source TEXT,
    last_contacted DATE, created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE INDEX IF NOT EXISTS idx_prospect_contacts_prospect ON prospect_contacts(prospect_id)`

  // Inserts in a single transaction.
  await sql.transaction([
    sql`INSERT INTO prospect_companies (
      company, website, category, in_house_tooling, city, state, country,
      source_report, priority, priority_manual, year_founded, years_in_business,
      signal_count, medical_device_mfg, ownership_type, recent_ma, parent_company,
      parent_relationship_kind, decision_location, cwp_contacts, engagement_type,
      suggested_next_step, notes, outreach_group, added_by, last_edited_by, prospect_status
    )
    SELECT ${'Arburg, Inc.'}, ${'https://www.arburg.com/en/us/'}, ${'Strategic Partner'}, ${'N/A'}, ${'Rocky Hill'}, ${'CT'}, ${'US'},
      ${SOURCE}, ${'STRATEGIC PARTNER'}, ${'STRATEGIC PARTNER'}, ${1990}, ${36},
      ${0}, ${'No'}, ${'Private'}, ${'Integrated AMKmotion (drivetrain) into the ARBURG family'}, ${'ARBURG GmbH + Co KG'},
      ${'subsidiary'}, ${'Rocky Hill, CT'}, ${0}, ${'Channel Partner'},
      ${NEXT_STEP}, ${ARBURG_NOTES}, ${'Infrastructure'}, ${'Kyle'}, ${'Kyle'}, ${'Outreach Ready'}
    WHERE NOT EXISTS (
      SELECT 1 FROM prospect_companies WHERE LOWER(TRIM(company)) = LOWER(${'Arburg, Inc.'}) AND COALESCE(state,'') = ${'CT'}
    )`,
    sql`INSERT INTO prospect_companies (
      company, category, in_house_tooling, city, state, country,
      source_report, priority, priority_manual, signal_count, medical_device_mfg,
      ownership_type, decision_location, cwp_contacts, engagement_type,
      suggested_next_step, notes, outreach_group, added_by, last_edited_by, prospect_status
    )
    SELECT ${'Blue Moose Descaling'}, ${'Ecosystem'}, ${'N/A'}, ${'Charlotte'}, ${'NC'}, ${'US'},
      ${SOURCE}, ${'WATCH'}, ${'WATCH'}, ${0}, ${'No'},
      ${'Private'}, ${'Charlotte, NC'}, ${0}, ${'Ecosystem / Service Vendor'},
      ${NEXT_STEP}, ${BLUEMOOSE_NOTES}, ${'Infrastructure'}, ${'Kyle'}, ${'Kyle'}, ${'Outreach Ready'}
    WHERE NOT EXISTS (
      SELECT 1 FROM prospect_companies WHERE LOWER(TRIM(company)) = LOWER(${'Blue Moose Descaling'}) AND COALESCE(state,'') = ${'NC'}
    )`,
    sql`INSERT INTO prospect_contacts (prospect_id, name, notes, source, created_by)
    SELECT p.id, ${'Joshua Castonguay'}, ${JOSH_NOTE}, ${SOURCE}, ${'Kyle'}
    FROM prospect_companies p
    WHERE LOWER(TRIM(p.company)) = LOWER(${'Arburg, Inc.'}) AND COALESCE(p.state,'') = ${'CT'}
      AND NOT EXISTS (SELECT 1 FROM prospect_contacts c WHERE c.prospect_id = p.id AND LOWER(TRIM(c.name)) = LOWER(${'Joshua Castonguay'}))`,
    sql`INSERT INTO prospect_contacts (prospect_id, name, notes, source, created_by)
    SELECT p.id, ${'Kip Petrykowski'}, ${KIP_NOTE}, ${SOURCE}, ${'Kyle'}
    FROM prospect_companies p
    WHERE LOWER(TRIM(p.company)) = LOWER(${'Blue Moose Descaling'}) AND COALESCE(p.state,'') = ${'NC'}
      AND NOT EXISTS (SELECT 1 FROM prospect_contacts c WHERE c.prospect_id = p.id AND LOWER(TRIM(c.name)) = LOWER(${'Kip Petrykowski'}))`,
  ])

  // Verify.
  const rows = await sql`SELECT id, company, state, category, outreach_group, prospect_status, signal_count, priority
    FROM prospect_companies WHERE company IN (${'Arburg, Inc.'}, ${'Blue Moose Descaling'}) ORDER BY company`
  const contacts = await sql`SELECT c.name, c.prospect_id, p.company AS company
    FROM prospect_contacts c JOIN prospect_companies p ON p.id = c.prospect_id
    WHERE p.company IN (${'Arburg, Inc.'}, ${'Blue Moose Descaling'}) ORDER BY p.company, c.name`

  console.log('\nProspects:'); console.table(rows)
  console.log('Contacts:');   console.table(contacts)
  console.log(`\nDone. ${rows.length}/2 prospect rows present, ${contacts.length}/2 contacts present.`)
  console.log('NEXT: regenerate ontology Layer-1 -> POST /api/prospects?action=rebuild-ontology-layer1')
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1) })
