import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)

  // GET - Fetch all opportunities
  if (req.method === 'GET') {
    try {
      const opportunities = await sql`
        SELECT * FROM opportunities ORDER BY updated_at DESC
      `

      // Map database column names to frontend field names
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
        company_name, description, project_type = 'TBD', stage = 'lead',
        owner, est_value, source, psb_relationship, next_action,
      } = req.body

      if (!company_name?.trim()) {
        return res.status(400).json({ error: 'company_name is required' })
      }

      const result = await sql`
        INSERT INTO opportunities (
          company_name, description, project_type, stage, owner,
          estimated_value, source, psb_relationship, next_action, created_at, updated_at
        ) VALUES (
          ${company_name.trim()}, ${description || null}, ${project_type}, ${stage},
          ${owner || null}, ${est_value || null}, ${source || null},
          ${psb_relationship || null}, ${next_action || null}, NOW(), NOW()
        )
        RETURNING *
      `
      return res.status(201).json(result[0])
    } catch (error) {
      console.error('Error creating opportunity:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
