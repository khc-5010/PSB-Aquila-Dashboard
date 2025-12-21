import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const { id, ruleId } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id || !ruleId) {
    res.status(400).json({ error: 'Opportunity ID and Rule ID are required' })
    return
  }

  // POST - Dismiss an alert
  if (req.method === 'POST') {
    try {
      const { dismissed_by } = req.body || {}

      // Verify opportunity exists
      const opportunities = await sql`
        SELECT id FROM opportunities WHERE id = ${id}
      `
      if (opportunities.length === 0) {
        res.status(404).json({ error: 'Opportunity not found' })
        return
      }

      // Verify rule exists
      const rules = await sql`
        SELECT id FROM communication_rules WHERE id = ${ruleId}
      `
      if (rules.length === 0) {
        res.status(404).json({ error: 'Rule not found' })
        return
      }

      // Insert dismissed alert (ignore if already exists)
      await sql`
        INSERT INTO dismissed_alerts (opportunity_id, rule_id, dismissed_by)
        VALUES (${id}, ${ruleId}, ${dismissed_by || null})
        ON CONFLICT (opportunity_id, rule_id) DO NOTHING
      `

      res.status(200).json({ success: true })
    } catch (error) {
      console.error('Error dismissing alert:', error)
      res.status(500).json({ error: error.message })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
