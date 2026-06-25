import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/requireAuth.js'

// SYNC: pipeline stages — mirrored in src/constants/pipeline.js (PIPELINE_STAGES),
// src/constants/options.js (STAGES), and api/opportunities/[id].js (VALID_STAGES).
const VALID_STAGES = ['on_deck', 'outreach', 'channel_routing', 'client_readiness', 'project_setup', 'active', 'complete']

// SYNC: project types — mirrors PROJECT_TYPES values in src/constants/pipeline.js.
// project_type is also a Postgres ENUM (with stale legacy values like 'research',
// 'senior_design' — see PROJECT_TYPE_MAP in [id].js), so the app's display values
// must be added to the type or INSERT/PATCH raises "invalid input value for enum
// project_type".
const VALID_PROJECT_TYPES = ['Pilot Project', 'Research Agreement', 'Senior Design', 'Strategic Membership']

// Guarded one-time schema ensure: runs once per warm instance, not on every
// request. The old per-request unguarded ALTER was the antipattern flagged in
// the June QA audit. lead_type ('client'|'partner') and waiting_on ('us'|'them')
// back the Pipeline Activation feature.
let schemaEnsured = false
async function ensureOpportunitySchema(sql) {
  if (schemaEnsured) return
  try {
    await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_prospect_id INTEGER REFERENCES prospect_companies(id)`
    await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_type TEXT`
    await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS waiting_on TEXT`
  } catch (e) {
    // Non-fatal: columns may already exist or the table differs.
    console.log('opportunity column ensure note:', e.message)
  }
  // Two-step, separate try blocks so one failing never skips the other; both are
  // idempotent and converge to no-ops. (1) Add the app's values to the legacy
  // enums — the immediate fix, guarantees promotes work even if (2) hiccups.
  // (2) Convert those columns to TEXT — the durable fix that ends the enum drift.
  try {
    await ensureEnumValues(sql)
  } catch (e) {
    console.log('enum value ensure note:', e.message)
  }
  try {
    await convertEnumColumnsToText(sql)
  } catch (e) {
    console.log('enum->text conversion note:', e.message)
  }
  // Best-effort, once per warm instance. DDL persists, so a later cold start
  // retries anything that failed transiently here.
  schemaEnsured = true
}

// Transitional step 1 — make the legacy enums accept the app's values. `stage`
// and `project_type` are Postgres ENUMs whose value lists drifted from the app
// (new stages; project_type still carries legacy values like 'research'). Until
// step 2 converts them to TEXT, INSERT/PATCH with a missing value fails with
// "invalid input value for enum ...". Each ALTER runs as its own neon HTTP
// statement (autocommit), sidestepping the "ALTER TYPE ADD VALUE cannot run inside
// a transaction block" restriction. Idempotent via ADD VALUE IF NOT EXISTS; a
// no-op once the column is TEXT.
async function addEnumValues(sql, table, column, values) {
  const rows = await sql`
    SELECT t.typname
    FROM pg_type t
    JOIN pg_attribute a ON a.atttypid = t.oid
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE t.typtype = 'e' AND c.relname = ${table} AND a.attname = ${column}
    LIMIT 1
  `
  const typname = rows[0]?.typname
  // typname is from pg_catalog, but validate as an identifier before
  // interpolating (ALTER TYPE accepts neither bound params nor a quoted-elsewhere
  // name). Values are trusted module constants; escape quotes defensively anyway.
  if (!typname || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(typname)) return
  for (const val of values) {
    const safe = String(val).replace(/'/g, "''")
    await sql.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS '${safe}'`)
  }
}

async function ensureEnumValues(sql) {
  await addEnumValues(sql, 'opportunities', 'stage', VALID_STAGES)
  await addEnumValues(sql, 'stage_transitions', 'from_stage', VALID_STAGES)
  await addEnumValues(sql, 'stage_transitions', 'to_stage', VALID_STAGES)
  await addEnumValues(sql, 'opportunities', 'project_type', VALID_PROJECT_TYPES)
}

// Durable step 2 — convert the legacy enum columns to TEXT. This ends the enum
// drift for good: TEXT matches the newer lead_type/waiting_on columns, and the
// app's dropdowns + VALID_STAGES become the single source of valid values. Unlike
// ALTER TYPE ADD VALUE, ALTER TABLE ... ALTER COLUMN TYPE is fully transactional
// (no caveat). Guarded per column via information_schema; a no-op once the column
// is already TEXT (or absent). Table/column names are hardcoded constants below.
const TEXT_CONVERSION_TARGETS = [
  { table: 'opportunities', column: 'stage', default: 'on_deck' },
  { table: 'opportunities', column: 'project_type', default: null },
  { table: 'opportunities', column: 'outcome', default: null },
  { table: 'stage_transitions', column: 'from_stage', default: null },
  { table: 'stage_transitions', column: 'to_stage', default: null },
]
async function convertEnumColumnsToText(sql) {
  for (const { table, column, default: def } of TEXT_CONVERSION_TARGETS) {
    const rows = await sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
      LIMIT 1
    `
    // USER-DEFINED == enum here; skip if already text, or the column is absent.
    if (rows[0]?.data_type !== 'USER-DEFINED') continue
    await sql.query(`ALTER TABLE ${table} ALTER COLUMN ${column} DROP DEFAULT`)
    await sql.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE TEXT USING ${column}::text`)
    if (def) await sql.query(`ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT '${def}'`)
  }
}

export default async function handler(req, res) {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const sql = neon(process.env.DATABASE_URL)

  await ensureOpportunitySchema(sql)

  // GET - Fetch all opportunities
  if (req.method === 'GET') {
    try {
      const opportunities = await sql`
        SELECT o.*,
          pc.company as source_prospect_name,
          (SELECT MAX(a.activity_date) FROM activities a WHERE a.opportunity_id = o.id) as last_activity_at
        FROM opportunities o
        LEFT JOIN prospect_companies pc ON pc.id = o.source_prospect_id
        ORDER BY o.updated_at DESC
      `

      const mapped = opportunities.map(row => ({
        ...row,
        est_value: row.estimated_value,
      }))

      return res.status(200).json(mapped)
    } catch (error) {
      console.error('Error fetching opportunities:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  // POST - Create new opportunity
  if (req.method === 'POST') {
    try {
      const {
        company_name, description, project_type, stage = 'on_deck',
        owner, est_value, source, psb_relationship, next_action,
        source_prospect_id, lead_type, waiting_on,
      } = req.body

      if (!company_name?.trim()) {
        return res.status(400).json({ error: 'company_name is required' })
      }

      if (stage && !VALID_STAGES.includes(stage)) {
        return res.status(400).json({ error: `Invalid stage: ${stage}. Valid: ${VALID_STAGES.join(', ')}` })
      }

      const result = await sql`
        INSERT INTO opportunities (
          company_name, description, project_type, stage, owner,
          estimated_value, source, psb_relationship, next_action,
          source_prospect_id, lead_type, waiting_on, created_at, updated_at
        ) VALUES (
          ${company_name.trim()}, ${description || null}, ${project_type || null}, ${stage},
          ${owner || null}, ${est_value || null}, ${source || null},
          ${psb_relationship || null}, ${next_action || null},
          ${source_prospect_id || null}, ${lead_type || null}, ${waiting_on || null}, NOW(), NOW()
        )
        RETURNING *
      `

      const row = result[0]
      return res.status(201).json({ ...row, est_value: row.estimated_value })
    } catch (error) {
      console.error('Error creating opportunity:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  // DELETE - Remove opportunity (used for No Fit off-ramp)
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) {
      return res.status(400).json({ error: 'id query param is required' })
    }

    try {
      // Delete related stage transitions first
      await sql`DELETE FROM stage_transitions WHERE opportunity_id = ${id}`
      // Delete dismissed alerts
      try { await sql`DELETE FROM dismissed_alerts WHERE opportunity_id = ${id}` } catch (e) { /* table may not exist */ }
      // Delete the opportunity
      const result = await sql`DELETE FROM opportunities WHERE id = ${id} RETURNING *`
      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'Opportunity not found' })
      }
      return res.status(200).json({ success: true, deleted: result[0] })
    } catch (error) {
      console.error('Error deleting opportunity:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
