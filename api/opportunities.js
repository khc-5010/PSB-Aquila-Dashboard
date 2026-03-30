import { neon } from '@neondatabase/serverless'

const VALID_STAGES = ['channel_routing', 'client_readiness', 'project_setup', 'active', 'complete']

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)

  // Ensure source_prospect_id column exists (idempotent)
  try {
    await sql`
      ALTER TABLE opportunities
      ADD COLUMN IF NOT EXISTS source_prospect_id INTEGER REFERENCES prospect_companies(id)
    `
  } catch (e) {
    // Column may already exist or table structure differs — non-fatal
    console.log('source_prospect_id migration note:', e.message)
  }

  // GET - Fetch all opportunities
  if (req.method === 'GET') {
    try {
      const opportunities = await sql`
        SELECT o.*,
          pc.company as source_prospect_name
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
        company_name, description, project_type, stage = 'channel_routing',
        owner, est_value, source, psb_relationship, next_action,
        source_prospect_id,
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
          source_prospect_id, created_at, updated_at
        ) VALUES (
          ${company_name.trim()}, ${description || null}, ${project_type || null}, ${stage},
          ${owner || null}, ${est_value || null}, ${source || null},
          ${psb_relationship || null}, ${next_action || null},
          ${source_prospect_id || null}, NOW(), NOW()
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
