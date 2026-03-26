import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)

  // GET - Fetch all prospects with optional filters
  if (req.method === 'GET') {
    try {
      const { category, priority, geography_tier, engagement_wave, medical_device_mfg } = req.query

      // For 179 rows, fetching all and letting client filter is fine
      // But we support server-side filters for future scale
      let prospects

      if (category || priority || geography_tier || engagement_wave || medical_device_mfg) {
        // Build filtered query
        const conditions = []
        const params = []

        if (engagement_wave) {
          params.push(engagement_wave)
          conditions.push(`engagement_wave = $${params.length}`)
        }
        if (category) {
          params.push(category)
          conditions.push(`category = $${params.length}`)
        }
        if (priority) {
          params.push(priority)
          conditions.push(`priority = $${params.length}`)
        }
        if (geography_tier) {
          params.push(geography_tier)
          conditions.push(`geography_tier = $${params.length}`)
        }
        if (medical_device_mfg) {
          params.push(medical_device_mfg)
          conditions.push(`medical_device_mfg = $${params.length}`)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const queryText = `
          SELECT * FROM prospect_companies
          ${whereClause}
          ORDER BY
            CASE engagement_wave
              WHEN 'Wave 1' THEN 1
              WHEN 'Time-Sensitive' THEN 2
              WHEN 'Wave 2' THEN 3
              WHEN 'Infrastructure' THEN 4
              ELSE 5
            END,
            outreach_rank ASC NULLS LAST,
            signal_count DESC NULLS LAST
        `
        prospects = await sql.query(queryText, params)
      } else {
        prospects = await sql`
          SELECT * FROM prospect_companies
          ORDER BY
            CASE engagement_wave
              WHEN 'Wave 1' THEN 1
              WHEN 'Time-Sensitive' THEN 2
              WHEN 'Wave 2' THEN 3
              WHEN 'Infrastructure' THEN 4
              ELSE 5
            END,
            outreach_rank ASC NULLS LAST,
            signal_count DESC NULLS LAST
        `
      }

      return res.status(200).json(prospects)
    } catch (error) {
      console.error('Error fetching prospects:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  // POST - Create new prospect
  if (req.method === 'POST') {
    try {
      const { company } = req.body

      if (!company?.trim()) {
        return res.status(400).json({ error: 'company is required' })
      }

      const b = req.body
      const result = await sql`
        INSERT INTO prospect_companies (
          company, also_known_as, website, category, in_house_tooling,
          city, state, geography_tier, source_report, priority,
          employees_approx, year_founded, years_in_business, revenue_known, revenue_est_m,
          press_count, signal_count, top_signal, rjg_cavity_pressure, medical_device_mfg,
          key_certifications, ownership_type, recent_ma, cwp_contacts, psb_connection_notes,
          engagement_type, suggested_next_step, legacy_data_potential, notes,
          engagement_wave, outreach_rank, wave_notes, last_edited_by
        ) VALUES (
          ${company.trim()}, ${b.also_known_as || null}, ${b.website || null}, ${b.category || null}, ${b.in_house_tooling || null},
          ${b.city || null}, ${b.state || null}, ${b.geography_tier || null}, ${b.source_report || null}, ${b.priority || null},
          ${b.employees_approx || null}, ${b.year_founded || null}, ${b.years_in_business || null}, ${b.revenue_known || null}, ${b.revenue_est_m || null},
          ${b.press_count || null}, ${b.signal_count || null}, ${b.top_signal || null}, ${b.rjg_cavity_pressure || null}, ${b.medical_device_mfg || null},
          ${b.key_certifications || null}, ${b.ownership_type || null}, ${b.recent_ma || null}, ${b.cwp_contacts || null}, ${b.psb_connection_notes || null},
          ${b.engagement_type || null}, ${b.suggested_next_step || null}, ${b.legacy_data_potential || null}, ${b.notes || null},
          ${b.engagement_wave || 'Unassigned'}, ${b.outreach_rank || null}, ${b.wave_notes || null}, ${b.last_edited_by || null}
        )
        RETURNING *
      `
      return res.status(201).json(result[0])
    } catch (error) {
      console.error('Error creating prospect:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
