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
    const {
      company_name,
      description,
      project_type,
      stage,
      owner,
      est_value,
      source,
      psb_relationship,
      next_action,
    } = req.body

    // Build dynamic update - only include fields that were provided
    const updates = []
    const values = []
    let paramIndex = 1

    if (company_name !== undefined) {
      updates.push(`company_name = $${paramIndex++}`)
      values.push(company_name)
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(description)
    }
    if (project_type !== undefined) {
      updates.push(`project_type = $${paramIndex++}`)
      values.push(project_type)
    }
    if (stage !== undefined) {
      updates.push(`stage = $${paramIndex++}`)
      values.push(stage)
    }
    if (owner !== undefined) {
      updates.push(`owner = $${paramIndex++}`)
      values.push(owner || null)
    }
    if (est_value !== undefined) {
      updates.push(`est_value = $${paramIndex++}`)
      values.push(est_value || null)
    }
    if (source !== undefined) {
      updates.push(`source = $${paramIndex++}`)
      values.push(source || null)
    }
    if (psb_relationship !== undefined) {
      updates.push(`psb_relationship = $${paramIndex++}`)
      values.push(psb_relationship || null)
    }
    if (next_action !== undefined) {
      updates.push(`next_action = $${paramIndex++}`)
      values.push(next_action || null)
    }

    // Must have at least one field to update
    if (updates.length === 0) {
      res.status(400).json({ error: 'At least one field is required' })
      return
    }

    // Add the ID as the last parameter
    values.push(id)

    try {
      const query = `
        UPDATE opportunities
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
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
