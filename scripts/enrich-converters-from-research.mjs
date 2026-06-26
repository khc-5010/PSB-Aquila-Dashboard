#!/usr/bin/env node
/**
 * Apply the researched data-audit fills for the pilot batch of converters
 * (sourced web research, reviewed/approved by Kyle). Each value below is the
 * verified research result; sources are noted in comments. Also: derives
 * years_in_business from founded, merges two exact duplicate rows, folds in the
 * Bright Plastics -> Thunderbird Molding rebrand, and recomputes
 * priority_score/ai_readiness (canonical scorer) WITHOUT touching updated_at,
 * preserving any priority_manual override. Idempotent; dry-run by default.
 *
 *   node scripts/enrich-converters-from-research.mjs            # dry-run
 *   node scripts/enrich-converters-from-research.mjs --apply    # write
 */
import { neon } from '@neondatabase/serverless'
import { calculatePriorityScore, getTierFromScore, calculateAiReadiness, isExempt } from '../src/utils/priorityScore.js'

const APPLY = process.argv.includes('--apply')
const CURRENT_YEAR = 2026
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }
const sql = neon(process.env.DATABASE_URL)

// Researched values (verified, sourced). `set` = fields to write; years_in_business is derived.
const ENRICH = [
  { id: 772, set: { year_founded: 1955 } },                                                  // nolato.com + VermontBiz (high)
  { id: 3,   set: { key_certifications: 'ISO 9001, IATF 16949' } },                           // prismplastics snippets (med)
  { id: 243, set: { year_founded: 1983 } },                                                   // Technimark PR + ZoomInfo (high)
  { id: 18,  set: { employees_approx: 350 } },                                                 // hofferplastics "350+" + LinkedIn (high)
  { id: 65,  set: { key_certifications: 'ISO 9001' } },                                        // thogus quality, since 2001 (high)
  { id: 736, set: { year_founded: 1985 } },                                                    // htiplastic 40th anniv (high)
  { id: 570, set: { year_founded: 1985 } },                                                    // OpportunityIowa + LinkedIn (high)
  { id: 771, set: { year_founded: 1920 } },                                                    // mack.com 100th anniv (high)
  { id: 245, set: { year_founded: 1987, company: 'Thunderbird Molding-Greensboro', former_names: ['Bright Plastics'] } }, // PitchBook/Zippia + PlasticsNews rebrand (high)
  { id: 57,  set: { employees_approx: 350 } },                                                 // SignalHire/LinkedIn range 201-500 (med)
  { id: 735, set: { year_founded: 1953, ownership_type: 'ESOP' } },                            // majorsplastics + omaha.com, 100% ESOP 2013 (high)
  { id: 8,   set: { key_certifications: 'ISO 13485, Cleanroom ISO Class 8', medical_device_mfg: 'Yes' } }, // Plastics Business PR May 2026 (high)
  { id: 4,   set: { key_certifications: 'ISO 9001' } },                                        // automationplastics + trade press (high)
]
const DELETE_DUPS = [263, 265] // exact dupes of 243 / 245, verified zero attached data

function eq(a, b) { return Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : String(a ?? '') === String(b ?? '') }

async function applyRow(e) {
  const [row] = await sql`SELECT * FROM prospect_companies WHERE id = ${e.id}`
  if (!row) { console.log(`  [${e.id}] NOT FOUND — skip`); return }
  const set = { ...e.set }
  const foundedAfter = set.year_founded ?? row.year_founded
  if (foundedAfter != null && row.years_in_business == null) set.years_in_business = CURRENT_YEAR - foundedAfter

  const merged = { ...row, ...set }
  const exempt = isExempt(merged)
  const score = exempt ? null : calculatePriorityScore(merged).score
  const readiness = exempt ? 'exempt' : calculateAiReadiness(merged).readiness
  const tier = exempt ? null : getTierFromScore(score)
  if (!exempt) {
    set.priority_score = score
    set.ai_readiness = readiness
    if (!row.priority_manual) set.priority = tier
  }

  // keep only real changes (idempotency)
  const changes = {}
  for (const [k, v] of Object.entries(set)) if (!eq(row[k], v)) changes[k] = v
  if (Object.keys(changes).length === 0) { console.log(`  [${e.id}] ${row.company}: no-op`); return }

  const summary = Object.entries(changes).map(([k, v]) => `${k}=${Array.isArray(v) ? JSON.stringify(v) : v}`).join(', ')
  console.log(`  [${e.id}] ${row.company}: ${summary}` + (row.priority_score !== score && !exempt ? `   (score ${row.priority_score}->${score})` : ''))
  if (!APPLY) return

  // former_names (TEXT[]) via tagged template; scalars via dynamic query. No updated_at.
  if ('former_names' in changes) { await sql`UPDATE prospect_companies SET former_names = ${changes.former_names} WHERE id = ${e.id}`; delete changes.former_names }
  const cols = Object.keys(changes)
  if (cols.length) {
    const params = cols.map(c => changes[c]); params.push(e.id)
    await sql.query(`UPDATE prospect_companies SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${params.length}`, params)
  }
  console.log(`     ✓ updated`)
}

console.log(`${APPLY ? '── APPLY ──' : '── DRY-RUN ──'}\n=== Enrichment (${ENRICH.length} rows) ===`)
for (const e of ENRICH) await applyRow(e)

console.log(`\n=== Merge duplicates (delete empty dupes ${DELETE_DUPS.join(', ')}) ===`)
for (const id of DELETE_DUPS) {
  const [row] = await sql`SELECT id, company FROM prospect_companies WHERE id = ${id}`
  if (!row) { console.log(`  [${id}] already gone — skip`); continue }
  const [c] = await sql`SELECT
    (SELECT COUNT(*) FROM prospect_contacts WHERE prospect_id=${id})::int
    + (SELECT COUNT(*) FROM prospect_attachments WHERE prospect_id=${id})::int
    + (SELECT COUNT(*) FROM prospect_activity_log WHERE prospect_id=${id})::int
    + (SELECT COUNT(*) FROM opportunities WHERE source_prospect_id=${id})::int AS attached`
  if (c.attached > 0) { console.log(`  [${id}] ${row.company}: ${c.attached} attached records — ABORT delete (unexpected), needs manual review`); continue }
  console.log(`  [${id}] ${row.company}: empty dup -> DELETE`)
  if (APPLY) { await sql`DELETE FROM prospect_companies WHERE id = ${id}`; console.log('     ✓ deleted') }
}
console.log(`\n${APPLY ? 'Done.' : 'Dry-run only. Re-run with --apply to write.'}`)
