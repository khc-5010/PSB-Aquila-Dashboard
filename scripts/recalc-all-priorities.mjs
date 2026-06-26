#!/usr/bin/env node
/**
 * Global priority recompute — a maintenance pass to clear accumulated stale
 * scores, mirroring the scoring/exempt logic of recalculateAllPriorities() in
 * api/prospects.js (the same recompute the app runs after every bulk import).
 *
 * Why: priority_score is recomputed on import / on PATCH of score-input fields,
 * but historical fixes (notably the PE-ownership scorer fix — the scorer once
 * matched only 'private equity' while the dropdown writes 'PE-Backed', so PE
 * companies scored 0/15 on Ownership Urgency) were never re-propagated across
 * the whole table. Result: ~92 scored rows whose stored score no longer matches
 * the canonical scorer — almost all UNDER-scored, suppressing real targets in
 * the Call Sheet / ranking.
 *
 * Scope & decisions (reviewed with Kyle):
 *   - SCOPED to already-scored rows (priority_score IS NOT NULL). Deliberately
 *     does NOT newly-score the ~17 currently-NULL stubs (e.g. Port Erie,
 *     Niagara) — those stay unscored until actually researched (no fabrication).
 *   - priority text is set to the recomputed tier ONLY where priority_manual is
 *     NULL (manual overrides preserved); exempt rows keep their text.
 *   - PRESERVE: X-Cell Tool & Mold [58] is badged HIGH PRIORITY but its formula
 *     score caps at ~67 (50-person/7-press shop) and priority_manual was NULL —
 *     so it was a *human* Group-1 designation that any recompute would silently
 *     strip. Per CLAUDE.md ("express a human HIGH via priority + priority_manual
 *     — set both"), we codify it: set priority_manual='HIGH PRIORITY' and keep
 *     the badge while its score corrects 61->67.
 *   - Never touches updated_at (staleness must not reset). Idempotent.
 *
 *   node scripts/recalc-all-priorities.mjs            # dry-run (full breakdown)
 *   node scripts/recalc-all-priorities.mjs --apply    # write
 *
 * Requires DATABASE_URL. SYNC: keep aligned with recalculateAllPriorities() in
 * api/prospects.js if the scoring/exempt logic changes.
 */
import { neon } from '@neondatabase/serverless'
import { calculatePriorityScore, getTierFromScore, calculateAiReadiness, isExempt } from '../src/utils/priorityScore.js'

const APPLY = process.argv.includes('--apply')
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }
const sql = neon(process.env.DATABASE_URL)

// Orphaned human HIGH-PRIORITY designations to codify as manual overrides
// (priority text set above formula reach, priority_manual NULL).
const PRESERVE = { 58: 'HIGH PRIORITY' } // X-Cell Tool & Mold (Group 1, rank 2)

const norm = (v) => (v == null ? null : v)
const RANK = { 'LOW': 0, 'WATCH': 1, 'QUALIFIED': 2, 'HIGH PRIORITY': 3, 'STRATEGIC PARTNER': 3 }

// Scope: only already-scored rows. We never newly-score currently-NULL stubs here.
const rows = await sql`SELECT * FROM prospect_companies WHERE priority_score IS NOT NULL`

const batch = []        // {id, score, readiness, newPriority, isManualLike}
const manualLocks = []  // {id, company, value, score} — PRESERVE rows to set priority_manual on
let staleCorrected = 0, exemptCorrected = 0, unchanged = 0
const tierMatrix = {}
const downgrades = [], upgrades = []

for (const p of rows) {
  const exempt = isExempt(p)
  let score, readiness, tier
  if (exempt) { score = null; readiness = 'exempt'; tier = null }
  else {
    score = calculatePriorityScore(p)?.score ?? null
    readiness = calculateAiReadiness(p)?.readiness ?? null
    tier = getTierFromScore(score)
  }
  const preserve = Object.prototype.hasOwnProperty.call(PRESERVE, p.id)
  const manualLike = p.priority_manual != null || preserve
  const newPriority = (exempt || manualLike || tier == null) ? p.priority : tier

  const scoreChanged = norm(score) !== norm(p.priority_score)
  const readinessChanged = norm(readiness) !== norm(p.ai_readiness)
  const priorityChanged = norm(newPriority) !== norm(p.priority)
  const needsLock = preserve && p.priority_manual == null
  const changed = scoreChanged || readinessChanged || priorityChanged || needsLock
  if (!changed) { unchanged++; continue }

  if (exempt) exemptCorrected++; else staleCorrected++
  if (needsLock) manualLocks.push({ id: p.id, company: p.company, value: PRESERVE[p.id], score, oldScore: p.priority_score })

  // tier-move accounting (non-manual, non-preserve)
  if (priorityChanged && !exempt && p.priority_manual == null && !preserve) {
    const key = `${p.priority || '(none)'} -> ${newPriority}`
    tierMatrix[key] = (tierMatrix[key] || 0) + 1
    const line = `[${p.id}] ${String(p.company).slice(0,34).padEnd(35)} ${p.priority} -> ${newPriority} (${p.priority_score}->${score})`
    if ((RANK[newPriority] ?? 9) < (RANK[p.priority] ?? -1)) downgrades.push(line); else upgrades.push(p.id)
  }
  batch.push({ id: p.id, score, readiness, newPriority, isManualLike: manualLike, exempt })
}

console.log(`${APPLY ? '── APPLY ──' : '── DRY-RUN ──'}  scored rows scanned: ${rows.length}`)
console.log(`\nChange breakdown:`)
console.log(`  stale-corrected: ${staleCorrected}   exempt-corrected: ${exemptCorrected}   unchanged: ${unchanged}`)
console.log(`  TOTAL CHANGING: ${batch.length}`)
console.log(`\nTier changes (non-manual): ${Object.values(tierMatrix).reduce((a, b) => a + b, 0)}  (upgrades ${upgrades.length}, downgrades ${downgrades.length})`)
for (const [k, v] of Object.entries(tierMatrix).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${v}`)
console.log(`\nDowngrades:`)
for (const d of downgrades) console.log(`  ${d}`)
console.log(`\nManual locks (preserve human HIGH-PRIORITY designation):`)
for (const m of manualLocks) console.log(`  [${m.id}] ${m.company}: priority_manual='${m.value}', score ${m.oldScore}->${m.score} (badge kept)`)

if (!APPLY) { console.log(`\nDry-run only. Re-run with --apply to write (no updated_at touch).`); process.exit(0) }

// 1) Codify the preserved manual designations (sets priority_manual; keeps priority text).
for (const m of manualLocks) {
  await sql`UPDATE prospect_companies SET priority_manual = ${m.value}, priority_score = ${m.score},
            ai_readiness = ${batch.find(b => b.id === m.id)?.readiness ?? null} WHERE id = ${m.id}`
}
// 2) Recompute the rest (exclude PRESERVE ids — handled above). Chunked, no updated_at.
const rest = batch.filter(b => !Object.prototype.hasOwnProperty.call(PRESERVE, b.id))
const CHUNK = 300
let written = 0
for (let i = 0; i < rest.length; i += CHUNK) {
  const chunk = rest.slice(i, i + CHUNK)
  const params = []
  const valuesSql = chunk.map(r => {
    params.push(r.id, r.score, r.readiness, r.isManualLike, r.exempt, r.newPriority)
    const b = params.length
    return `($${b - 5}::int, $${b - 4}::int, $${b - 3}::text, $${b - 2}::boolean, $${b - 1}::boolean, $${b}::text)`
  }).join(', ')
  await sql.query(
    `UPDATE prospect_companies pc SET
       priority_score = v.score,
       ai_readiness = v.readiness,
       priority = CASE WHEN v.is_exempt OR v.is_manual OR v.tier IS NULL THEN pc.priority ELSE v.tier END
     FROM (VALUES ${valuesSql}) AS v(id, score, readiness, is_manual, is_exempt, tier)
     WHERE pc.id = v.id`,
    params
  )
  written += chunk.length
}
console.log(`\n✓ Locked ${manualLocks.length} manual designation(s), recomputed ${written} rows.`)
