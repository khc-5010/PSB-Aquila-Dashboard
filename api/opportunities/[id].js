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
    const { stage, next_action } = req.body

    // At least one field must be provided
    if (stage === undefined && next_action === undefined) {
      res.status(400).json({ error: 'At least one field (stage or next_action) is required' })
      return
    }

    try {
      // Build dynamic update query based on provided fields
      const updates = []
      const values = []

      if (stage !== undefined) {
        values.push(stage)
        updates.push(`stage = $${values.length}`)
      }

      if (next_action !== undefined) {
        values.push(next_action)
        updates.push(`next_action = $${values.length}`)
      }

      values.push(id)
      const idPlaceholder = `$${values.length}`

      const query = `
        UPDATE opportunities
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = ${idPlaceholder}
        RETURNING *
      `

      const result = await sql.unsafe(query, values)

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
