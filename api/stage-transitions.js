import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)

  // POST - Create new stage transition
  if (req.method === 'POST') {
    try {
      const { opportunity_id, from_stage, to_stage, transitioned_by } = req.body

      if (!opportunity_id || !to_stage) {
        return res.status(400).json({ error: 'opportunity_id and to_stage are required' })
      }

      const result = await sql`
        INSERT INTO stage_transitions (opportunity_id, from_stage, to_stage, transitioned_by)
        VALUES (${opportunity_id}, ${from_stage || null}, ${to_stage}, ${transitioned_by || 'system'})
        RETURNING *
      `

      return res.status(201).json(result[0])
    } catch (error) {
      console.error('Error creating stage transition:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  // GET - Fetch transitions for an opportunity
  if (req.method === 'GET') {
    const { opportunity_id } = req.query

    try {
      if (opportunity_id) {
        const result = await sql`
          SELECT * FROM stage_transitions
          WHERE opportunity_id = ${opportunity_id}
          ORDER BY transitioned_at DESC
        `
        return res.status(200).json(result)
      } else {
        const result = await sql`
          SELECT * FROM stage_transitions
          ORDER BY transitioned_at DESC
          LIMIT 100
        `
        return res.status(200).json(result)
      }
    } catch (error) {
      console.error('Error fetching stage transitions:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
