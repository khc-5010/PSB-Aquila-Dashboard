#!/usr/bin/env node
/**
 * Migrate existing `prospect_companies.follow_up_date` values to `prospect_tasks` rows.
 *
 * The new task entity (Threads 2+3) supersedes follow_up_date for forward-looking work.
 * Only 3 prospects in production have follow_up_date set, so this is a small, opt-in
 * migration. It creates a task per row but deliberately leaves follow_up_date in place.
 *
 * NOTE: leaving the date populated later caused "fossils" — getProspectUrgency used to
 * read follow_up_date (Tier 1) and pinned promoted/parked companies into phantom
 * "Nd overdue" entries in Needs Attention + the digest with no UI to clear them (Brett's
 * Silgan Dispensing report). getProspectUrgency no longer reads follow_up_date at all
 * (date-urgency lives on tasks now), and scripts/clear-legacy-followup-dates.js clears the
 * leftover values. follow_up_date stays in the schema for CSV/export round-trips only.
 *
 * Usage:
 *   node scripts/migrate-followup-to-tasks.js              # dry-run (prints proposed tasks, no writes)
 *   node scripts/migrate-followup-to-tasks.js --apply      # actually inserts task rows
 *
 * Requires DATABASE_URL in the environment.
 */

import { neon } from '@neondatabase/serverless'

const APPLY = process.argv.includes('--apply')

const FORWARD_INTENT_KEYWORDS = [
  'follow', 'contact', 'reach', 'schedule', 'send', 'call', 'email', 'meet',
  'arrange', 'set up', 'connect', 'next step', 'reach out', 'plan',
]

function looksForwardLooking(text) {
  if (!text) return false
  const lower = text.trim().toLowerCase()
  return FORWARD_INTENT_KEYWORDS.some(kw => lower.startsWith(kw) || lower.includes(' ' + kw))
}

function buildTaskDescription(prospect) {
  const step = (prospect.suggested_next_step || '').trim()
  if (step && looksForwardLooking(step)) return step
  return `Follow up with ${prospect.company}`
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in the environment.')
    process.exit(1)
  }
  const sql = neon(process.env.DATABASE_URL)

  console.log(APPLY ? '╶─ Migration: APPLY mode ──╴' : '╶─ Migration: DRY-RUN mode (no writes) ──╴')

  const candidates = await sql`
    SELECT id, company, follow_up_date, suggested_next_step
    FROM prospect_companies
    WHERE follow_up_date IS NOT NULL
    ORDER BY follow_up_date ASC
  `

  if (candidates.length === 0) {
    console.log('\nNo prospects with follow_up_date — nothing to migrate.')
    return
  }

  console.log(`\nFound ${candidates.length} candidate prospect(s):\n`)

  const planned = candidates.map(p => ({
    prospect_id: p.id,
    company: p.company,
    description: buildTaskDescription(p),
    due_date: p.follow_up_date instanceof Date
      ? p.follow_up_date.toISOString().slice(0, 10)
      : String(p.follow_up_date).slice(0, 10),
    sourceField: (p.suggested_next_step || '').trim() ? 'suggested_next_step' : 'company name fallback',
  }))

  for (const t of planned) {
    console.log(`  • Prospect ${t.prospect_id} — ${t.company}`)
    console.log(`      due_date  : ${t.due_date}`)
    console.log(`      description: ${t.description}`)
    console.log(`      source    : ${t.sourceField}`)
    console.log('')
  }

  if (!APPLY) {
    console.log('Dry-run complete. Re-run with `--apply` to insert these tasks.\n')
    return
  }

  console.log('Inserting tasks...\n')
  const results = []
  for (const t of planned) {
    try {
      const [row] = await sql`
        INSERT INTO prospect_tasks (prospect_id, description, due_date, assignee, status, created_by)
        VALUES (${t.prospect_id}, ${t.description}, ${t.due_date}, NULL, 'open', 'Migration (follow_up_date)')
        RETURNING id, prospect_id, description, due_date
      `
      // Audit-trail activity log entry, matching the lifecycle log lines emitted
      // by the live ?action=tasks POST handler.
      await sql`
        INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
        VALUES (${t.prospect_id}, ${'Task created: ' + t.description + ' (migrated from follow_up_date)'}, 'Migration (follow_up_date)')
      `
      results.push({ ok: true, ...row, company: t.company })
    } catch (err) {
      results.push({ ok: false, prospect_id: t.prospect_id, company: t.company, error: err.message })
    }
  }

  console.log('\n╶─ Results ──╴')
  for (const r of results) {
    if (r.ok) console.log(`  ✓ Task id=${r.id} created for prospect ${r.prospect_id} (${r.company})`)
    else      console.log(`  ✗ Prospect ${r.prospect_id} (${r.company}): ${r.error}`)
  }

  const ok = results.filter(r => r.ok).length
  const failed = results.length - ok
  console.log(`\n${ok}/${results.length} task(s) created, ${failed} failed.\n`)
}

main().catch(err => {
  console.error('Migration error:', err)
  process.exit(1)
})
