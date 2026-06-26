#!/usr/bin/env node
/**
 * Data-audit fix (critical): "RJG confirmed but signal = 0".
 *
 * A company with confirmed RJG cavity-pressure monitoring has, by definition, at
 * least one technology signal (the RJG itself), so signal_count must be >= 1.
 * This sets signal_count = 1 for confirmed-RJG rows that currently have 0/NULL —
 * the minimum-correct fix (it does NOT invent additional signals we haven't
 * researched) — then recomputes priority_score/ai_readiness via the canonical
 * scorer (signal_count is a Signal-Density input), preserving any priority_manual
 * override and NOT touching updated_at (a data correction must not reset staleness;
 * same principle as recalculateAllPriorities).
 *
 *   node scripts/fix-rjg-confirmed-signal.mjs            # dry-run
 *   node scripts/fix-rjg-confirmed-signal.mjs --apply    # write
 */
import { neon } from '@neondatabase/serverless'
import { calculatePriorityScore, getTierFromScore, calculateAiReadiness, isExempt } from '../src/utils/priorityScore.js'

const APPLY = process.argv.includes('--apply')
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }
const sql = neon(process.env.DATABASE_URL)

const rows = await sql`
  SELECT * FROM prospect_companies
  WHERE (rjg_cavity_pressure ILIKE '%yes%' OR rjg_cavity_pressure ILIKE '%confirmed%')
    AND (signal_count IS NULL OR signal_count = 0)`
console.log(`${APPLY ? '── APPLY ──' : '── DRY-RUN ──'}  rjg_no_signal rows: ${rows.length}`)

for (const p of rows) {
  const updated = { ...p, signal_count: 1 }
  const exempt = isExempt(updated)
  const newScore = exempt ? null : calculatePriorityScore(updated).score
  const newReadiness = exempt ? 'exempt' : calculateAiReadiness(updated).readiness
  const newTier = exempt ? null : getTierFromScore(newScore)
  console.log(`  [${p.id}] ${p.company} | rjg="${p.rjg_cavity_pressure}" | signal ${p.signal_count ?? 'null'} -> 1 | score ${p.priority_score ?? 'null'} -> ${newScore ?? 'exempt'}${p.priority_manual ? ` (manual priority "${p.priority_manual}" preserved)` : ''}`)
  if (!APPLY) continue
  if (exempt) {
    await sql`UPDATE prospect_companies SET signal_count = 1 WHERE id = ${p.id}`
  } else if (p.priority_manual) {
    await sql`UPDATE prospect_companies SET signal_count = 1, priority_score = ${newScore}, ai_readiness = ${newReadiness} WHERE id = ${p.id}`
  } else {
    await sql`UPDATE prospect_companies SET signal_count = 1, priority_score = ${newScore}, ai_readiness = ${newReadiness}, priority = ${newTier} WHERE id = ${p.id}`
  }
  console.log(`     ✓ updated`)
}
console.log(`\n${APPLY ? 'Done.' : 'Dry-run only. Re-run with --apply to write.'}`)
