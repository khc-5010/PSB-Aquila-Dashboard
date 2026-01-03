import { neon } from '@neondatabase/serverless'

// Map database project_type values to the display-style values used in communication_rules
const PROJECT_TYPE_MAP = {
  'tbd': 'TBD',
  'research': 'Research Agreement',
  'senior_design': 'Senior Design',
  'consulting': 'Consulting Engagement',
  'workforce': 'Workforce Training',
  'membership': 'Alliance Membership',
  'does_not_fit': 'Does Not Fit',
}

export default async function handler(req, res) {
  const { id } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id) {
    return res.status(400).json({ error: 'Opportunity ID is required' })
  }

  if (req.method === 'GET') {
    try {
      // First, get the opportunity details
      const opportunityResult = await sql`
        SELECT id, project_type, stage, estimated_value
        FROM opportunities
        WHERE id = ${id}
      `

      if (!opportunityResult || opportunityResult.length === 0) {
        return res.status(404).json({ error: 'Opportunity not found' })
      }

      const opportunity = opportunityResult[0]

      // Map the database project_type to display format for matching
      const displayProjectType = PROJECT_TYPE_MAP[opportunity.project_type] || opportunity.project_type

      // Get all active communication rules that match this opportunity
      // Exclude any that have been dismissed for this opportunity
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

      // Filter alerts based on trigger conditions
      const matchingAlerts = alertsResult.filter(rule => {
        const condition = rule.trigger_condition

        switch (rule.trigger_type) {
          case 'project_type_set':
            // Match if project_type matches (comparing display format)
            return condition.project_type === displayProjectType

          case 'stage_change':
            // Match if current stage matches the trigger condition
            return condition.to === opportunity.stage

          case 'value_threshold':
            // Match if estimated_value meets the threshold
            const estValue = parseFloat(opportunity.estimated_value) || 0
            if (condition.min_value && estValue < condition.min_value) return false
            if (condition.max_value && estValue > condition.max_value) return false
            return condition.min_value ? estValue >= condition.min_value : false

          case 'deadline_proximity':
            // For now, skip deadline-based alerts (would need date logic)
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
