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
      next_action
    } = req.body

    // At least one field must be provided
    const hasUpdate = [
      company_name, description, project_type, stage, owner,
      est_value, source, psb_relationship, next_action
    ].some(field => field !== undefined)

    if (!hasUpdate) {
      res.status(400).json({ error: 'At least one field is required for update' })
      return
    }

    try {
      // Build dynamic update query based on provided fields
      const updates = []
      const values = []

      const fieldMappings = [
        { name: 'company_name', value: company_name },
        { name: 'description', value: description },
        { name: 'project_type', value: project_type },
        { name: 'stage', value: stage },
        { name: 'owner', value: owner },
        { name: 'est_value', value: est_value },
        { name: 'source', value: source },
        { name: 'psb_relationship', value: psb_relationship },
        { name: 'next_action', value: next_action },
      ]

      for (const field of fieldMappings) {
        if (field.value !== undefined) {
          values.push(field.value)
          updates.push(`${field.name} = $${values.length}`)
        }
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
