import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  console.log('>>> [id].js HIT:', req.method, req.query.id)

  const { id } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id) {
    return res.status(400).json({ error: 'Opportunity ID is required' })
  }

  // PATCH - Update opportunity
  if (req.method === 'PATCH') {
    const {
      company_name, description, project_type, stage,
      owner, est_value, source, psb_relationship, next_action,
    } = req.body

    const updates = []
    const values = []
    let i = 1

    if (company_name !== undefined) { updates.push(`company_name = $${i++}`); values.push(company_name) }
    if (description !== undefined) { updates.push(`description = $${i++}`); values.push(description) }
    if (project_type !== undefined) { updates.push(`project_type = $${i++}`); values.push(project_type) }
    if (stage !== undefined) { updates.push(`stage = $${i++}`); values.push(stage) }
    if (owner !== undefined) { updates.push(`owner = $${i++}`); values.push(owner || null) }
    if (est_value !== undefined) { updates.push(`est_value = $${i++}`); values.push(est_value || null) }
    if (source !== undefined) { updates.push(`source = $${i++}`); values.push(source || null) }
    if (psb_relationship !== undefined) { updates.push(`psb_relationship = $${i++}`); values.push(psb_relationship || null) }
    if (next_action !== undefined) { updates.push(`next_action = $${i++}`); values.push(next_action || null) }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'At least one field required' })
    }

    values.push(id)

    try {
      const query = `UPDATE opportunities SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`
      const result = await sql.unsafe(query, values)

      if (result.length === 0) {
        return res.status(404).json({ error: 'Opportunity not found' })
      }

      return res.status(200).json(result[0])
    } catch (error) {
      console.error('Error updating opportunity:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
