#!/usr/bin/env node
/**
 * Backfill FDA Intelligence snapshots for prospect companies that have never been checked.
 *
 * Why this exists
 * ---------------
 * FDA enrichment in the dashboard is 100% client-side: src/components/prospects/FdaEnrichment.jsx
 * queries the openFDA API straight from the browser and — when a user clicks
 * "Update to Yes (confirmed)" — persists the results as a `prospect_attachments` row with
 * attachment_type = 'fda_snapshot'. There is NO server-side FDA logic, so the only durable
 * marker of "this company has been checked" is the presence of that snapshot attachment.
 *
 * This script replicates the browser's query (same endpoints, same name cascade, same dedup)
 * for every prospect that has no fda_snapshot yet, and writes the snapshot back in the exact
 * JSON shape the UI reads, so the panel shows "Checked on ..." on the next visit.
 *
 * Behavior (per the agreed-upon decisions)
 * ----------------------------------------
 *  - SNAPSHOT-ONLY: it never modifies `medical_device_mfg` or `notes`. Humans still confirm
 *    medical status in the UI (avoids mislabeling on a coincidental FDA name match, which would
 *    shift the company's priority score and trigger an ontology rebuild).
 *  - SAVE-EMPTY-ON-NO-MATCH: companies with zero FDA results still get a snapshot with empty
 *    arrays, so they count as "checked", the run is resumable, and re-runs don't re-spend the
 *    openFDA rate-limit budget on them.
 *
 * Modes
 * -----
 *   node scripts/backfill-fda-snapshots.js              # PLAN: list unchecked companies, no FDA calls, no writes
 *   node scripts/backfill-fda-snapshots.js --dry-run    # query openFDA, print per-company results, NO DB writes
 *   node scripts/backfill-fda-snapshots.js --apply      # query openFDA AND write fda_snapshot rows
 *
 * Flags
 * -----
 *   --limit N      Process at most N companies (sample, or stay under the daily cap; split big runs)
 *   --delay MS     Milliseconds to pause between companies (default 350) to throttle openFDA
 *
 * Environment
 * -----------
 *   DATABASE_URL       (required) Neon connection string
 *   OPENFDA_API_KEY    (optional) openFDA API key. Without a key, openFDA caps at 240 req/min and
 *                      1,000 req/day per IP; with one, 240/min and 120,000/day. Each company costs
 *                      up to 2 requests per searched name (company, also_known_as, parent_company).
 *
 * Requires Node 18+ (global fetch). This repo is ESM ("type": "module").
 */

import { neon } from '@neondatabase/serverless'

const APPLY = process.argv.includes('--apply')
const DRY_RUN = process.argv.includes('--dry-run')

function flagValue(name, fallback) {
  const i = process.argv.indexOf(name)
  if (i === -1 || i === process.argv.length - 1) return fallback
  const v = Number(process.argv[i + 1])
  return Number.isFinite(v) ? v : fallback
}
const LIMIT = flagValue('--limit', null)
const DELAY_MS = flagValue('--delay', 350)
const API_KEY = process.env.OPENFDA_API_KEY || null
const CREATED_BY = 'FDA Backfill (script)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let requestCount = 0

// ── openFDA query helpers — mirror src/components/prospects/FdaEnrichment.jsx exactly ──
// (Keep these aligned with runFdaCheck() in the component so script results match the panel.)

async function fetchFda(url) {
  requestCount++
  const withKey = API_KEY ? `${url}&api_key=${API_KEY}` : url
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(withKey, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return [] // openFDA returns 404 when there are zero matches
    const data = await res.json()
    return data.results || []
  } catch {
    clearTimeout(timeout)
    return []
  }
}

function searchFda510k(name) {
  const encoded = encodeURIComponent(name)
  return fetchFda(`https://api.fda.gov/device/510k.json?search=applicant:${encoded}&limit=10`)
}

function searchFdaRegistration(name) {
  const encoded = encodeURIComponent(name)
  return fetchFda(`https://api.fda.gov/device/registrationlisting.json?search=registration.owner_operator.firm_name:${encoded}&limit=10`)
}

async function runFdaCheck(prospect) {
  const namesToTry = [prospect.company, prospect.also_known_as, prospect.parent_company].filter(Boolean)

  let allClearances = []
  let allFacilities = []

  for (const name of namesToTry) {
    const [clearances, facilities] = await Promise.all([
      searchFda510k(name),
      searchFdaRegistration(name),
    ])
    allClearances.push(...clearances)
    allFacilities.push(...facilities)
  }

  const seen = new Set()
  allClearances = allClearances.filter((c) => {
    if (seen.has(c.k_number)) return false
    seen.add(c.k_number)
    return true
  })

  const seenFac = new Set()
  allFacilities = allFacilities.filter((f) => {
    const key = f.registration?.registration_number
    if (!key || seenFac.has(key)) return false
    seenFac.add(key)
    return true
  })

  return { clearances: allClearances, facilities: allFacilities, searchedNames: namesToTry }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in the environment.')
    process.exit(1)
  }
  if (APPLY && DRY_RUN) {
    console.error('Use either --dry-run or --apply, not both.')
    process.exit(1)
  }

  const sql = neon(process.env.DATABASE_URL)

  const mode = APPLY
    ? 'APPLY (querying openFDA + writing snapshots)'
    : DRY_RUN
    ? 'DRY-RUN (querying openFDA, no writes)'
    : 'PLAN (no FDA calls, no writes)'
  console.log(`╶─ FDA snapshot backfill: ${mode} ──╴`)
  console.log(
    API_KEY
      ? '   openFDA API key: present'
      : '   openFDA API key: NONE (1,000 req/day cap — set OPENFDA_API_KEY to lift it)'
  )

  // Companies with no fda_snapshot attachment yet.
  const unchecked = await sql`
    SELECT p.id, p.company, p.also_known_as, p.parent_company
    FROM prospect_companies p
    LEFT JOIN prospect_attachments a
      ON a.prospect_id = p.id AND a.attachment_type = 'fda_snapshot'
    WHERE a.id IS NULL
    ORDER BY p.company
  `

  console.log(`\nFound ${unchecked.length} company(ies) with no FDA snapshot.`)
  if (unchecked.length === 0) {
    console.log('Nothing to backfill.\n')
    return
  }

  const targets = LIMIT != null ? unchecked.slice(0, LIMIT) : unchecked
  if (LIMIT != null) console.log(`--limit ${LIMIT}: processing the first ${targets.length}.`)

  // PLAN mode — list the work and a request estimate, spend no openFDA budget.
  if (!APPLY && !DRY_RUN) {
    console.log('\nWould check (run with --dry-run to query openFDA, --apply to write):\n')
    for (const p of targets) {
      const extra = [p.also_known_as, p.parent_company].filter(Boolean)
      console.log(`  • [${p.id}] ${p.company}${extra.length ? `  (also searches: ${extra.join(' / ')})` : ''}`)
    }
    const est = targets.reduce(
      (n, p) => n + [p.company, p.also_known_as, p.parent_company].filter(Boolean).length * 2,
      0
    )
    console.log(`\n~${est} openFDA requests estimated for a full run of these ${targets.length} companies.`)
    if (!API_KEY && est > 1000) {
      console.log('⚠ That exceeds the keyless 1,000/day cap — set OPENFDA_API_KEY or split with --limit across days.')
    }
    console.log('')
    return
  }

  // DRY-RUN / APPLY — query openFDA per company (and write in APPLY).
  const results = []
  for (let i = 0; i < targets.length; i++) {
    const p = targets[i]
    let outcome
    try {
      const fda = await runFdaCheck(p)
      const nClear = fda.clearances.length
      const nFac = fda.facilities.length

      if (APPLY) {
        const title = `FDA Snapshot — ${p.company}`
        const content = JSON.stringify({
          clearances: fda.clearances,
          facilities: fda.facilities,
          searchedNames: fda.searchedNames,
          checkedAt: new Date().toISOString(),
        })
        await sql`
          INSERT INTO prospect_attachments (prospect_id, attachment_type, title, content, created_by)
          VALUES (${p.id}, 'fda_snapshot', ${title}, ${content}, ${CREATED_BY})
        `
      }

      outcome = { ok: true, id: p.id, company: p.company, nClear, nFac }
    } catch (err) {
      outcome = { ok: false, id: p.id, company: p.company, error: err.message }
    }
    results.push(outcome)

    const tag = outcome.ok
      ? outcome.nClear || outcome.nFac
        ? `${outcome.nClear} clearance(s), ${outcome.nFac} facility(ies)`
        : 'no matches'
      : `ERROR: ${outcome.error}`
    console.log(`  [${i + 1}/${targets.length}] ${p.company} → ${tag}${APPLY && outcome.ok ? '  ✓ saved' : ''}`)

    if (i < targets.length - 1 && DELAY_MS > 0) await sleep(DELAY_MS)

    // Soft guard for keyless runs nearing the daily cap. Already-saved companies are
    // skipped on the next run, so stopping early is safe and resumable.
    if (!API_KEY && requestCount >= 980) {
      console.log(`\n⚠ Approaching the keyless openFDA daily cap (${requestCount} requests). Stopping early.`)
      console.log('   Re-run later (saved companies are skipped) or set OPENFDA_API_KEY for a 120k/day cap.')
      break
    }
  }

  // Summary
  const withMatches = results.filter((r) => r.ok && (r.nClear || r.nFac)).length
  const noMatches = results.filter((r) => r.ok && !r.nClear && !r.nFac).length
  const failed = results.filter((r) => !r.ok).length
  console.log('\n╶─ Summary ──╴')
  console.log(`  Companies processed : ${results.length}`)
  console.log(`  With FDA matches    : ${withMatches}`)
  console.log(`  No matches          : ${noMatches}`)
  console.log(`  Errors              : ${failed}`)
  console.log(`  openFDA requests    : ${requestCount}`)
  if (APPLY) {
    console.log(`  Snapshots written   : ${results.filter((r) => r.ok).length}`)
  } else {
    console.log('  (DRY-RUN — no snapshots written. Re-run with --apply to persist.)')
  }
  console.log('')
}

main().catch((err) => {
  console.error('Backfill error:', err)
  process.exit(1)
})
