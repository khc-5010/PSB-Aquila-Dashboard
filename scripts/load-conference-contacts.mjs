#!/usr/bin/env node
/**
 * Load conference attendee contacts into prospect_contacts.
 *
 * One-time/reusable loader for a PSB conference attendee export (columns:
 * First Name, Last Name, Organization, Email Address). It matches each
 * attendee's Organization to a prospect_companies row by EXACT normalized name
 * (no fuzzy — fuzzy is too error-prone, decided with Kyle), and for each match:
 *   1. inserts a prospect_contacts row (source + last_contacted + created_by) and
 *      the same "Contact added: ..." activity-log entry the API emits;
 *   2. appends one psb_connection_notes line (idempotent via a marker), which is
 *      a Relationship-Warmth scoring input;
 *   3. recomputes priority_score/ai_readiness for any SCORED prospect whose notes
 *      were empty (so the +4 warmth is reflected) — WITHOUT touching updated_at
 *      (staleness must not reset; same principle as recalculateAllPriorities).
 *
 * Emails are cleaned (trim, drop internal whitespace, strip stray non-email chars
 * from the ends) and de-duplicated per prospect (within the file and against rows
 * already on file). Re-running is a no-op (email dedup + notes marker).
 *
 * Usage:
 *   node scripts/load-conference-contacts.mjs <path-to.xlsx>            # dry-run
 *   node scripts/load-conference-contacts.mjs <path-to.xlsx> --apply    # write
 *
 * Requires DATABASE_URL. The attendee file is read at runtime and never committed
 * (it contains personal emails).
 */
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { calculatePriorityScore, getTierFromScore, calculateAiReadiness, isExempt } from '../src/utils/priorityScore.js'

const APPLY = process.argv.includes('--apply')
const FILE = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'))
if (!FILE) { console.error('Usage: node scripts/load-conference-contacts.mjs <path-to.xlsx> [--apply]'); process.exit(1) }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }

const SOURCE = 'PSB Plastics Conference 2026'
const LAST_CONTACTED = '2026-06-17'
const CREATED_BY = 'Kyle'
const NOTE_MARKER = 'PSB Plastics Conference'
const NOTE_PREFIX = '[PSB Plastics Conference, Jun 17-18 2026] Met: '
// Specific source-data fix confirmed with Kyle (attendee is "Tyler Mosher").
const EMAIL_FIXES = { 'yler.mosher@technimark.com': 'tyler.mosher@technimark.com' }

const sql = neon(process.env.DATABASE_URL)

function norm(s) {
  if (!s) return ''
  let x = String(s).toLowerCase().trim().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')
  x = x.replace(/\b(inc|incorporated|corp|corporation|llc|co|company|ltd|limited|lp|plc|usa|holdings|technologies|technology|plastics|industries)\b/g, ' ')
  return x.replace(/\s+/g, ' ').trim()
}
function cleanEmail(e) {
  if (!e) return ''
  let x = String(e).trim().replace(/\s+/g, '').replace(/^[^a-z0-9]+/i, '').replace(/[^a-z0-9]+$/i, '')
  if (EMAIL_FIXES[x.toLowerCase()]) x = EMAIL_FIXES[x.toLowerCase()]
  return x
}
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)
const isJunkName = (name, org) => /\d/.test(name) || (org && name.toLowerCase().startsWith(String(org).toLowerCase().split(' ')[0]))

const wb = XLSX.read(readFileSync(FILE), { type: 'buffer' })
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })

const prospects = await sql`SELECT id, company, also_known_as, former_names, category, priority, priority_manual, priority_score, ai_readiness,
  press_count, employees_approx, signal_count, cwp_contacts, psb_connection_notes, rjg_cavity_pressure, in_house_tooling,
  medical_device_mfg, key_certifications, ownership_type, recent_ma, years_in_business, outreach_group FROM prospect_companies`
const pById = new Map(prospects.map(p => [p.id, p]))
const pNorm = prospects.map(p => ({ id: p.id, keys: [p.company, p.also_known_as, ...(Array.isArray(p.former_names)?p.former_names:[])].filter(Boolean).map(norm).filter(Boolean) }))

// Exact-match attendees → prospect, grouped
const byProspect = new Map()
for (const r of rows) {
  const org = (r['Organization'] || '').trim()
  const n = norm(org)
  if (!n) continue
  const m = pNorm.find(p => p.keys.includes(n))
  if (!m) continue
  const name = `${(r['First Name']||'').trim()} ${(r['Last Name']||'').trim()}`.trim()
  const email = cleanEmail(r['Email Address'])
  if (!byProspect.has(m.id)) byProspect.set(m.id, [])
  byProspect.get(m.id).push({ name, email, org })
}

const existing = await sql`SELECT prospect_id, LOWER(email) AS email FROM prospect_contacts WHERE prospect_id = ANY(${[...byProspect.keys()]})`
const existingByP = new Map()
for (const e of existing) { if (e.email) { if (!existingByP.has(e.prospect_id)) existingByP.set(e.prospect_id, new Set()); existingByP.get(e.prospect_id).add(e.email) } }

// Build the plan
const plan = []
for (const [pid, atts] of byProspect) {
  const p = pById.get(pid)
  const byEmail = new Map()
  const noEmail = []
  for (const a of atts) {
    if (a.email && validEmail(a.email)) {
      const key = a.email.toLowerCase()
      if (!byEmail.has(key)) byEmail.set(key, [])
      byEmail.get(key).push(a)
    } else noEmail.push(a)
  }
  const keep = []
  for (const [key, cands] of byEmail) {
    if (existingByP.get(pid)?.has(key)) continue // already on file
    cands.sort((a, b) => (isJunkName(a.name, a.org) ? 1 : 0) - (isJunkName(b.name, b.org) ? 1 : 0))
    keep.push(cands[0])
  }
  // contacts with no usable email: keep if name not already obviously present (best-effort, by name)
  for (const a of noEmail) if (a.name) keep.push(a)

  const notesEmpty = !(p.psb_connection_notes && p.psb_connection_notes.trim())
  const alreadyMarked = (p.psb_connection_notes || '').includes(NOTE_MARKER)
  const appendNotes = keep.length > 0 && !alreadyMarked
  const recalc = appendNotes && notesEmpty && p.priority_score != null && !isExempt(p)
  plan.push({ p, keep, appendNotes, recalc })
}

console.log(`${APPLY ? '── APPLY ──' : '── DRY-RUN ──'}  file: ${FILE}`)
let nIns = 0, nNotes = 0, nRecalc = 0
for (const { p, keep, appendNotes, recalc } of plan.sort((a,b)=>a.p.company.localeCompare(b.p.company))) {
  console.log(`\n[${p.id}] ${p.company}`)
  for (const c of keep) console.log(`   + ${c.name} <${c.email || '(no email)'}>`)
  if (appendNotes) console.log(`   notes += "${NOTE_PREFIX}${keep.map(c=>c.name).join(', ')}"`)
  if (recalc) {
    const updated = { ...p, psb_connection_notes: `${NOTE_PREFIX}x` }
    const newScore = calculatePriorityScore(updated).score
    console.log(`   recalc: priority_score ${p.priority_score} -> ${newScore} (${getTierFromScore(newScore)})`)
  }
  nIns += keep.length; if (appendNotes) nNotes++; if (recalc) nRecalc++
}
console.log(`\nTOTALS: ${nIns} contacts, ${nNotes} notes appends, ${nRecalc} recalcs, across ${plan.length} prospects`)

if (!APPLY) { console.log('\nDry-run only. Re-run with --apply to write.'); process.exit(0) }

console.log('\nWriting...')
let okIns = 0, okNotes = 0, okRecalc = 0
for (const { p, keep, appendNotes, recalc } of plan) {
  for (const c of keep) {
    try {
      await sql`INSERT INTO prospect_contacts (prospect_id, name, role, email, phone, notes, source, last_contacted, created_by)
                VALUES (${p.id}, ${c.name}, ${null}, ${c.email || null}, ${null}, ${null}, ${SOURCE}, ${LAST_CONTACTED}, ${CREATED_BY})`
      await sql`INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
                VALUES (${p.id}, ${'Contact added: ' + c.name}, ${CREATED_BY})`
      okIns++
    } catch (err) { console.error(`  ✗ contact ${c.name} (prospect ${p.id}): ${err.message}`) }
  }
  if (appendNotes) {
    const base = (p.psb_connection_notes && p.psb_connection_notes.trim()) ? p.psb_connection_notes.trim() + '\n' : ''
    const newNotes = base + NOTE_PREFIX + keep.map(c => c.name).join(', ')
    try {
      await sql`UPDATE prospect_companies SET psb_connection_notes = ${newNotes} WHERE id = ${p.id}` // NOTE: no updated_at
      okNotes++
      if (recalc) {
        const fresh = { ...pById.get(p.id), psb_connection_notes: newNotes }
        const score = calculatePriorityScore(fresh).score
        const readiness = calculateAiReadiness(fresh).readiness
        const tier = getTierFromScore(score)
        if (p.priority_manual) {
          await sql`UPDATE prospect_companies SET priority_score = ${score}, ai_readiness = ${readiness} WHERE id = ${p.id}`
        } else {
          await sql`UPDATE prospect_companies SET priority_score = ${score}, ai_readiness = ${readiness}, priority = ${tier} WHERE id = ${p.id}`
        }
        okRecalc++
      }
    } catch (err) { console.error(`  ✗ notes/recalc (prospect ${p.id}): ${err.message}`) }
  }
}
console.log(`\nDone: ${okIns} contacts inserted, ${okNotes} notes appended, ${okRecalc} scores recalced.`)
