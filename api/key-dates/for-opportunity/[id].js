import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id, all } = req.query
  const sql = neon(process.env.DATABASE_URL)
  const today = new Date()

  try {
    // Get the opportunity
    const opps = await sql`SELECT * FROM opportunities WHERE id = ${id}`
    if (opps.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' })
    }
    const opp = opps[0]

    // Get dates that are relevant to this opportunity:
    // 1. Dates where applies_to_project_types includes this project type
    // 2. OR critical dates (priority = 1) that apply to everyone (NULL applies_to_project_types)
    // Dates with NULL applies_to_project_types and priority > 1 are NOT shown (general awareness, not actionable)
    const dates = await sql`
      SELECT * FROM key_dates
      WHERE active = true
      AND (
        ${opp.project_type} = ANY(applies_to_project_types)
        OR (applies_to_project_types IS NULL AND priority = 1)
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

    // Filter to dates within 180 days or currently active
    const relevant = processed.filter(d => d.days_until <= 180 || d.is_active)

    // Smart sorting:
    // 1. Deadlines/shutdowns first
    // 2. Then by urgency (red > yellow > blue > active > none > past)
    // 3. Then by days_until ascending
    const urgencyOrder = { red: 1, yellow: 2, blue: 3, active: 4, none: 5, past: 6 }

    relevant.sort((a, b) => {
      // Deadlines/shutdowns first
      const aIsDeadline = ['deadline', 'shutdown'].includes(a.date_type)
      const bIsDeadline = ['deadline', 'shutdown'].includes(b.date_type)
      if (aIsDeadline && !bIsDeadline) return -1
      if (!aIsDeadline && bIsDeadline) return 1

      // Then by urgency
      const aUrgency = urgencyOrder[a.urgency] || 5
      const bUrgency = urgencyOrder[b.urgency] || 5
      if (aUrgency !== bUrgency) {
        return aUrgency - bUrgency
      }

      // Then by days until
      return a.days_until - b.days_until
    })

    // Apply limit unless ?all=true is specified
    const limit = 5
    const showAll = all === 'true'
    const hasMore = relevant.length > limit
    const totalCount = relevant.length
    const limitedDates = showAll ? relevant : relevant.slice(0, limit)

    res.status(200).json({
      opportunity_id: id,
      project_type: opp.project_type,
      dates: limitedDates,
      hasMore: showAll ? false : hasMore,
      totalCount
    })
  } catch (error) {
    console.error('Error fetching dates for opportunity:', error)
    res.status(500).json({ error: error.message })
  }
}
