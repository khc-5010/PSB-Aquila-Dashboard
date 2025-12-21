import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)

  // GET - Fetch all opportunities
  if (req.method === 'GET') {
    try {
      const opportunities = await sql`
        SELECT * FROM opportunities
        ORDER BY updated_at DESC
      `

      console.log('Fetched opportunities:', opportunities.length, 'records')
      res.status(200).json(opportunities)
    } catch (error) {
      console.error('Error fetching opportunities:', error)
      res.status(500).json({ error: error.message })
    }
    return
  }

  // POST - Create new opportunity
  if (req.method === 'POST') {
    try {
      const {
        company_name,
        description,
        project_type = 'TBD',
        stage = 'lead',
        owner,
        est_value,
        source,
        psb_relationship,
      } = req.body

      // Validate required fields
      if (!company_name || !company_name.trim()) {
        res.status(400).json({ error: 'company_name is required' })
        return
      }

      const result = await sql`
        INSERT INTO opportunities (
          company_name,
          description,
          project_type,
          stage,
          owner,
          est_value,
          source,
          psb_relationship,
          created_at,
          updated_at
        ) VALUES (
          ${company_name.trim()},
          ${description || null},
          ${project_type},
          ${stage},
          ${owner || null},
          ${est_value || null},
          ${source || null},
          ${psb_relationship || null},
          NOW(),
          NOW()
        )
        RETURNING *
      `

      console.log('Created opportunity:', result[0])
      res.status(201).json(result[0])
    } catch (error) {
      console.error('Error creating opportunity:', error)
      res.status(500).json({ error: error.message })
    }
    return
  }

  // Method not allowed
  res.status(405).json({ error: 'Method not allowed' })
}
