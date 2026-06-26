#!/usr/bin/env node
/**
 * Fold "MWV Calmar" (id 459) under "Silgan Dispensing" (id 917).
 *
 * Corporate history (per Brett): MeadWestvaco/Calmar's dispensing business went to
 * WestRock, then in 2017 WestRock sold it (incl. Calmar) to Silgan Holdings for
 * $1.025B — it is now Silgan Dispensing Systems. So MWV Calmar is an absorbed
 * predecessor of our "Silgan Dispensing" record.
 *
 * MWV was ALREADY typed `parent_relationship_kind='absorbed_into'`, but its
 * parent_company string was "Silgan Dispensing Systems" while the actual row is
 * named "Silgan Dispensing" — that mismatch is why the client-side parent grouping
 * never linked them and MWV rendered standalone. The fix is a single field:
 * parent_company -> "Silgan Dispensing" (the exact company name of id 917), which
 * makes MWV nest under Silgan Dispensing as an absorbed child (next to Silgan
 * Specialty Packaging, which already points there). MWV's data — notably its 9 CWP
 * contacts, the strongest MO relationship — is preserved on the child row, exactly
 * what `absorbed_into` is for.
 *
 * The parent-company GROUPING (ProspectTable) reads these fields directly, so the
 * fold is immediate. The Knowledge-Graph `absorbed_into` edge reconciles on the
 * next Layer-1 ontology rebuild (POST ?action=rebuild-ontology-layer1, or any
 * bulk import) — same pattern as the other raw-SQL data ops; not required for the
 * table grouping Brett asked about.
 *
 *   node scripts/fold-mwv-into-silgan.mjs            # dry-run
 *   node scripts/fold-mwv-into-silgan.mjs --apply    # write
 */
import { neon } from '@neondatabase/serverless'

const APPLY = process.argv.includes('--apply')
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }
const sql = neon(process.env.DATABASE_URL)

const MWV_ID = 459
const PARENT_NAME = 'Silgan Dispensing'

const [mwv] = await sql`SELECT id, company, parent_company, parent_relationship_kind, former_names, cwp_contacts FROM prospect_companies WHERE id = ${MWV_ID}`
if (!mwv) { console.error(`Prospect ${MWV_ID} (MWV Calmar) not found.`); process.exit(1) }
const [parent] = await sql`SELECT id, company FROM prospect_companies WHERE LOWER(TRIM(company)) = ${PARENT_NAME.toLowerCase()}`
if (!parent) { console.error(`Parent "${PARENT_NAME}" not found — aborting (won't point at a missing row).`); process.exit(1) }

console.log(`${APPLY ? '── APPLY ──' : '── DRY-RUN ──'}`)
console.log(`MWV Calmar [${mwv.id}]: parent_company="${mwv.parent_company}" kind=${mwv.parent_relationship_kind} cwp=${mwv.cwp_contacts} former_names=${JSON.stringify(mwv.former_names)}`)
console.log(`Parent target: [${parent.id}] "${parent.company}"`)

if (mwv.parent_company === PARENT_NAME) {
  console.log(`\nAlready pointed at "${PARENT_NAME}" — no-op.`)
} else {
  console.log(`\nChange: parent_company "${mwv.parent_company}" -> "${PARENT_NAME}"  (kind stays absorbed_into; data untouched)`)
  if (APPLY) {
    await sql`UPDATE prospect_companies
              SET parent_company = ${PARENT_NAME}, last_edited_by = 'Kyle', updated_at = NOW()
              WHERE id = ${MWV_ID} AND parent_company IS DISTINCT FROM ${PARENT_NAME}`
    console.log('  ✓ updated')
  }
}

// Show the resulting absorbed-child set that will group under Silgan Dispensing.
const children = await sql`
  SELECT id, company, parent_relationship_kind FROM prospect_companies
  WHERE LOWER(TRIM(parent_company)) = ${PARENT_NAME.toLowerCase()}
    AND parent_relationship_kind IN ('subsidiary','absorbed_into')
  ORDER BY company`
console.log(`\nAbsorbed/subsidiary children now pointing at "${parent.company}" [${parent.id}]:`)
for (const c of children) console.log(`  [${c.id}] ${c.company} (${c.parent_relationship_kind})`)
console.log(`\n${APPLY ? 'Done. (Run a Layer-1 ontology rebuild to reconcile the KG edge.)' : 'Dry-run only. Re-run with --apply to write.'}`)
