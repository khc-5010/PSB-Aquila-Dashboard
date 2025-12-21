import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query
  const sql = neon(process.env.DATABASE_URL)
  const today = new Date()

  try {
    // Get the opportunity
    const opps = await sql`SELECT * FROM opportunities WHERE id = ${id}`
    if (opps.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' })
    }
    const opp = opps[0]

    // Get dates that apply to this project type (or all types)
    const dates = await sql`
      SELECT * FROM key_dates
      WHERE active = true
      AND (
        applies_to_project_types IS NULL
        OR ${opp.project_type} = ANY(applies_to_project_types)
      )
    `

    // Process dates
    const processed = dates.map(d => {
      let targetDate, endDate

      if (d.fixed_date) {
        targetDate = new Date(d.fixed_date)
      } else if (d.recurring_month && d.recurring_day) {
        targetDate = new Date(today.getFullYear(), d.recurring_month - 1, d.recurring_day)
        if (targetDate < today) {
          targetDate = new Date(today.getFullYear() + 1, d.recurring_month - 1, d.recurring_day)
        }
      }

      if (d.end_date) {
        endDate = new Date(d.end_date)
      } else if (d.recurring_end_month && d.recurring_end_day) {
        endDate = new Date(targetDate.getFullYear(), d.recurring_end_month - 1, d.recurring_end_day)
        if (endDate < targetDate) {
          endDate = new Date(targetDate.getFullYear() + 1, d.recurring_end_month - 1, d.recurring_end_day)
        }
      }

      const daysUntil = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24))

      // Check if currently within an active date range
      const isActive = endDate ? (today >= targetDate && today <= endDate) : false

      let urgency = 'none'
      if (isActive) {
        urgency = 'active'
      } else if (daysUntil <= 0) {
        urgency = 'past'
      } else if (daysUntil <= d.warn_days_red) {
        urgency = 'red'
      } else if (daysUntil <= d.warn_days_yellow) {
        urgency = 'yellow'
      } else if (daysUntil <= d.warn_days_blue) {
        urgency = 'blue'
      }

      return {
        ...d,
        calculated_date: targetDate?.toISOString().split('T')[0] || null,
        calculated_end_date: endDate?.toISOString().split('T')[0] || null,
        days_until: daysUntil,
        urgency,
        is_active: isActive
      }
    })

    // Filter and sort
    const relevant = processed
      .filter(d => d.days_until <= 180 || d.is_active)
      .sort((a, b) => a.days_until - b.days_until)

    res.status(200).json({
      opportunity_id: id,
      project_type: opp.project_type,
      dates: relevant
    })
  } catch (error) {
    console.error('Error fetching dates for opportunity:', error)
    res.status(500).json({ error: error.message })
  }
}
