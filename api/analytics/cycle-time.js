import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    const result = await sql`
      WITH cycle_times AS (
        SELECT
          o.id,
          DATE_TRUNC('month', o.created_at) as month,
          EXTRACT(DAY FROM
            MIN(CASE WHEN st.to_stage = 'active' THEN st.transitioned_at END) -
            MIN(CASE WHEN st.to_stage = 'lead' THEN st.transitioned_at END)
          ) as days_to_active
        FROM opportunities o
        JOIN stage_transitions st ON o.id = st.opportunity_id
        WHERE o.stage IN ('active', 'complete')
        GROUP BY o.id, DATE_TRUNC('month', o.created_at)
      )
      SELECT month, ROUND(AVG(days_to_active)) as avg_cycle_time
      FROM cycle_times
      WHERE days_to_active IS NOT NULL
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error fetching cycle time:', error)
    return res.status(500).json({ error: error.message })
  }
}
