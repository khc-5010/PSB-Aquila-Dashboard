import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)
  const today = new Date()

  try {
    // Get all active key dates
    const dates = await sql`
      SELECT * FROM key_dates WHERE active = true
    `

    // Process each date to calculate actual date and urgency
    const processed = dates.map(d => {
      let targetDate, endDate

      // Calculate the actual date (for recurring, find next occurrence)
      if (d.fixed_date) {
        targetDate = new Date(d.fixed_date)
      } else if (d.recurring_month && d.recurring_day) {
        targetDate = new Date(today.getFullYear(), d.recurring_month - 1, d.recurring_day)
        // If date has passed this year, use next year
        if (targetDate < today) {
          targetDate = new Date(today.getFullYear() + 1, d.recurring_month - 1, d.recurring_day)
        }
      }

      // Calculate end date for ranges
      if (d.end_date) {
        endDate = new Date(d.end_date)
      } else if (d.recurring_end_month && d.recurring_end_day) {
        endDate = new Date(targetDate.getFullYear(), d.recurring_end_month - 1, d.recurring_end_day)
        // Handle year rollover (e.g., Dec 20 - Jan 6)
        if (endDate < targetDate) {
          endDate = new Date(targetDate.getFullYear() + 1, d.recurring_end_month - 1, d.recurring_end_day)
        }
      }

      // Calculate days until
      const daysUntil = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24))

      // Check if currently within an active date range
      const isActive = endDate ? (today >= targetDate && today <= endDate) : false

      // Determine urgency level
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

    // Filter to only upcoming (or currently active) dates within reasonable window (180 days)
    const upcoming = processed
      .filter(d => d.days_until <= 180 || d.is_active)
      .sort((a, b) => a.days_until - b.days_until)

    // Separate into categories for the UI
    const deadlines = upcoming.filter(d => d.date_type === 'deadline' || d.date_type === 'shutdown')
    const events = upcoming.filter(d => d.date_type === 'event' || (d.date_type === 'recurring' && d.is_opportunity))

    res.status(200).json({
      deadlines,
      events,
      all: upcoming
    })
  } catch (error) {
    console.error('Error fetching key dates:', error)
    res.status(500).json({ error: error.message })
  }
}
