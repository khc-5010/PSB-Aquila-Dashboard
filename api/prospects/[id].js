import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const { id } = req.query
  const sql = neon(process.env.DATABASE_URL)

  if (!id) {
    return res.status(400).json({ error: 'Prospect ID is required' })
  }

  // GET - Fetch single prospect
  if (req.method === 'GET') {
    try {
      const result = await sql`
        SELECT * FROM prospect_companies WHERE id = ${id}
      `
      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'Prospect not found' })
      }
      return res.status(200).json(result[0])
    } catch (error) {
      console.error('Error fetching prospect:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  // PATCH - Update prospect fields
  if (req.method === 'PATCH') {
    const body = req.body

    const allowedFields = [
      'company', 'also_known_as', 'website', 'category', 'in_house_tooling',
      'city', 'state', 'geography_tier', 'source_report', 'priority',
      'employees_approx', 'year_founded', 'years_in_business', 'revenue_known', 'revenue_est_m',
      'press_count', 'signal_count', 'top_signal', 'rjg_cavity_pressure', 'medical_device_mfg',
      'key_certifications', 'ownership_type', 'recent_ma', 'cwp_contacts', 'psb_connection_notes',
      'engagement_type', 'suggested_next_step', 'legacy_data_potential', 'notes',
      'engagement_wave', 'outreach_rank', 'wave_notes', 'last_edited_by',
    ]

    const setClauses = []
    const values = []

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        values.push(body[field])
        setClauses.push(`${field} = $${values.length}`)
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    values.push(id)
    const idParam = values.length

    const queryText = `
      UPDATE prospect_companies
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $${idParam}
      RETURNING *
    `

    try {
      const result = await sql.query(queryText, values)

      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'Prospect not found' })
      }

      return res.status(200).json(result[0])
    } catch (error) {
      console.error('Error updating prospect:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
