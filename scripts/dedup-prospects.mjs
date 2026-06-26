#!/usr/bin/env node
/**
 * De-duplicate prospect_companies rows created by two botched bulk imports
 * (a 2026-04-01 "Tier 3 Triage" batch that double-inserted ~17 NC rows with a
 * clean +20 id offset, and a 2026-04-04 Montana batch that double-inserted 6
 * rows ~6 min apart). Plus four near-empty/mis-located second entries of a
 * company already well-represented by a richer row.
 *
 * Discovered via an exact-company-name duplicate scan (32 groups, 33 extra
 * rows). Each delete is verified safe by re-pointing any real attached data
 * (attachments / tasks / contacts / opportunities / unique activity-log
 * entries) onto the kept row BEFORE deleting — the CASCADE FKs would otherwise
 * wipe it. ontology_entities is ON DELETE SET NULL (orphaned Company entities
 * self-heal on the next Layer-1 rebuild). Does NOT touch updated_at.
 *
 * Idempotent: a drop id that's already gone is skipped. Dry-run by default.
 *
 *   node scripts/dedup-prospects.mjs            # dry-run (shows plan)
 *   node scripts/dedup-prospects.mjs --apply    # write
 *
 * Requires DATABASE_URL.
 *
 * KEEP-DISTINCT (intentionally NOT touched — real multi-site or name-collision
 * pairs, several carrying their own data): Ash Industries (407 TN / 696 LA),
 * Bemis 60 WI vs 253 NC, Mack Molding Co. (468 SC / 771 VT), PSI Molded
 * Plastics (472 SC / 723 NH — each has a research attachment), Vantec LLC
 * (579 IA / 740 NE — 579 has a CWP note), Watertown Plastics (512 CT / 867 SD).
 */
import { neon } from '@neondatabase/serverless'

const APPLY = process.argv.includes('--apply')
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }
const sql = neon(process.env.DATABASE_URL)

// Tier A — exact duplicates from the two botched import batches. Keep lower id.
const CLEAN_DELETES = [
  // NC 2026-04-01 "Tier 3 Triage" double-insert (+20 id offset)
  { drop: 264, keep: 244, name: 'Atlas Precision Plastics' },
  { drop: 266, keep: 246, name: 'Mack Molding (Statesville NC)' },
  { drop: 267, keep: 247, name: 'Sapona Plastics' },
  { drop: 268, keep: 248, name: 'Sarstedt' },
  { drop: 269, keep: 249, name: 'Charlotte Pipe & Foundry' },
  { drop: 270, keep: 250, name: 'Core Technology Molding' },
  { drop: 271, keep: 251, name: 'Greiner Bio-One' },
  { drop: 272, keep: 252, name: 'Wilbert Plastic Services' },
  { drop: 273, keep: 253, name: 'Bemis Manufacturing (Lenoir NC)' },
  { drop: 274, keep: 254, name: 'Alliance Precision Plastics' },
  { drop: 275, keep: 255, name: 'Ameritech Die and Mold' },
  { drop: 277, keep: 257, name: 'Aptar' },
  { drop: 278, keep: 258, name: 'Schaefer Systems Intl' },
  { drop: 279, keep: 259, name: 'Sonoco Plastics' },
  { drop: 280, keep: 260, name: 'Blue Ridge Molding' },
  { drop: 281, keep: 261, name: 'Raleigh Precision Products' },
  { drop: 282, keep: 262, name: 'Pencell Plastics' },
  // Montana 2026-04-04 double-insert (~6 min apart; each has 1 seeded activity row)
  { drop: 849, keep: 843, name: 'Plastic Design & Mfg' },
  { drop: 850, keep: 844, name: 'Diversified Plastics (MT)' },
  { drop: 851, keep: 845, name: 'Northern Plastics' },
  { drop: 852, keep: 846, name: 'West Paw' },
  { drop: 853, keep: 847, name: 'Blackhawk / Revelyst' },
  { drop: 854, keep: 848, name: 'Steel Reality Molding' },
]

// Tier C — near-empty / mis-located second entry of a company already
// represented by a richer row. Different city/state, so flagged for review.
const REVIEW_DELETES = [
  { drop: 630, keep: 98,  name: 'Clack Corporation',          reason: '630 Rogers AR sc=2 phantom; 98 Windsor WI is canonical (founded 1946)' },
  { drop: 776, keep: 5,   name: 'Husky Technologies',         reason: '776 Milton VT sc=14 dup of canonical infrastructure partner row 5 (Bolton ON, exempt)' },
  { drop: 315, keep: 137, name: 'Minnesota Rubber & Plastics', reason: '315 Minneapolis MN empty stub (sc=9, no data); 137 River Falls WI carries CWP + score 50' },
  { drop: 167, keep: 293, name: 'Pioneer Plastics',           reason: '167 empty WI stub (sc=0, no city/data); 293 St Paul MN is the real row' },
]

async function reassignAndDelete({ drop, keep, name, reason }, tier) {
  const [row] = await sql`SELECT id FROM prospect_companies WHERE id = ${drop}`
  if (!row) { console.log(`  [${drop}] ${name}: already gone — skip`); return false }
  const [kp] = await sql`SELECT id FROM prospect_companies WHERE id = ${keep}`
  if (!kp) { console.log(`  [${drop}] ${name}: KEEP row ${keep} missing — ABORT this pair`); return false }

  // What's attached to the row we're dropping?
  const [c] = await sql`SELECT
    (SELECT COUNT(*) FROM prospect_contacts WHERE prospect_id=${drop})::int AS contacts,
    (SELECT COUNT(*) FROM prospect_attachments WHERE prospect_id=${drop})::int AS attach,
    (SELECT COUNT(*) FROM prospect_activity_log WHERE prospect_id=${drop})::int AS activity,
    (SELECT COUNT(*) FROM prospect_tasks WHERE prospect_id=${drop})::int AS tasks,
    (SELECT COUNT(*) FROM opportunities WHERE source_prospect_id=${drop})::int AS opps`
  console.log(`  [${drop}] -> keep [${keep}]  ${name}  drop-attached[c${c.contacts} a${c.attach} l${c.activity} t${c.tasks} o${c.opps}]${reason ? `\n        ${reason}` : ''}`)
  if (!APPLY) return true

  // Re-point real attached data onto the kept row (CASCADE would wipe it otherwise).
  await sql`UPDATE prospect_attachments SET prospect_id = ${keep} WHERE prospect_id = ${drop}`
  await sql`UPDATE prospect_tasks       SET prospect_id = ${keep} WHERE prospect_id = ${drop}`
  await sql`UPDATE prospect_contacts    SET prospect_id = ${keep} WHERE prospect_id = ${drop}`
  await sql`UPDATE opportunities        SET source_prospect_id = ${keep} WHERE source_prospect_id = ${drop}`
  // Activity log: move only entries whose text isn't already on the kept row
  // (avoids duplicating the identical seeded suggested_next_step entry); the
  // rest cascade away with the delete.
  await sql`UPDATE prospect_activity_log d SET prospect_id = ${keep}
            WHERE d.prospect_id = ${drop}
              AND NOT EXISTS (SELECT 1 FROM prospect_activity_log k
                              WHERE k.prospect_id = ${keep} AND k.entry_text = d.entry_text)`
  await sql`DELETE FROM prospect_companies WHERE id = ${drop}`
  console.log(`        ✓ deleted ${drop}`)
  return true
}

console.log(`${APPLY ? '── APPLY ──' : '── DRY-RUN ──'}`)
console.log(`\n=== Tier A — clean exact-duplicate deletes (${CLEAN_DELETES.length}) ===`)
let nA = 0
for (const d of CLEAN_DELETES) if (await reassignAndDelete(d, 'A')) nA++

console.log(`\n=== Tier C — review deletes: near-empty/mis-located second entries (${REVIEW_DELETES.length}) ===`)
let nC = 0
for (const d of REVIEW_DELETES) if (await reassignAndDelete(d, 'C')) nC++

const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM prospect_companies`
console.log(`\nPlanned deletes: ${nA} (Tier A) + ${nC} (Tier C) = ${nA + nC}. Current row count: ${n}.`)
console.log(APPLY ? 'Done.' : 'Dry-run only. Re-run with --apply to write.')
