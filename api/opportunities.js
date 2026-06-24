import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/requireAuth.js'

// SYNC: pipeline stages — mirrored in src/constants/pipeline.js (PIPELINE_STAGES),
// src/constants/options.js (STAGES), and api/opportunities/[id].js (VALID_STAGES).
const VALID_STAGES = ['on_deck', 'outreach', 'channel_routing', 'client_readiness', 'project_setup', 'active', 'complete']

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
  try {
    await ensureStageEnumValues(sql)
  } catch (e) {
    // Non-fatal: stage may be a plain text column, or values may already exist.
    console.log('stage enum ensure note:', e.message)
  }
  // Best-effort, once per warm instance. DDL persists, so a later cold start
  // retries anything that failed transiently here.
  schemaEnsured = true
}

// `opportunities.stage` (and the stage_transitions stage columns) are backed by
// a Postgres ENUM. The two new front stages must be added to that enum type or
// INSERT/PATCH with 'on_deck'/'outreach' fails with "invalid input value for
// enum stage". Each ALTER runs as its own neon HTTP statement (autocommit), which
// sidesteps the "ALTER TYPE ADD VALUE cannot run inside a transaction block"
// restriction. Idempotent via ADD VALUE IF NOT EXISTS; a no-op if stage is text.
async function ensureStageEnumValues(sql) {
  const rows = await sql`
    SELECT DISTINCT t.typname
    FROM pg_type t
    JOIN pg_attribute a ON a.atttypid = t.oid
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE t.typtype = 'e'
      AND (
        (c.relname = 'opportunities' AND a.attname = 'stage')
        OR (c.relname = 'stage_transitions' AND a.attname IN ('from_stage', 'to_stage'))
      )
  `
  for (const { typname } of rows) {
    // typname comes from pg_catalog, but validate as an identifier before
    // interpolating (ALTER TYPE can't be parameterized). Looping VALID_STAGES
    // (vetted ^[a-z_]+$ constants) means a future stage is covered for free —
    // existing values are a harmless no-op via ADD VALUE IF NOT EXISTS.
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(typname)) continue
    for (const val of VALID_STAGES) {
      if (!/^[a-z_]+$/.test(val)) continue
      await sql.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS '${val}'`)
    }
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
