import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    const result = await sql`
      SELECT to_stage, COUNT(DISTINCT opportunity_id) as count
      FROM stage_transitions
      GROUP BY to_stage
      ORDER BY CASE to_stage
        WHEN 'lead' THEN 1
        WHEN 'qualified' THEN 2
        WHEN 'proposal' THEN 3
        WHEN 'negotiation' THEN 4
        WHEN 'active' THEN 5
        WHEN 'complete' THEN 6
      END
    `

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error fetching funnel data:', error)
    return res.status(500).json({ error: error.message })
  }
}
