import { neon } from '@neondatabase/serverless'

/**
 * POST /api/prospects/import
 *
 * Accepts JSON array of prospect objects and upserts them.
 * Key on company name (trimmed, case-insensitive).
 * On conflict: updates research columns but PRESERVES user-edited fields
 * (engagement_wave, outreach_rank, wave_notes, last_edited_by).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)

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
        // Update research columns only, preserve user-edited fields
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
        // Insert new company
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
