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
    // State-level aggregations for National Map
    if (action === 'state-stats') {
      try {
        const [stateCounts, categoryBreakdown, signalAvg, cwpTotals, priorityCounts, topCompanies, totals] = await Promise.all([
          // Prospect count per state
          sql`SELECT state, COUNT(*)::int AS prospect_count
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
              GROUP BY state`,
          // Top 3 categories per state
          sql`SELECT state, category, COUNT(*)::int AS count
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != '' AND category IS NOT NULL
              GROUP BY state, category
              ORDER BY state, count DESC`,
          // Average signal count per state
          sql`SELECT state, ROUND(AVG(COALESCE(signal_count, 0))::numeric, 1)::float AS avg_signal
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
              GROUP BY state`,
          // Total CWP contacts per state
          sql`SELECT state, COALESCE(SUM(COALESCE(cwp_contacts, 0)), 0)::int AS cwp_total
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
              GROUP BY state`,
          // Priority breakdown per state
          sql`SELECT state, priority, COUNT(*)::int AS count
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
              GROUP BY state, priority`,
          // Top 3 companies per state by signal_count
          sql`SELECT state, company, signal_count, category, priority
              FROM (
                SELECT state, company, signal_count, category, priority,
                       ROW_NUMBER() OVER (PARTITION BY state ORDER BY signal_count DESC NULLS LAST) AS rn
                FROM prospect_companies
                WHERE state IS NOT NULL AND state != ''
              ) ranked
              WHERE rn <= 3`,
          // Pipeline-wide totals
          sql`SELECT
                COUNT(*)::int AS total_prospects,
                COUNT(DISTINCT state)::int AS states_covered,
                ROUND(AVG(COALESCE(signal_count, 0))::numeric, 1)::float AS avg_signal_overall,
                COALESCE(SUM(COALESCE(cwp_contacts, 0)), 0)::int AS total_cwp
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''`,
        ])

        // Build per-state object
        const stateData = {}

        for (const row of stateCounts) {
          stateData[row.state] = { prospect_count: row.prospect_count, categories: [], avg_signal: 0, cwp_total: 0, priorities: {}, top_companies: [] }
        }

        // Category breakdown (top 3 per state)
        const catByState = {}
        for (const row of categoryBreakdown) {
          if (!catByState[row.state]) catByState[row.state] = []
          if (catByState[row.state].length < 3) {
            catByState[row.state].push({ category: row.category, count: row.count })
          }
        }
        for (const [st, cats] of Object.entries(catByState)) {
          if (stateData[st]) stateData[st].categories = cats
        }

        for (const row of signalAvg) {
          if (stateData[row.state]) stateData[row.state].avg_signal = row.avg_signal
        }
        for (const row of cwpTotals) {
          if (stateData[row.state]) stateData[row.state].cwp_total = row.cwp_total
        }
        for (const row of priorityCounts) {
          if (stateData[row.state]) {
            stateData[row.state].priorities[row.priority || 'Unknown'] = row.count
          }
        }
        for (const row of topCompanies) {
          if (stateData[row.state]) {
            stateData[row.state].top_companies.push({
              company: row.company,
              signal_count: row.signal_count,
              category: row.category,
              priority: row.priority,
            })
          }
        }

        return res.status(200).json({
          ...stateData,
          _totals: totals[0] || { total_prospects: 0, states_covered: 0, avg_signal_overall: 0, total_cwp: 0 },
        })
      } catch (error) {
        console.error('Error fetching state stats:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // List all current state research reports (metadata only, no content)
    if (action === 'state-reports') {
      try {
        const reports = await sql`
          SELECT id, state_code, state_name, title, researched_at, researched_by,
                 uploaded_at, uploaded_by, prospect_count_at_time
          FROM state_research_reports
          WHERE is_current = TRUE
          ORDER BY state_name ASC
        `
        return res.status(200).json(reports)
      } catch (error) {
        console.error('Error fetching state reports:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Get full report for a single state (includes content)
    if (action === 'state-report') {
      const stateCode = req.query.state
      if (!stateCode) {
        return res.status(400).json({ error: 'state query param is required' })
      }
      try {
        const result = await sql`
          SELECT * FROM state_research_reports
          WHERE state_code = ${stateCode.toUpperCase()} AND is_current = TRUE
          LIMIT 1
        `
        if (!result || result.length === 0) {
          return res.status(200).json(null)
        }
        return res.status(200).json(result[0])
      } catch (error) {
        console.error('Error fetching state report:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Ontology: aggregate stats ───
    if (action === 'ontology-stats') {
      try {
        const [entityCounts, relCounts, layerCounts, lastRebuilt] = await Promise.all([
          sql`SELECT oet.name AS type_name, COUNT(*)::int AS count
              FROM ontology_entities oe
              JOIN ontology_entity_types oet ON oe.type_id = oet.id
              GROUP BY oet.name ORDER BY count DESC`,
          sql`SELECT ort.name AS type_name, COUNT(*)::int AS count
              FROM ontology_relationships orel
              JOIN ontology_relationship_types ort ON orel.type_id = ort.id
              GROUP BY ort.name ORDER BY count DESC`,
          sql`SELECT
                COUNT(*)::int AS total_entities,
                COUNT(*) FILTER (WHERE layer = 1)::int AS layer1_entities,
                COUNT(*) FILTER (WHERE layer = 2)::int AS layer2_entities
              FROM ontology_entities`,
          sql`SELECT MAX(updated_at) AS last_rebuilt
              FROM ontology_entities WHERE layer = 1`,
        ])

        const entity_counts = {}
        for (const r of entityCounts) entity_counts[r.type_name] = r.count
        const relationship_counts = {}
        for (const r of relCounts) relationship_counts[r.type_name] = r.count
        const totalRels = relCounts.reduce((s, r) => s + r.count, 0)

        return res.status(200).json({
          entity_counts,
          relationship_counts,
          total_entities: layerCounts[0]?.total_entities || 0,
          total_relationships: totalRels,
          layer1_entities: layerCounts[0]?.layer1_entities || 0,
          layer2_entities: layerCounts[0]?.layer2_entities || 0,
          last_rebuilt: lastRebuilt[0]?.last_rebuilt || null,
        })
      } catch (error) {
        console.error('Error fetching ontology stats:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Ontology: state-level summary for StateDetailPanel ───
    if (action === 'ontology-state-summary') {
      const stateCode = req.query.state
      if (!stateCode) {
        return res.status(400).json({ error: 'state query param is required' })
      }
      try {
        const stateUpper = stateCode.toUpperCase()
        const [certRows, techRows, ownerRows, medicalCount, rjgCount, entityCounts] = await Promise.all([
          // Top certifications in this state
          sql`SELECT oe_obj.name, COUNT(*)::int AS count
              FROM ontology_entities oe_comp
              JOIN prospect_companies pc ON oe_comp.prospect_company_id = pc.id
              JOIN ontology_relationships orel ON orel.subject_entity_id = oe_comp.id
              JOIN ontology_relationship_types ort ON orel.type_id = ort.id
              JOIN ontology_entities oe_obj ON orel.object_entity_id = oe_obj.id
              WHERE UPPER(pc.state) = ${stateUpper} AND ort.name = 'holds_certification'
              GROUP BY oe_obj.name ORDER BY count DESC LIMIT 10`,
          // Technologies in this state
          sql`SELECT oe_obj.name, COUNT(*)::int AS count
              FROM ontology_entities oe_comp
              JOIN prospect_companies pc ON oe_comp.prospect_company_id = pc.id
              JOIN ontology_relationships orel ON orel.subject_entity_id = oe_comp.id
              JOIN ontology_relationship_types ort ON orel.type_id = ort.id
              JOIN ontology_entities oe_obj ON orel.object_entity_id = oe_obj.id
              WHERE UPPER(pc.state) = ${stateUpper} AND ort.name = 'uses_technology'
              GROUP BY oe_obj.name ORDER BY count DESC LIMIT 10`,
          // Ownership breakdown
          sql`SELECT oe_obj.name, COUNT(*)::int AS count
              FROM ontology_entities oe_comp
              JOIN prospect_companies pc ON oe_comp.prospect_company_id = pc.id
              JOIN ontology_relationships orel ON orel.subject_entity_id = oe_comp.id
              JOIN ontology_relationship_types ort ON orel.type_id = ort.id
              JOIN ontology_entities oe_obj ON orel.object_entity_id = oe_obj.id
              WHERE UPPER(pc.state) = ${stateUpper} AND ort.name = 'has_ownership_structure'
              GROUP BY oe_obj.name ORDER BY count DESC`,
          // Medical device company count
          sql`SELECT COUNT(DISTINCT oe_comp.id)::int AS count
              FROM ontology_entities oe_comp
              JOIN prospect_companies pc ON oe_comp.prospect_company_id = pc.id
              JOIN ontology_relationships orel ON orel.subject_entity_id = oe_comp.id
              JOIN ontology_relationship_types ort ON orel.type_id = ort.id
              JOIN ontology_entities oe_obj ON orel.object_entity_id = oe_obj.id
              WHERE UPPER(pc.state) = ${stateUpper} AND ort.name = 'serves_market'
                AND oe_obj.name = 'Medical Devices'`,
          // RJG company count
          sql`SELECT COUNT(DISTINCT oe_comp.id)::int AS count
              FROM ontology_entities oe_comp
              JOIN prospect_companies pc ON oe_comp.prospect_company_id = pc.id
              JOIN ontology_relationships orel ON orel.subject_entity_id = oe_comp.id
              JOIN ontology_relationship_types ort ON orel.type_id = ort.id
              JOIN ontology_entities oe_obj ON orel.object_entity_id = oe_obj.id
              WHERE UPPER(pc.state) = ${stateUpper} AND ort.name = 'uses_technology'
                AND oe_obj.name = 'RJG Cavity Pressure Monitoring'`,
          // Entity counts by type for this state
          sql`SELECT oet.name AS type_name, COUNT(DISTINCT oe_obj.id)::int AS count
              FROM ontology_entities oe_comp
              JOIN prospect_companies pc ON oe_comp.prospect_company_id = pc.id
              JOIN ontology_relationships orel ON orel.subject_entity_id = oe_comp.id
              JOIN ontology_entities oe_obj ON orel.object_entity_id = oe_obj.id
              JOIN ontology_entity_types oet ON oe_obj.type_id = oet.id
              WHERE UPPER(pc.state) = ${stateUpper}
              GROUP BY oet.name ORDER BY count DESC`,
        ])

        const entity_counts = {}
        for (const r of entityCounts) entity_counts[r.type_name] = r.count
        // Add company count
        const companyCountResult = await sql`
          SELECT COUNT(*)::int AS count FROM ontology_entities oe
          JOIN prospect_companies pc ON oe.prospect_company_id = pc.id
          WHERE UPPER(pc.state) = ${stateUpper}
        `
        entity_counts['Company'] = companyCountResult[0]?.count || 0

        return res.status(200).json({
          state: stateUpper,
          entity_counts,
          top_certifications: certRows,
          top_technologies: techRows,
          ownership_breakdown: ownerRows,
          companies_with_medical: medicalCount[0]?.count || 0,
          companies_with_rjg: rjgCount[0]?.count || 0,
        })
      } catch (error) {
        console.error('Error fetching ontology state summary:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Attachments for a prospect
    if (action === 'attachments' && id) {
      try {
        const attachments = await sql`
          SELECT * FROM prospect_attachments
          WHERE prospect_id = ${id}
          ORDER BY created_at DESC
        `
        return res.status(200).json(attachments)
      } catch (error) {
        console.error('Error fetching attachments:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Analytics aggregation
    if (action === 'analytics') {
      try {
        const { category, priority, geography_tier, outreach_group, medical_device_mfg } = req.query

        // Build WHERE clause from filters
        const conditions = []
        const params = []

        if (outreach_group) {
          params.push(outreach_group)
          conditions.push(`outreach_group = $${params.length}`)
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

        // Run all aggregation queries in parallel
        const [
          groupCounts,
          categoryCounts,
          geoCounts,
          signalData,
          readinessData,
          ownershipData,
          groupTopCompanies,
          recentMA,
        ] = await Promise.all([
          // Group summary counts
          sql.query(
            `SELECT outreach_group, COUNT(*)::int AS count
             FROM prospect_companies ${whereClause}
             GROUP BY outreach_group ORDER BY count DESC`,
            params
          ),
          // Category breakdown
          sql.query(
            `SELECT category, COUNT(*)::int AS count
             FROM prospect_companies ${whereClause}
             GROUP BY category ORDER BY count DESC`,
            params
          ),
          // Geography distribution
          sql.query(
            `SELECT geography_tier, COUNT(*)::int AS count
             FROM prospect_companies ${whereClause}
             GROUP BY geography_tier ORDER BY count DESC`,
            params
          ),
          // Signal analysis (scatter data)
          sql.query(
            `SELECT id, company, signal_count, cwp_contacts, press_count,
                    revenue_est_m, outreach_group, medical_device_mfg
             FROM prospect_companies ${whereClause}
             ORDER BY signal_count DESC NULLS LAST`,
            params
          ),
          // Readiness scorecard (RJG x Medical)
          sql.query(
            `SELECT rjg_cavity_pressure, medical_device_mfg, COUNT(*)::int AS count
             FROM prospect_companies ${whereClause}
             GROUP BY rjg_cavity_pressure, medical_device_mfg`,
            params
          ),
          // Ownership breakdown
          sql.query(
            `SELECT ownership_type, COUNT(*)::int AS count
             FROM prospect_companies ${whereClause}
             GROUP BY ownership_type ORDER BY count DESC`,
            params
          ),
          // Top company per group (by signal_count)
          sql.query(
            `SELECT DISTINCT ON (outreach_group)
               outreach_group, company, signal_count, outreach_rank
             FROM prospect_companies ${whereClause}
             ORDER BY outreach_group, outreach_rank ASC NULLS LAST, signal_count DESC NULLS LAST`,
            params
          ),
          // Recent M&A companies
          sql.query(
            `SELECT id, company, ownership_type, recent_ma, outreach_group
             FROM prospect_companies
             ${whereClause ? whereClause + ' AND' : 'WHERE'} recent_ma IS NOT NULL AND recent_ma != ''
             ORDER BY company`,
            params
          ),
        ])

        // Readiness: group into RJG buckets with medical split
        const readinessGrouped = {}
        for (const row of readinessData) {
          const rjg = row.rjg_cavity_pressure || 'Unknown'
          const bucket = rjg.includes('Yes') || rjg.includes('confirmed') ? 'Confirmed'
            : rjg === 'Likely' ? 'Likely' : 'Unknown'
          if (!readinessGrouped[bucket]) readinessGrouped[bucket] = { medical: 0, nonMedical: 0 }
          if (row.medical_device_mfg === 'Yes') {
            readinessGrouped[bucket].medical += row.count
          } else {
            readinessGrouped[bucket].nonMedical += row.count
          }
        }

        // Get top companies for readiness "gold" segment (RJG confirmed + Medical)
        let readinessGoldCompanies = []
        const goldWhereBase = whereClause
          ? `${whereClause} AND`
          : 'WHERE'
        const goldResult = await sql.query(
          `SELECT company FROM prospect_companies
           ${goldWhereBase} (rjg_cavity_pressure LIKE '%Yes%' OR rjg_cavity_pressure LIKE '%confirmed%')
             AND medical_device_mfg = 'Yes'
           ORDER BY signal_count DESC NULLS LAST LIMIT 10`,
          params
        )
        readinessGoldCompanies = goldResult.map(r => r.company)

        return res.status(200).json({
          groups: groupCounts,
          groupTopCompanies: groupTopCompanies,
          categories: categoryCounts,
          geography: geoCounts,
          signals: signalData,
          readiness: readinessGrouped,
          readinessGoldCompanies,
          ownership: ownershipData,
          recentMA: recentMA,
        })
      } catch (error) {
        console.error('Error fetching prospect analytics:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Single prospect by ID
    if (id) {
      try {
        const result = await sql`
          SELECT p.*,
            (SELECT COUNT(*)::int FROM opportunities o WHERE o.source_prospect_id = p.id) as conversion_count
          FROM prospect_companies p
          WHERE p.id = ${id}
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

    // List all with optional filters
    try {
      const { category, priority, geography_tier, outreach_group, medical_device_mfg, prospect_status } = req.query

      let prospects

      if (category || priority || geography_tier || outreach_group || medical_device_mfg || prospect_status) {
        const conditions = []
        const params = []

        if (outreach_group) {
          params.push(outreach_group)
          conditions.push(`outreach_group = $${params.length}`)
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
        if (prospect_status) {
          params.push(prospect_status)
          conditions.push(`prospect_status = $${params.length}`)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const queryText = `
          SELECT p.*,
            (SELECT COUNT(*)::int FROM opportunities o WHERE o.source_prospect_id = p.id) as conversion_count
          FROM prospect_companies p
          ${whereClause}
          ORDER BY
            CASE p.outreach_group
              WHEN 'Group 1' THEN 1
              WHEN 'Time-Sensitive' THEN 2
              WHEN 'Group 2' THEN 3
              WHEN 'Infrastructure' THEN 4
              ELSE 5
            END,
            p.outreach_rank ASC NULLS LAST,
            p.signal_count DESC NULLS LAST
        `
        prospects = await sql.query(queryText, params)
      } else {
        prospects = await sql`
          SELECT p.*,
            (SELECT COUNT(*)::int FROM opportunities o WHERE o.source_prospect_id = p.id) as conversion_count
          FROM prospect_companies p
          ORDER BY
            CASE p.outreach_group
              WHEN 'Group 1' THEN 1
              WHEN 'Time-Sensitive' THEN 2
              WHEN 'Group 2' THEN 3
              WHEN 'Infrastructure' THEN 4
              ELSE 5
            END,
            p.outreach_rank ASC NULLS LAST,
            p.signal_count DESC NULLS LAST
        `
      }

      return res.status(200).json(prospects)
    } catch (error) {
      console.error('Error fetching prospects:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  // ─── DELETE ─────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (action === 'delete-attachment') {
      const { attachmentId } = req.query
      if (!attachmentId) {
        return res.status(400).json({ error: 'attachmentId query param is required' })
      }
      try {
        await sql`DELETE FROM prospect_attachments WHERE id = ${attachmentId}`
        return res.status(200).json({ deleted: true })
      } catch (error) {
        console.error('Error deleting attachment:', error)
        return res.status(500).json({ error: error.message })
      }
    }
    return res.status(400).json({ error: 'Unknown DELETE action' })
  }

  // ─── POST ──────────────────────────────────────────────
  if (req.method === 'POST') {
    // ─── Ontology: Layer 1 auto-derivation rebuild ───
    if (action === 'rebuild-ontology-layer1') {
      try {
        const startTime = Date.now()

        // 1. Load entity type and relationship type lookups
        const [entityTypes, relTypes] = await Promise.all([
          sql`SELECT id, name FROM ontology_entity_types`,
          sql`SELECT id, name FROM ontology_relationship_types`,
        ])
        const typeMap = {}
        for (const t of entityTypes) typeMap[t.name] = t.id
        const relMap = {}
        for (const r of relTypes) relMap[r.name] = r.id

        if (!typeMap['Company'] || !typeMap['Certification']) {
          return res.status(500).json({ error: 'Ontology entity types not seeded. Run the SQL migration first.' })
        }

        // 2. Clear all Layer 1 data (relationships first due to FK cascade)
        await sql`DELETE FROM ontology_relationships WHERE layer = 1`
        await sql`DELETE FROM ontology_entities WHERE layer = 1`

        // 3. Read all prospects
        const prospects = await sql`SELECT * FROM prospect_companies`

        let entitiesCreated = 0
        let relationshipsCreated = 0

        // Helper: normalize entity name
        function normalizeName(raw) {
          return raw.trim().replace(/\s+/g, ' ')
        }

        // Helper: UPSERT entity and return its id
        async function upsertEntity(typeId, name, attrs = {}, prospectCompanyId = null, source = null, confidence = 'Confirmed') {
          const normalized = normalizeName(name)
          if (!normalized) return null
          const result = await sql`
            INSERT INTO ontology_entities (type_id, name, attributes, prospect_company_id, source, confidence, layer)
            VALUES (${typeId}, ${normalized}, ${JSON.stringify(attrs)}, ${prospectCompanyId}, ${source}, ${confidence}, 1)
            ON CONFLICT (type_id, name) DO UPDATE SET
              updated_at = NOW(),
              prospect_company_id = COALESCE(ontology_entities.prospect_company_id, EXCLUDED.prospect_company_id)
            RETURNING id
          `
          entitiesCreated++
          return result[0]?.id
        }

        // Helper: INSERT relationship (skip on conflict)
        async function insertRelationship(relTypeId, subjectId, objectId, source = null, confidence = 'Confirmed') {
          if (!relTypeId || !subjectId || !objectId) return
          await sql`
            INSERT INTO ontology_relationships (type_id, subject_entity_id, object_entity_id, source, confidence, layer)
            VALUES (${relTypeId}, ${subjectId}, ${objectId}, ${source}, ${confidence}, 1)
            ON CONFLICT (type_id, subject_entity_id, object_entity_id) DO NOTHING
          `
          relationshipsCreated++
        }

        // 4. Process each prospect
        for (const p of prospects) {
          const source = p.source_report || null

          // Create Company entity
          const companyAttrs = {}
          if (p.category) companyAttrs.category = p.category
          if (p.in_house_tooling) companyAttrs.in_house_tooling = p.in_house_tooling
          const companyId = await upsertEntity(typeMap['Company'], p.company, companyAttrs, p.id, source)
          if (!companyId) continue

          // Parse certifications (comma-separated)
          if (p.key_certifications && p.key_certifications.trim()) {
            const certs = p.key_certifications.split(',').map(c => c.trim()).filter(Boolean)
            for (const cert of certs) {
              const certId = await upsertEntity(typeMap['Certification'], cert, {}, null, source)
              if (certId) {
                await insertRelationship(relMap['holds_certification'], companyId, certId, source)
              }
            }
          }

          // RJG cavity pressure → Technology entity
          if (p.rjg_cavity_pressure) {
            const rjgVal = p.rjg_cavity_pressure.toLowerCase()
            if (rjgVal.includes('yes') || rjgVal.includes('confirmed')) {
              const techId = await upsertEntity(typeMap['Technology / Software'], 'RJG Cavity Pressure Monitoring', {}, null, source)
              if (techId) {
                await insertRelationship(relMap['uses_technology'], companyId, techId, source, 'Confirmed')
              }
            } else if (rjgVal === 'likely') {
              const techId = await upsertEntity(typeMap['Technology / Software'], 'RJG Cavity Pressure Monitoring', {}, null, source, 'Likely')
              if (techId) {
                await insertRelationship(relMap['uses_technology'], companyId, techId, source, 'Likely')
              }
            }
          }

          // Medical device manufacturing → Market Vertical
          if (p.medical_device_mfg === 'Yes') {
            const marketId = await upsertEntity(typeMap['Market Vertical'], 'Medical Devices', {}, null, source)
            if (marketId) {
              await insertRelationship(relMap['serves_market'], companyId, marketId, source)
            }
          }

          // Ownership type → Ownership Structure entity
          if (p.ownership_type && p.ownership_type.trim()) {
            const ownerId = await upsertEntity(typeMap['Ownership Structure'], p.ownership_type.trim(), {}, null, source)
            if (ownerId) {
              await insertRelationship(relMap['has_ownership_structure'], companyId, ownerId, source)
            }
          }

          // Parent company → Company entity + subsidiary_of relationship
          if (p.parent_company && p.parent_company.trim()) {
            const parentId = await upsertEntity(typeMap['Company'], p.parent_company.trim(), {}, null, source)
            if (parentId) {
              await insertRelationship(relMap['subsidiary_of'], companyId, parentId, source)
            }
          }
        }

        const duration = Date.now() - startTime
        return res.status(200).json({
          entities_created: entitiesCreated,
          relationships_created: relationshipsCreated,
          prospects_processed: prospects.length,
          duration_ms: duration,
        })
      } catch (error) {
        console.error('Error rebuilding ontology Layer 1:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Save/replace a state research report
    if (action === 'save-state-report') {
      try {
        const { state_code, state_name, title, content, researched_at, researched_by, uploaded_by } = req.body
        if (!state_code || !content) {
          return res.status(400).json({ error: 'state_code and content are required' })
        }

        // Auto-compute prospect count for this state
        const countResult = await sql`
          SELECT COUNT(*)::int AS count FROM prospect_companies
          WHERE UPPER(state) = ${state_code.toUpperCase()}
        `
        const prospectCount = countResult[0]?.count || 0

        // Archive existing current report for this state
        await sql`
          UPDATE state_research_reports
          SET is_current = false
          WHERE state_code = ${state_code.toUpperCase()} AND is_current = true
        `

        // Insert new report
        const result = await sql`
          INSERT INTO state_research_reports (
            state_code, state_name, title, content,
            researched_at, researched_by, uploaded_by,
            prospect_count_at_time, is_current
          ) VALUES (
            ${state_code.toUpperCase()},
            ${state_name || state_code},
            ${title || `Alliance Prospect Report — ${state_name || state_code}`},
            ${content},
            ${researched_at || new Date().toISOString()},
            ${researched_by || null},
            ${uploaded_by || 'Unknown'},
            ${prospectCount},
            true
          )
          RETURNING id, state_code, state_name, title, researched_at, researched_by,
                    uploaded_at, uploaded_by, prospect_count_at_time
        `

        return res.status(201).json(result[0])
      } catch (error) {
        console.error('Error saving state report:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Attach content to a prospect
    if (action === 'attach') {
      try {
        const { prospect_id, attachment_type, title, content, created_by } = req.body
        if (!prospect_id || !content) {
          return res.status(400).json({ error: 'prospect_id and content are required' })
        }

        const result = await sql`
          INSERT INTO prospect_attachments (prospect_id, attachment_type, title, content, created_by)
          VALUES (${prospect_id}, ${attachment_type || 'research_brief'}, ${title || null}, ${content}, ${created_by || null})
          RETURNING *
        `

        // Auto-advance status if research_brief
        if ((attachment_type || 'research_brief') === 'research_brief') {
          await sql`
            UPDATE prospect_companies
            SET prospect_status = 'Outreach Ready',
                last_edited_by = ${created_by || null},
                updated_at = NOW()
            WHERE id = ${prospect_id}
              AND prospect_status IN ('Identified', 'Prioritized', 'Research Complete')
          `
        }

        return res.status(201).json(result[0])
      } catch (error) {
        console.error('Error creating attachment:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // One-time seed: POST /api/prospects?action=seed
    if (action === 'seed') {
      try {
        // Check if data already exists
        const existing = await sql`SELECT COUNT(*)::int AS count FROM prospect_companies`
        if (existing[0].count > 0) {
          return res.status(200).json({
            message: `Table already has ${existing[0].count} rows. Seed skipped. To re-seed, delete all rows first.`,
            count: existing[0].count,
          })
        }

        const companies = [
          // Group 1 (ranked 1-5)
          { company: 'Matrix Tool, Inc.', city: 'Fairview', state: 'PA', category: 'Converter+Tooling', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY', outreach_group: 'Group 1', outreach_rank: 1 },
          { company: 'X-Cell Tool & Mold', city: 'Fairview', state: 'PA', category: 'Mold Maker', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY', outreach_group: 'Group 1', outreach_rank: 2 },
          { company: 'C&J Industries, Inc.', city: 'Meadville', state: 'PA', category: 'Converter+Tooling', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY', outreach_group: 'Group 1', outreach_rank: 3 },
          { company: 'Automation Plastics Corp', city: 'Aurora', state: 'OH', category: 'Converter', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY', outreach_group: 'Group 1', outreach_rank: 4 },
          { company: 'Erie Molded Plastics', city: 'Erie', state: 'PA', category: 'Converter', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY', outreach_group: 'Group 1', outreach_rank: 5 },
          // Time-Sensitive
          { company: 'Currier Plastics', city: 'Auburn', state: 'NY', category: 'Converter', geography_tier: 'Tier 2', priority: 'HIGH PRIORITY', outreach_group: 'Time-Sensitive', notes: 'PE acquisition Sept 2025 — inside optimal window NOW' },
          { company: 'Allegheny Performance Plastics', city: 'Meadville', state: 'PA', category: 'Converter', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY', outreach_group: 'Time-Sensitive', notes: 'PE acquisition Oct 2025' },
          // Group 2
          { company: 'Venture Plastics', category: 'Converter', priority: 'QUALIFIED', outreach_group: 'Group 2' },
          { company: 'Ferriot Inc.', category: 'Converter+Tooling', priority: 'QUALIFIED', outreach_group: 'Group 2' },
          { company: 'Accudyn Products', category: 'Converter', priority: 'QUALIFIED', outreach_group: 'Group 2' },
          { company: 'Caplugs/Protective Industries', category: 'Converter', priority: 'QUALIFIED', outreach_group: 'Group 2' },
          { company: 'TTMP/PRISM Plastics', category: 'Converter', priority: 'QUALIFIED', outreach_group: 'Group 2' },
          { company: 'Adler Industrial Solutions', category: 'Converter', priority: 'QUALIFIED', outreach_group: 'Group 2' },
          { company: 'Essentra Components', category: 'Converter', priority: 'QUALIFIED', outreach_group: 'Group 2' },
          // Infrastructure
          { company: 'RJG Inc.', category: 'Knowledge Sector', priority: 'STRATEGIC PARTNER', outreach_group: 'Infrastructure' },
          { company: 'DME Company', category: 'Hot Runner Systems', priority: 'STRATEGIC PARTNER', outreach_group: 'Infrastructure' },
          { company: 'Husky Technologies', category: 'Hot Runner Systems', priority: 'STRATEGIC PARTNER', outreach_group: 'Infrastructure' },
          { company: 'Mold-Masters', category: 'Hot Runner Systems', priority: 'STRATEGIC PARTNER', outreach_group: 'Infrastructure' },
          { company: 'Beaumont Technologies', category: 'Knowledge Sector', priority: 'STRATEGIC PARTNER', outreach_group: 'Infrastructure' },
        ]

        let inserted = 0
        for (const c of companies) {
          await sql`
            INSERT INTO prospect_companies (
              company, city, state, category, geography_tier, priority,
              outreach_group, outreach_rank, notes
            ) VALUES (
              ${c.company}, ${c.city || null}, ${c.state || null}, ${c.category || null},
              ${c.geography_tier || null}, ${c.priority || null},
              ${c.outreach_group || 'Unassigned'}, ${c.outreach_rank || null}, ${c.notes || null}
            )
          `
          inserted++
        }

        return res.status(201).json({ message: `Seeded ${inserted} prospect companies`, inserted })
      } catch (error) {
        console.error('Error seeding prospects:', error)
        return res.status(500).json({ error: error.message })
      }
    }

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
            SELECT id, outreach_group, outreach_rank, group_notes, last_edited_by
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
                parent_company = COALESCE(${p.parent_company || null}, parent_company),
                decision_location = COALESCE(${p.decision_location || null}, decision_location),
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
                key_certifications, ownership_type, recent_ma, parent_company, decision_location,
                cwp_contacts, psb_connection_notes,
                engagement_type, suggested_next_step, legacy_data_potential, notes,
                outreach_group, outreach_rank
              ) VALUES (
                ${company}, ${p.also_known_as || null}, ${p.website || null}, ${p.category || null}, ${p.in_house_tooling || null},
                ${p.city || null}, ${p.state || null}, ${p.geography_tier || null}, ${p.source_report || null}, ${p.priority || null},
                ${p.employees_approx || null}, ${p.year_founded || null}, ${p.years_in_business || null}, ${p.revenue_known || null}, ${p.revenue_est_m || null},
                ${p.press_count || null}, ${p.signal_count || null}, ${p.top_signal || null}, ${p.rjg_cavity_pressure || null}, ${p.medical_device_mfg || null},
                ${p.key_certifications || null}, ${p.ownership_type || null}, ${p.recent_ma || null}, ${p.parent_company || null}, ${p.decision_location || null},
                ${p.cwp_contacts || null}, ${p.psb_connection_notes || null},
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
          key_certifications, ownership_type, recent_ma, parent_company, decision_location,
          cwp_contacts, psb_connection_notes,
          engagement_type, suggested_next_step, legacy_data_potential, notes,
          outreach_group, outreach_rank, group_notes, last_edited_by
        ) VALUES (
          ${company.trim()}, ${b.also_known_as || null}, ${b.website || null}, ${b.category || null}, ${b.in_house_tooling || null},
          ${b.city || null}, ${b.state || null}, ${b.geography_tier || null}, ${b.source_report || null}, ${b.priority || null},
          ${b.employees_approx || null}, ${b.year_founded || null}, ${b.years_in_business || null}, ${b.revenue_known || null}, ${b.revenue_est_m || null},
          ${b.press_count || null}, ${b.signal_count || null}, ${b.top_signal || null}, ${b.rjg_cavity_pressure || null}, ${b.medical_device_mfg || null},
          ${b.key_certifications || null}, ${b.ownership_type || null}, ${b.recent_ma || null}, ${b.parent_company || null}, ${b.decision_location || null},
          ${b.cwp_contacts || null}, ${b.psb_connection_notes || null},
          ${b.engagement_type || null}, ${b.suggested_next_step || null}, ${b.legacy_data_potential || null}, ${b.notes || null},
          ${b.outreach_group || 'Unassigned'}, ${b.outreach_rank || null}, ${b.group_notes || null}, ${b.last_edited_by || null}
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
      'outreach_group', 'outreach_rank', 'group_notes', 'last_edited_by', 'prospect_status',
      'parent_company', 'decision_location',
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
