#!/usr/bin/env node
/**
 * Clear 5 of the 10 research holds left from the score-mover band enrichment
 * (scripts/enrich-band-from-research.mjs), per Kyle's review. These are the
 * SAFE ones: two high-confidence values parked only because they conflicted
 * with the validation run (both score-neutral — Royal already has a press count
 * so employees is the unused scale fallback; Atlas is family-owned >30yr either
 * way), and three researched medical='No' negatives (informational; 'No' never
 * adds vertical points). The other 5 holds (genuinely low-confidence) stay
 * parked — writing them would violate the no-fabrication rule.
 *
 * NOTE on medical='No': these are RESEARCHED determinations from each company's
 * own markets/products pages — NOT inferred from FDA absence (see the FDA
 * Intelligence caveat in CLAUDE.md). Never overwrites an existing 'Yes'.
 *
 * Same conventions as the other maintenance scripts: recompute via the canonical
 * scorer, never touch updated_at, preserve priority_manual, idempotent, dry-run
 * by default.
 *
 *   node scripts/clear-band-holds.mjs            # dry-run
 *   node scripts/clear-band-holds.mjs --apply    # write
 *
 * Requires DATABASE_URL.
 */
import { neon } from '@neondatabase/serverless'
import { calculatePriorityScore, getTierFromScore, calculateAiReadiness, isExempt } from '../src/utils/priorityScore.js'

const APPLY = process.argv.includes('--apply')
const CURRENT_YEAR = 2026
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }
const sql = neon(process.env.DATABASE_URL)

const ENRICH = [
  { id: 125, set: { employees_approx: 1200, medical_device_mfg: 'No' }, sources: { employees_approx: 'high: royaltechnologies.com/careers (resolved vs validation 604)', medical_device_mfg: 'medium: royaltechnologies.com/markets' } },
  { id: 244, set: { year_founded: 1979 }, sources: { year_founded: 'high: atlas-plastics.com who-we-are (resolved vs validation 1988)' } },
  { id: 129, set: { medical_device_mfg: 'No' }, sources: { medical_device_mfg: 'medium: team1plastics.com' } },
  { id: 228, set: { medical_device_mfg: 'No' }, sources: { medical_device_mfg: 'medium: royaltechnologies.com (Hi-Tech is a Royal facility)' } },
]

function eq(a, b) { return String(a ?? '') === String(b ?? '') }

async function applyRow(e) {
  const [row] = await sql`SELECT * FROM prospect_companies WHERE id = ${e.id}`
  if (!row) { console.log(`  [${e.id}] NOT FOUND — skip`); return }
  // never overwrite an existing medical 'Yes' with 'No'
  if (e.set.medical_device_mfg === 'No' && row.medical_device_mfg && String(row.medical_device_mfg).startsWith('Yes')) {
    console.log(`  [${e.id}] ${row.company}: existing medical='${row.medical_device_mfg}' — skip medical=No`)
    delete e.set.medical_device_mfg
    if (Object.keys(e.set).length === 0) return
  }
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

  const changes = {}
  for (const [k, v] of Object.entries(set)) if (!eq(row[k], v)) changes[k] = v
  if (Object.keys(changes).length === 0) { console.log(`  [${e.id}] ${row.company}: no-op`); return }

  const scoreNote = (!exempt && row.priority_score !== score) ? `   (score ${row.priority_score}->${score}${row.priority !== tier && !row.priority_manual ? ` ${row.priority}->${tier}` : ''})` : '   (score unchanged)'
  console.log(`  [${e.id}] ${row.company}: ${Object.keys(e.set).join(', ')}${scoreNote}`)
  if (!APPLY) return

  const cols = Object.keys(changes)
  const params = cols.map(c => changes[c]); params.push(e.id)
  await sql.query(`UPDATE prospect_companies SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${params.length}`, params)
  console.log(`     ✓ updated`)
}

console.log(`${APPLY ? '── APPLY ──' : '── DRY-RUN ──'}\n=== Clear band holds (${ENRICH.length} companies) ===`)
for (const e of ENRICH) await applyRow(e)
console.log(`\n${APPLY ? 'Done.' : 'Dry-run only. Re-run with --apply to write.'}`)
