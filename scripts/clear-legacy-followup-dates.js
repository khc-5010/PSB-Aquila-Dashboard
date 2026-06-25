#!/usr/bin/env node
/**
 * Clear the leftover `prospect_companies.follow_up_date` "fossils".
 *
 * Context: `follow_up_date` was the old, pre-task forward-looking signal. Its UI editor
 * was removed when tasks (with their own due_dates) replaced it, and
 * scripts/migrate-followup-to-tasks.js created a task per row but left the date populated.
 * getProspectUrgency used to read those dates and surfaced promoted/parked companies as
 * phantom "Nd overdue" in Needs Attention + the daily digest, with no way to clear them
 * (Brett's Silgan Dispensing report).
 *
 * getProspectUrgency no longer reads follow_up_date at all, so this cleanup is the final
 * tidy-up: it nulls the leftover values so they stop appearing in CSV/JSON exports too.
 *
 * IMPORTANT: this does NOT touch updated_at. follow_up_date is unrelated to real activity,
 * and bumping updated_at would reset Tier-2 staleness detection on these rows. The column
 * itself is kept in the schema for CSV/export round-trips.
 *
 * Usage:
 *   node scripts/clear-legacy-followup-dates.js            # dry-run (prints what would clear)
 *   node scripts/clear-legacy-followup-dates.js --apply    # actually nulls the dates
 *
 * Requires DATABASE_URL in the environment.
 */

import { neon } from '@neondatabase/serverless'

const APPLY = process.argv.includes('--apply')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in the environment.')
    process.exit(1)
  }
  const sql = neon(process.env.DATABASE_URL)

  console.log(APPLY ? '╶─ Clear follow_up_date: APPLY mode ──╴' : '╶─ Clear follow_up_date: DRY-RUN mode (no writes) ──╴')

  const rows = await sql`
    SELECT id, company, prospect_status, follow_up_date
    FROM prospect_companies
    WHERE follow_up_date IS NOT NULL
    ORDER BY follow_up_date ASC
  `

  if (rows.length === 0) {
    console.log('\nNo prospects with follow_up_date — nothing to clear.')
    return
  }

  console.log(`\nFound ${rows.length} row(s) with a leftover follow_up_date (snapshot for rollback):\n`)
  for (const r of rows) {
    const d = r.follow_up_date instanceof Date
      ? r.follow_up_date.toISOString().slice(0, 10)
      : String(r.follow_up_date).slice(0, 10)
    console.log(`  • [${r.id}] ${r.company} (${r.prospect_status}) — follow_up_date: ${d}`)
  }

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with `--apply` to null these dates.\n')
    return
  }

  // Single set-based UPDATE; updated_at deliberately untouched.
  const cleared = await sql`
    UPDATE prospect_companies
    SET follow_up_date = NULL
    WHERE follow_up_date IS NOT NULL
    RETURNING id
  `
  console.log(`\n✓ Cleared follow_up_date on ${cleared.length} row(s). updated_at left untouched.\n`)
}

main().catch(err => {
  console.error('Cleanup error:', err)
  process.exit(1)
})
