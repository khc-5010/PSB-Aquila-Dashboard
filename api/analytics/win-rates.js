import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    const result = await sql`
      SELECT
        project_type,
        COUNT(*) FILTER (WHERE outcome = 'won') as won,
        COUNT(*) FILTER (WHERE outcome IS NOT NULL) as total,
        ROUND(
          COUNT(*) FILTER (WHERE outcome = 'won')::numeric /
          NULLIF(COUNT(*) FILTER (WHERE outcome IS NOT NULL), 0) * 100
        ) as win_rate
      FROM opportunities
      GROUP BY project_type
      HAVING COUNT(*) FILTER (WHERE outcome IS NOT NULL) > 0
    `

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error fetching win rates:', error)
    return res.status(500).json({ error: error.message })
  }
}
