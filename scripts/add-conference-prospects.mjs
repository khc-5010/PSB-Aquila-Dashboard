#!/usr/bin/env node
/**
 * Add two prospects identified at the June 2026 PSB Plastics Conference that did
 * not already exist in the database: Port Erie Plastics and Niagara Bottling.
 *
 * Deliberately MINIMAL "Identified" stubs — only fields we can ground from the
 * conference list (company, website from the attendees' email domain, provenance,
 * PSB connection note, contacts). Research fields (category, signals, scores,
 * etc.) are intentionally left NULL so these enter the research queue honestly
 * rather than appearing scored — no fabricated data.
 *
 * Idempotent: skips a company that already exists (by exact, case-insensitive
 * name); re-running is a no-op. Dry-run by default; --apply writes.
 *
 *   node scripts/add-conference-prospects.mjs            # dry-run
 *   node scripts/add-conference-prospects.mjs --apply    # write
 *
 * Requires DATABASE_URL. Contacts mirror the conference loader's shape
 * (source / last_contacted / created_by + a "Contact added" activity-log entry).
 */
import { neon } from '@neondatabase/serverless'

const APPLY = process.argv.includes('--apply')
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }
const sql = neon(process.env.DATABASE_URL)

const SOURCE = 'PSB Plastics Conference 2026'
const LAST_CONTACTED = '2026-06-17'
const ACTOR = 'Kyle'

const PROSPECTS = [
  {
    company: 'Port Erie Plastics',
    website: 'porterie.com',
    city: 'Erie',
    state: 'PA',
    source_report: SOURCE,
    prospect_status: 'Identified',
    psb_connection_notes: 'Identified at PSB Plastics Conference (Jun 17-18 2026). Met: Brad Williams, Evan Quinn.',
    contacts: [
      { name: 'Brad Williams', email: 'bwilliams@porterie.com' },
      { name: 'Evan Quinn', email: 'equinn@porterie.com' },
    ],
  },
  {
    company: 'Niagara Bottling',
    website: 'niagarawater.com',
    city: null,
    state: 'CA', // national bottler; HQ in California (per Kyle)
    source_report: SOURCE,
    prospect_status: 'Identified',
    // All 7 attendees recorded by name; only 3 had their own email (the other 4
    // were registered under David Fisher's), so only those 3 become contacts.
    psb_connection_notes: 'Identified at PSB Plastics Conference (Jun 17-18 2026). Met: David Fisher, Kevin Boell, Ashion Safdari, Jay Deichler, Jeff Mendenhall, Jorge Ramos, Sha Chen.',
    contacts: [
      { name: 'David Fisher', email: 'dfisher@niagarawater.com' },
      { name: 'Kevin Boell', email: 'kBoell@niagarawater.com' },
      { name: 'Sha Chen', email: 'shachen416@gmail.com' },
    ],
  },
]

// Surface any NOT NULL columns without a default that we don't set (would block INSERT).
const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'prospect_companies' AND is_nullable = 'NO' AND column_default IS NULL
`
const provided = new Set(['company', 'website', 'city', 'state', 'source_report', 'prospect_status', 'psb_connection_notes', 'added_by'])
const missing = cols.map(c => c.column_name).filter(c => !provided.has(c))
console.log(`${APPLY ? '── APPLY ──' : '── DRY-RUN ──'}`)
console.log(`NOT-NULL-without-default columns: ${cols.map(c => c.column_name).join(', ') || '(none)'}`)
if (missing.length) console.log(`  ⚠ not explicitly set (rely on serial/none): ${missing.join(', ')}`)

for (const p of PROSPECTS) {
  const existing = await sql`SELECT id, company FROM prospect_companies WHERE LOWER(TRIM(company)) = ${p.company.toLowerCase()}`
  console.log(`\n${p.company}`)
  if (existing.length) { console.log(`  SKIP — already exists [${existing[0].id}]`); continue }
  console.log(`  CREATE: state=${p.state} city=${p.city ?? '—'} website=${p.website} status=${p.prospect_status} (score/category left NULL)`)
  for (const c of p.contacts) console.log(`    + contact ${c.name} <${c.email}>`)

  if (!APPLY) continue

  const [row] = await sql`
    INSERT INTO prospect_companies (company, website, city, state, country, source_report, prospect_status, psb_connection_notes, added_by)
    VALUES (${p.company}, ${p.website}, ${p.city}, ${p.state}, 'US', ${p.source_report}, ${p.prospect_status}, ${p.psb_connection_notes}, ${ACTOR})
    RETURNING id
  `
  console.log(`  ✓ created [${row.id}]`)
  for (const c of p.contacts) {
    await sql`INSERT INTO prospect_contacts (prospect_id, name, role, email, phone, notes, source, last_contacted, created_by)
              VALUES (${row.id}, ${c.name}, ${null}, ${c.email}, ${null}, ${null}, ${SOURCE}, ${LAST_CONTACTED}, ${ACTOR})`
    await sql`INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
              VALUES (${row.id}, ${'Contact added: ' + c.name}, ${ACTOR})`
  }
  console.log(`  ✓ ${p.contacts.length} contact(s) added`)
}
console.log(`\n${APPLY ? 'Done.' : 'Dry-run only. Re-run with --apply to write.'}`)
