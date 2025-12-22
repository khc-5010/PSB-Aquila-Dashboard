import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    // Run all queries in parallel for performance
    const [
      pipelineValue,
      funnel,
      aging,
      workload,
      heatmap,
      sources,
      projectTypes,
      deadlines,
      winRates,
      cycleTime
    ] = await Promise.all([

      // Pipeline Value by Stage
      sql`
        SELECT stage,
               COALESCE(SUM(estimated_value), 0) as total_value,
               COUNT(*) as count
        FROM opportunities
        WHERE stage NOT IN ('complete')
        GROUP BY stage
      `,

      // Conversion Funnel
      sql`
        SELECT to_stage, COUNT(DISTINCT opportunity_id) as count
        FROM stage_transitions
        GROUP BY to_stage
      `,

      // Aging Report (opportunities with no activity > 7 days)
      sql`
        SELECT
          o.id,
          o.company_name,
          o.stage,
          o.owner,
          COALESCE(
            EXTRACT(DAY FROM NOW() - MAX(a.activity_date)),
            EXTRACT(DAY FROM NOW() - o.created_at)
          )::integer as days_since_activity
        FROM opportunities o
        LEFT JOIN activities a ON o.id = a.opportunity_id
        WHERE o.stage NOT IN ('complete')
        GROUP BY o.id, o.company_name, o.stage, o.owner, o.created_at
        HAVING COALESCE(
          EXTRACT(DAY FROM NOW() - MAX(a.activity_date)),
          EXTRACT(DAY FROM NOW() - o.created_at)
        ) > 7
        ORDER BY days_since_activity DESC
        LIMIT 10
      `,

      // Owner Workload
      sql`
        SELECT owner, stage, COUNT(*) as count
        FROM opportunities
        WHERE stage NOT IN ('complete')
        GROUP BY owner, stage
      `,

      // Activity Heatmap (last 12 weeks)
      sql`
        SELECT
          TO_CHAR(activity_date, 'YYYY-MM-DD') as date,
          EXTRACT(DOW FROM activity_date)::integer as day_of_week,
          COUNT(*) as count
        FROM activities
        WHERE activity_date > NOW() - INTERVAL '12 weeks'
        GROUP BY TO_CHAR(activity_date, 'YYYY-MM-DD'), EXTRACT(DOW FROM activity_date)
        ORDER BY date
      `,

      // Lead Sources
      sql`
        SELECT source, COUNT(*) as count
        FROM opportunities
        WHERE source IS NOT NULL AND source != ''
        GROUP BY source
        ORDER BY count DESC
      `,

      // Project Type Mix
      sql`
        SELECT project_type, COUNT(*) as count
        FROM opportunities
        GROUP BY project_type
      `,

      // Deadlines
      sql`
        SELECT id, name, deadline_date, applies_to, description
        FROM deadlines
        WHERE deadline_date > NOW() - INTERVAL '60 days'
        ORDER BY deadline_date
      `,

      // Win Rates by Project Type
      sql`
        SELECT
          project_type,
          COUNT(*) FILTER (WHERE outcome = 'won') as won,
          COUNT(*) FILTER (WHERE outcome IS NOT NULL) as total
        FROM opportunities
        GROUP BY project_type
        HAVING COUNT(*) FILTER (WHERE outcome IS NOT NULL) > 0
      `,

      // Cycle Time Trends (last 6 months)
      sql`
        WITH cycle_times AS (
          SELECT
            o.id,
            DATE_TRUNC('month', o.created_at) as month,
            EXTRACT(DAY FROM
              MIN(CASE WHEN st.to_stage = 'active' THEN st.transitioned_at END) -
              MIN(st.transitioned_at)
            ) as days_to_active
          FROM opportunities o
          JOIN stage_transitions st ON o.id = st.opportunity_id
          WHERE o.stage IN ('active', 'complete')
          GROUP BY o.id, DATE_TRUNC('month', o.created_at)
        )
        SELECT
          TO_CHAR(month, 'YYYY-MM') as month,
          ROUND(AVG(days_to_active))::integer as avg_cycle_time
        FROM cycle_times
        WHERE days_to_active IS NOT NULL AND days_to_active > 0
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
      `
    ])

    // Parse Postgres array strings to JS arrays
    const parsedDeadlines = deadlines.map(d => ({
      ...d,
      applies_to: Array.isArray(d.applies_to)
        ? d.applies_to
        : (d.applies_to || '').replace(/[{}]/g, '').split(',').filter(Boolean)
    }))

    // Calculate summary KPIs
    const totalPipelineValue = pipelineValue.reduce((sum, row) => sum + Number(row.total_value), 0)
    const activeOpportunities = pipelineValue.reduce((sum, row) => sum + Number(row.count), 0)

    const totalWon = winRates.reduce((sum, row) => sum + Number(row.won), 0)
    const totalClosed = winRates.reduce((sum, row) => sum + Number(row.total), 0)
    const overallWinRate = totalClosed > 0 ? Math.round((totalWon / totalClosed) * 100) : null

    const avgCycleTime = cycleTime.length > 0
      ? Math.round(cycleTime.reduce((sum, row) => sum + Number(row.avg_cycle_time || 0), 0) / cycleTime.length)
      : null

    // Calculate win rate percentages for each project type
    const winRatesWithPercent = winRates.map(row => ({
      ...row,
      win_rate: Number(row.total) > 0 ? Math.round((Number(row.won) / Number(row.total)) * 100) : 0
    }))

    res.status(200).json({
      // Summary KPIs
      summary: {
        totalPipelineValue,
        activeOpportunities,
        overallWinRate,
        avgCycleTime
      },
      // Individual datasets for widgets
      pipelineValue,
      funnel,
      aging,
      workload,
      heatmap,
      sources,
      projectTypes,
      deadlines: parsedDeadlines,
      winRates: winRatesWithPercent,
      cycleTime
    })

  } catch (error) {
    console.error('Analytics error:', error)
    res.status(500).json({ error: error.message })
  }
}
