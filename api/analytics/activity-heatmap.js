import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    const result = await sql`
      SELECT
        DATE(activity_date) as date,
        EXTRACT(DOW FROM activity_date) as day_of_week,
        COUNT(*) as count
      FROM activities
      WHERE activity_date > NOW() - INTERVAL '12 weeks'
      GROUP BY DATE(activity_date), EXTRACT(DOW FROM activity_date)
      ORDER BY date
    `

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error fetching activity heatmap:', error)
    return res.status(500).json({ error: error.message })
  }
}
