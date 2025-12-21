import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const { id } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id) {
    res.status(400).json({ error: 'Opportunity ID is required' })
    return
  }

  // GET - Fetch alerts for opportunity
  if (req.method === 'GET') {
    try {
      // First, get the opportunity details
      const opportunities = await sql`
        SELECT id, project_type, stage, est_value
        FROM opportunities
        WHERE id = ${id}
      `

      if (opportunities.length === 0) {
        res.status(404).json({ error: 'Opportunity not found' })
        return
      }

      const opp = opportunities[0]
      let alerts = []

      // 1. Project type rules
      if (opp.project_type) {
        const typeRules = await sql`
          SELECT cr.* FROM communication_rules cr
          WHERE cr.trigger_type = 'project_type_set'
          AND cr.trigger_condition->>'project_type' = ${opp.project_type}
          AND cr.active = true
          AND cr.id NOT IN (
            SELECT rule_id FROM dismissed_alerts WHERE opportunity_id = ${id}
          )
        `
        alerts.push(...typeRules)
      }

      // 2. Stage-based rules
      if (opp.stage) {
        const stageRules = await sql`
          SELECT cr.* FROM communication_rules cr
          WHERE cr.trigger_type = 'stage_change'
          AND cr.trigger_condition->>'to' = ${opp.stage}
          AND cr.active = true
          AND cr.id NOT IN (
            SELECT rule_id FROM dismissed_alerts WHERE opportunity_id = ${id}
          )
        `
        alerts.push(...stageRules)
      }

      // 3. Value threshold rules
      if (opp.est_value) {
        const estValue = parseFloat(opp.est_value)
        if (!isNaN(estValue)) {
          const valueRules = await sql`
            SELECT cr.* FROM communication_rules cr
            WHERE cr.trigger_type = 'value_threshold'
            AND (cr.trigger_condition->>'min_value')::int <= ${estValue}
            AND cr.active = true
            AND cr.id NOT IN (
              SELECT rule_id FROM dismissed_alerts WHERE opportunity_id = ${id}
            )
          `
          alerts.push(...valueRules)
        }
      }

      // 4. Deadline proximity rules (Senior Design August 15)
      if (opp.project_type === 'Senior Design') {
        const today = new Date()
        const currentYear = today.getFullYear()
        let aug15 = new Date(currentYear, 7, 15) // August 15 (month is 0-indexed)

        // If August 15 has passed this year, use next year
        if (aug15 < today) {
          aug15 = new Date(currentYear + 1, 7, 15)
        }

        const daysUntil = Math.ceil((aug15 - today) / (1000 * 60 * 60 * 24))

        if (daysUntil <= 60) {
          const deadlineRules = await sql`
            SELECT cr.* FROM communication_rules cr
            WHERE cr.trigger_type = 'deadline_proximity'
            AND cr.trigger_condition->>'deadline' = 'aug_15_senior_design'
            AND cr.active = true
            AND cr.id NOT IN (
              SELECT rule_id FROM dismissed_alerts WHERE opportunity_id = ${id}
            )
          `
          alerts.push(...deadlineRules)
        }
      }

      // Sort by priority (1=high first), then engagement level (A before C before I before O)
      const levelOrder = { 'A': 1, 'C': 2, 'I': 3, 'O': 4 }
      alerts.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        return (levelOrder[a.engagement_level] || 5) - (levelOrder[b.engagement_level] || 5)
      })

      // Remove duplicates (same rule_id)
      const seen = new Set()
      alerts = alerts.filter(alert => {
        if (seen.has(alert.id)) return false
        seen.add(alert.id)
        return true
      })

      res.status(200).json({ alerts })
    } catch (error) {
      console.error('Error fetching alerts:', error)
      res.status(500).json({ error: error.message })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
