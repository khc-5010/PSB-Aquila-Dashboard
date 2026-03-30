import { neon } from '@neondatabase/serverless'

/**
 * Consolidated opportunity-by-ID API.
 *
 * PATCH /api/opportunities/[id]                          — update opportunity
 * GET  /api/opportunities/[id]?action=alerts             — get matching alerts
 * POST /api/opportunities/[id]?action=dismiss&ruleId=X   — dismiss an alert
 */

// Map project_type values to display-style values used in communication_rules
const PROJECT_TYPE_MAP = {
  'Pilot Project': 'Pilot Project',
  'Research Agreement': 'Research Agreement',
  'Senior Design': 'Senior Design',
  'Strategic Membership': 'Strategic Membership',
  // Legacy mappings
  'tbd': 'TBD',
  'research': 'Research Agreement',
  'senior_design': 'Senior Design',
  'consulting': 'Consulting Engagement',
  'workforce': 'Workforce Training',
  'membership': 'Alliance Membership',
  'does_not_fit': 'Does Not Fit',
}

export default async function handler(req, res) {
  const { id, action, ruleId } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id) {
    return res.status(400).json({ error: 'Opportunity ID is required' })
  }

  // ─── GET ───────────────────────────────────────────────
  if (req.method === 'GET') {
    // GET alerts for this opportunity
    if (action === 'alerts') {
      try {
        const opportunityResult = await sql`
          SELECT id, project_type, stage, estimated_value
          FROM opportunities
          WHERE id = ${id}
        `

        if (!opportunityResult || opportunityResult.length === 0) {
          return res.status(404).json({ error: 'Opportunity not found' })
        }

        const opportunity = opportunityResult[0]
        const displayProjectType = PROJECT_TYPE_MAP[opportunity.project_type] || opportunity.project_type

        const alertsResult = await sql`
          SELECT
            cr.id,
            cr.rule_name,
            cr.trigger_type,
            cr.trigger_condition,
            cr.stakeholder_name,
            cr.stakeholder_role,
            cr.stakeholder_email,
            cr.engagement_level,
            cr.alert_message,
            cr.category,
            cr.priority
          FROM communication_rules cr
          WHERE cr.active = true
            AND cr.id NOT IN (
              SELECT rule_id FROM dismissed_alerts WHERE opportunity_id = ${id}
            )
          ORDER BY cr.priority ASC, cr.engagement_level ASC
        `

        const matchingAlerts = alertsResult.filter(rule => {
          const condition = rule.trigger_condition

          switch (rule.trigger_type) {
            case 'project_type_set':
              return condition.project_type === displayProjectType
            case 'stage_change':
              return condition.to === opportunity.stage
            case 'value_threshold': {
              const estValue = parseFloat(opportunity.estimated_value) || 0
              if (condition.min_value && estValue < condition.min_value) return false
              if (condition.max_value && estValue > condition.max_value) return false
              return condition.min_value ? estValue >= condition.min_value : false
            }
            case 'deadline_proximity':
              return false
            default:
              return false
          }
        })

        return res.status(200).json({ alerts: matchingAlerts })
      } catch (error) {
        console.error('Error fetching alerts:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ─── POST ──────────────────────────────────────────────
  if (req.method === 'POST') {
    // Dismiss an alert
    if (action === 'dismiss') {
      if (!ruleId) {
        return res.status(400).json({ error: 'ruleId query param is required' })
      }

      const { dismissed_by } = req.body || {}

      try {
        await sql`
          INSERT INTO dismissed_alerts (opportunity_id, rule_id, dismissed_by)
          VALUES (${id}, ${ruleId}, ${dismissed_by || 'unknown'})
          ON CONFLICT (opportunity_id, rule_id) DO NOTHING
        `
        return res.status(200).json({ success: true })
      } catch (error) {
        console.error('Error dismissing alert:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ─── PATCH ─────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body

    const fieldMap = {
      company_name: 'company_name',
      description: 'description',
      project_type: 'project_type',
      stage: 'stage',
      owner: 'owner',
      est_value: 'estimated_value',
      source: 'source',
      psb_relationship: 'psb_relationship',
      next_action: 'next_action',
      outcome: 'outcome',
      closed_at: 'closed_at',
      source_prospect_id: 'source_prospect_id',
    }

    const setClauses = []
    const values = []

    for (const [frontendKey, dbColumn] of Object.entries(fieldMap)) {
      if (body[frontendKey] !== undefined) {
        values.push(body[frontendKey])
        setClauses.push(`${dbColumn} = $${values.length}`)
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    values.push(id)
    const idParam = values.length

    const queryText = `
      UPDATE opportunities
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $${idParam}
      RETURNING *
    `

    try {
      console.log('Query:', queryText)
      console.log('Values:', values)

      const result = await sql.query(queryText, values)

      console.log('Result:', JSON.stringify(result))

      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'Opportunity not found' })
      }

      const row = result[0]
      const response = {
        ...row,
        est_value: row.estimated_value,
      }

      return res.status(200).json(response)
    } catch (error) {
      console.error('Error:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
