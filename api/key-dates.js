import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/requireAuth.js'

/**
 * Consolidated key-dates API.
 *
 * GET /api/key-dates                              — all upcoming key dates
 * GET /api/key-dates?opportunityId=X              — dates relevant to a specific opportunity
 * GET /api/key-dates?opportunityId=X&all=true     — all dates for opportunity (no limit)
 */

// Parse a DATE-only value (YYYY-MM-DD or ISO timestamp) at midnight, ignoring
// any time component. SYNC: same pattern as parseLocalDate in api/prospects.js /
// ProspectTable.jsx / taskUtils.js. Never use `new Date('YYYY-MM-DD')` — it
// parses as UTC midnight, which shifts the date in US timezones.
function parseDateOnly(val) {
  if (!val) return null
  const str = typeof val === 'string' ? val : val instanceof Date ? val.toISOString() : String(val)
  const [y, m, d] = str.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// `today` must be start-of-day (midnight). Both bugs this function had lived
// in the time component: recurring dates rolled to NEXT year at 00:01 on the
// due day ("365 days remaining" on Aug 15), and daysUntil hit 0 → 'past' on
// the due day itself, which DeadlineBanner filters out — hiding the deadline
// on the day it matters most.
function processDate(d, today) {
  let targetDate, endDate

  if (d.fixed_date) {
    targetDate = parseDateOnly(d.fixed_date)
  } else if (d.recurring_month && d.recurring_day) {
    targetDate = new Date(today.getFullYear(), d.recurring_month - 1, d.recurring_day)
    if (targetDate < today) {
      targetDate = new Date(today.getFullYear() + 1, d.recurring_month - 1, d.recurring_day)
    }
  }

  if (d.end_date) {
    endDate = parseDateOnly(d.end_date)
  } else if (d.recurring_end_month && d.recurring_end_day) {
    endDate = new Date(targetDate.getFullYear(), d.recurring_end_month - 1, d.recurring_end_day)
    if (endDate < targetDate) {
      endDate = new Date(targetDate.getFullYear() + 1, d.recurring_end_month - 1, d.recurring_end_day)
    }
  }

  // Both midnights → exact integer; Math.round guards DST drift
  const daysUntil = Math.round((targetDate - today) / (1000 * 60 * 60 * 24))
  const isActive = endDate ? (today >= targetDate && today <= endDate) : false

  let urgency = 'none'
  if (isActive) {
    urgency = 'active'
  } else if (daysUntil < 0) {
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
    is_active: isActive,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const sql = neon(process.env.DATABASE_URL)
  // Start-of-day, not now() — processDate compares date-only values
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const { opportunityId, all } = req.query

  // ─── Dates for a specific opportunity ──────────────────
  if (opportunityId) {
    try {
      const opps = await sql`SELECT * FROM opportunities WHERE id = ${opportunityId}`
      if (opps.length === 0) {
        return res.status(404).json({ error: 'Opportunity not found' })
      }
      const opp = opps[0]

      const dates = await sql`
        SELECT * FROM key_dates
        WHERE active = true
        AND (
          ${opp.project_type} = ANY(applies_to_project_types)
          OR (applies_to_project_types IS NULL AND priority = 1)
        )
      `

      const processed = dates.map(d => processDate(d, today))

      const relevant = processed.filter(d => d.days_until <= 180 || d.is_active)

      const urgencyOrder = { red: 1, yellow: 2, blue: 3, active: 4, none: 5, past: 6 }
      relevant.sort((a, b) => {
        const aIsDeadline = ['deadline', 'shutdown'].includes(a.date_type)
        const bIsDeadline = ['deadline', 'shutdown'].includes(b.date_type)
        if (aIsDeadline && !bIsDeadline) return -1
        if (!aIsDeadline && bIsDeadline) return 1

        const aUrgency = urgencyOrder[a.urgency] || 5
        const bUrgency = urgencyOrder[b.urgency] || 5
        if (aUrgency !== bUrgency) return aUrgency - bUrgency

        return a.days_until - b.days_until
      })

      const limit = 5
      const showAll = all === 'true'
      const hasMore = relevant.length > limit
      const totalCount = relevant.length
      const limitedDates = showAll ? relevant : relevant.slice(0, limit)

      return res.status(200).json({
        opportunity_id: opportunityId,
        project_type: opp.project_type,
        dates: limitedDates,
        hasMore: showAll ? false : hasMore,
        totalCount,
      })
    } catch (error) {
      console.error('Error fetching dates for opportunity:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  // ─── All upcoming key dates ────────────────────────────
  try {
    const dates = await sql`
      SELECT * FROM key_dates WHERE active = true
    `

    const processed = dates.map(d => processDate(d, today))

    const upcoming = processed
      .filter(d => d.days_until <= 180 || d.is_active)
      .sort((a, b) => a.days_until - b.days_until)

    const deadlines = upcoming.filter(d => d.date_type === 'deadline' || d.date_type === 'shutdown')
    const events = upcoming.filter(d => d.date_type === 'event' || (d.date_type === 'recurring' && d.is_opportunity))

    res.status(200).json({
      deadlines,
      events,
      all: upcoming,
    })
  } catch (error) {
    console.error('Error fetching key dates:', error)
    res.status(500).json({ error: error.message })
  }
}
