import { neon } from '@neondatabase/serverless'

/**
 * Consolidated prospect API — single serverless function.
 *
 * GET  /api/prospects           — list all (with optional filter query params)
 * GET  /api/prospects?id=123    — get single prospect
 * POST /api/prospects           — create single prospect
 * POST /api/prospects?action=import — bulk import/upsert (preserves user-edited fields)
 * PATCH /api/prospects?id=123   — update single prospect
 */
export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)
  const { action, id } = req.query

  // ─── GET ───────────────────────────────────────────────
  if (req.method === 'GET') {
    // Single prospect by ID
    if (id) {
      try {
        const result = await sql`SELECT * FROM prospect_companies WHERE id = ${id}`
        if (!result || result.length === 0) {
          return res.status(404).json({ error: 'Prospect not found' })
        }
        return res.status(200).json(result[0])
      } catch (error) {
        console.error('Error fetching prospect:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // List all with optional filters
    try {
      const { category, priority, geography_tier, engagement_wave, medical_device_mfg } = req.query

      let prospects

      if (category || priority || geography_tier || engagement_wave || medical_device_mfg) {
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

  // ─── POST ──────────────────────────────────────────────
  if (req.method === 'POST') {
    // Bulk import/upsert
    if (action === 'import') {
      try {
        const { prospects } = req.body

        if (!Array.isArray(prospects) || prospects.length === 0) {
          return res.status(400).json({ error: 'prospects array is required' })
        }

        let upserted = 0
        let skipped = 0

        for (const p of prospects) {
          if (!p.company?.trim()) {
            skipped++
            continue
          }

          const company = p.company.trim()

          // Check if company already exists (case-insensitive)
          const existing = await sql`
            SELECT id, engagement_wave, outreach_rank, wave_notes, last_edited_by
            FROM prospect_companies
            WHERE LOWER(TRIM(company)) = LOWER(${company})
            LIMIT 1
          `

          if (existing.length > 0) {
            // Update research columns only — PRESERVE user-edited fields
            await sql`
              UPDATE prospect_companies SET
                also_known_as = COALESCE(${p.also_known_as || null}, also_known_as),
                website = COALESCE(${p.website || null}, website),
                category = COALESCE(${p.category || null}, category),
                in_house_tooling = COALESCE(${p.in_house_tooling || null}, in_house_tooling),
                city = COALESCE(${p.city || null}, city),
                state = COALESCE(${p.state || null}, state),
                geography_tier = COALESCE(${p.geography_tier || null}, geography_tier),
                source_report = COALESCE(${p.source_report || null}, source_report),
                priority = COALESCE(${p.priority || null}, priority),
                employees_approx = COALESCE(${p.employees_approx || null}, employees_approx),
                year_founded = COALESCE(${p.year_founded || null}, year_founded),
                years_in_business = COALESCE(${p.years_in_business || null}, years_in_business),
                revenue_known = COALESCE(${p.revenue_known || null}, revenue_known),
                revenue_est_m = COALESCE(${p.revenue_est_m || null}, revenue_est_m),
                press_count = COALESCE(${p.press_count || null}, press_count),
                signal_count = COALESCE(${p.signal_count || null}, signal_count),
                top_signal = COALESCE(${p.top_signal || null}, top_signal),
                rjg_cavity_pressure = COALESCE(${p.rjg_cavity_pressure || null}, rjg_cavity_pressure),
                medical_device_mfg = COALESCE(${p.medical_device_mfg || null}, medical_device_mfg),
                key_certifications = COALESCE(${p.key_certifications || null}, key_certifications),
                ownership_type = COALESCE(${p.ownership_type || null}, ownership_type),
                recent_ma = COALESCE(${p.recent_ma || null}, recent_ma),
                cwp_contacts = COALESCE(${p.cwp_contacts || null}, cwp_contacts),
                psb_connection_notes = COALESCE(${p.psb_connection_notes || null}, psb_connection_notes),
                engagement_type = COALESCE(${p.engagement_type || null}, engagement_type),
                suggested_next_step = COALESCE(${p.suggested_next_step || null}, suggested_next_step),
                legacy_data_potential = COALESCE(${p.legacy_data_potential || null}, legacy_data_potential),
                notes = COALESCE(${p.notes || null}, notes),
                updated_at = NOW()
              WHERE id = ${existing[0].id}
            `
          } else {
            await sql`
              INSERT INTO prospect_companies (
                company, also_known_as, website, category, in_house_tooling,
                city, state, geography_tier, source_report, priority,
                employees_approx, year_founded, years_in_business, revenue_known, revenue_est_m,
                press_count, signal_count, top_signal, rjg_cavity_pressure, medical_device_mfg,
                key_certifications, ownership_type, recent_ma, cwp_contacts, psb_connection_notes,
                engagement_type, suggested_next_step, legacy_data_potential, notes,
                engagement_wave, outreach_rank
              ) VALUES (
                ${company}, ${p.also_known_as || null}, ${p.website || null}, ${p.category || null}, ${p.in_house_tooling || null},
                ${p.city || null}, ${p.state || null}, ${p.geography_tier || null}, ${p.source_report || null}, ${p.priority || null},
                ${p.employees_approx || null}, ${p.year_founded || null}, ${p.years_in_business || null}, ${p.revenue_known || null}, ${p.revenue_est_m || null},
                ${p.press_count || null}, ${p.signal_count || null}, ${p.top_signal || null}, ${p.rjg_cavity_pressure || null}, ${p.medical_device_mfg || null},
                ${p.key_certifications || null}, ${p.ownership_type || null}, ${p.recent_ma || null}, ${p.cwp_contacts || null}, ${p.psb_connection_notes || null},
                ${p.engagement_type || null}, ${p.suggested_next_step || null}, ${p.legacy_data_potential || null}, ${p.notes || null},
                'Unassigned', ${null}
              )
            `
          }

          upserted++
        }

        return res.status(200).json({
          message: `Import complete: ${upserted} upserted, ${skipped} skipped`,
          upserted,
          skipped,
        })
      } catch (error) {
        console.error('Error importing prospects:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Create single prospect
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

  // ─── PATCH ─────────────────────────────────────────────
  if (req.method === 'PATCH') {
    if (!id) {
      return res.status(400).json({ error: 'id query param is required for PATCH' })
    }

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
