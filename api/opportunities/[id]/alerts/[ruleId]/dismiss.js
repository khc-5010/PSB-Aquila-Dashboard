import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const { id, ruleId } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id || !ruleId) {
    return res.status(400).json({ error: 'Opportunity ID and Rule ID are required' })
  }

  if (req.method === 'POST') {
    const { dismissed_by } = req.body || {}

    try {
      // Insert the dismissal record (ignore if already exists)
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
