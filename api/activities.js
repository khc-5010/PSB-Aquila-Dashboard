import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)

  // GET: Fetch activities for an opportunity
  if (req.method === 'GET') {
    const { opportunity_id } = req.query

    if (!opportunity_id) {
      res.status(400).json({ error: 'opportunity_id is required' })
      return
    }

    try {
      const activities = await sql`
        SELECT id, activity_date, description, created_by
        FROM activities
        WHERE opportunity_id = ${opportunity_id}
        ORDER BY activity_date DESC
      `

      res.status(200).json(activities)
    } catch (error) {
      console.error('Error fetching activities:', error)
      res.status(500).json({ error: error.message })
    }
    return
  }

  // POST: Create a new activity
  if (req.method === 'POST') {
    const { opportunity_id, description, created_by } = req.body

    if (!opportunity_id || !description) {
      res.status(400).json({ error: 'opportunity_id and description are required' })
      return
    }

    try {
      const result = await sql`
        INSERT INTO activities (opportunity_id, activity_date, description, created_by)
        VALUES (${opportunity_id}, NOW(), ${description}, ${created_by || 'system'})
        RETURNING id, activity_date, description, created_by
      `

      res.status(201).json(result[0])
    } catch (error) {
      console.error('Error creating activity:', error)
      res.status(500).json({ error: error.message })
    }
    return
  }

  // Method not allowed
  res.status(405).json({ error: 'Method not allowed' })
}
