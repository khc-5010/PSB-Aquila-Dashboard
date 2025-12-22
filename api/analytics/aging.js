import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    const result = await sql`
      SELECT
        o.id, o.company_name, o.stage,
        COALESCE(
          EXTRACT(DAY FROM NOW() - MAX(a.activity_date)),
          EXTRACT(DAY FROM NOW() - o.created_at)
        ) as days_since_activity
      FROM opportunities o
      LEFT JOIN activities a ON o.id = a.opportunity_id
      WHERE o.stage NOT IN ('complete')
      GROUP BY o.id, o.company_name, o.stage, o.created_at
      HAVING COALESCE(
        EXTRACT(DAY FROM NOW() - MAX(a.activity_date)),
        EXTRACT(DAY FROM NOW() - o.created_at)
      ) > 7
      ORDER BY days_since_activity DESC
      LIMIT 10
    `

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error fetching aging data:', error)
    return res.status(500).json({ error: error.message })
  }
}
