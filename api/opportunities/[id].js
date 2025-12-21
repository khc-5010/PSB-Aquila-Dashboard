import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const { id } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id) {
    res.status(400).json({ error: 'Opportunity ID is required' })
    return
  }

  // PATCH: Update opportunity fields
  if (req.method === 'PATCH') {
    const { stage } = req.body

    if (!stage) {
      res.status(400).json({ error: 'stage is required' })
      return
    }

    try {
      const result = await sql`
        UPDATE opportunities
        SET stage = ${stage}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `

      if (result.length === 0) {
        res.status(404).json({ error: 'Opportunity not found' })
        return
      }

      res.status(200).json(result[0])
    } catch (error) {
      console.error('Error updating opportunity:', error)
      res.status(500).json({ error: error.message })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
