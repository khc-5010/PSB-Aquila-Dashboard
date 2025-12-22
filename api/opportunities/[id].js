import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const { id } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id) {
    return res.status(400).json({ error: 'Opportunity ID is required' })
  }

  if (req.method === 'PATCH') {
    const {
      company_name, description, project_type, stage,
      owner, est_value, source, psb_relationship, next_action,
    } = req.body

    try {
      // Use tagged template like the working POST endpoint
      const result = await sql`
        UPDATE opportunities SET
          company_name = COALESCE(${company_name}, company_name),
          description = COALESCE(${description}, description),
          project_type = COALESCE(${project_type}, project_type),
          stage = COALESCE(${stage}, stage),
          owner = COALESCE(${owner}, owner),
          est_value = COALESCE(${est_value}, est_value),
          source = COALESCE(${source}, source),
          psb_relationship = COALESCE(${psb_relationship}, psb_relationship),
          next_action = COALESCE(${next_action}, next_action),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `

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
