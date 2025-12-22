import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const { id } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id) {
    return res.status(400).json({ error: 'Opportunity ID is required' })
  }

  if (req.method === 'PATCH') {
    const body = req.body

    // Map frontend field names to database column names
    const fieldMap = {
      company_name: 'company_name',
      description: 'description',
      project_type: 'project_type',
      stage: 'stage',
      owner: 'owner',
      est_value: 'estimated_value',  // frontend sends est_value, db has estimated_value
      source: 'source',
      psb_relationship: 'psb_relationship',
      next_action: 'next_action',
    }

    // Build SET clause only for provided fields
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

      // Map database column names back to frontend field names
      const row = result[0]
      const response = {
        ...row,
        est_value: row.estimated_value,  // frontend expects est_value
      }

      return res.status(200).json(response)
    } catch (error) {
      console.error('Error:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
