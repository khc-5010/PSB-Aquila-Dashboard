import { neon } from '@neondatabase/serverless'

// ─── Ontology Layer 1: Full rebuild (all prospects) ─────────────────
// Clears all Layer 1 entities/relationships and regenerates from prospect_companies.
// Layer 2 data is never touched. Returns stats object.
async function rebuildOntologyLayer1(sql) {
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
    throw new Error('Ontology entity types not seeded. Run the SQL migration first.')
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
  return {
    entities_created: entitiesCreated,
    relationships_created: relationshipsCreated,
    prospects_processed: prospects.length,
    duration_ms: duration,
  }
}

// ─── Ontology Layer 1: Per-prospect rebuild ─────────────────────────
// Rebuilds Layer 1 relationships for a single prospect without touching
// shared entities or Layer 2 data. Safe against CASCADE — only deletes
// Layer 1 relationships where this company is the subject.
async function rebuildOntologyForProspect(sql, prospectId) {
  const start = Date.now()

  // 1. Load lookups
  const [entityTypes, relTypes] = await Promise.all([
    sql`SELECT id, name FROM ontology_entity_types`,
    sql`SELECT id, name FROM ontology_relationship_types`,
  ])
  const typeMap = {}
  for (const t of entityTypes) typeMap[t.name] = t.id
  const relMap = {}
  for (const r of relTypes) relMap[r.name] = r.id

  if (!typeMap['Company']) {
    throw new Error('Ontology entity types not seeded.')
  }

  // 2. Get the prospect record
  const prospectRows = await sql`SELECT * FROM prospect_companies WHERE id = ${prospectId}`
  if (prospectRows.length === 0) {
    return { prospect_id: prospectId, error: 'Prospect not found', duration_ms: Date.now() - start }
  }
  const p = prospectRows[0]
  const source = p.source_report || null

  // Helper: normalize entity name
  function normalizeName(raw) {
    return raw.trim().replace(/\s+/g, ' ')
  }

  let entitiesUpserted = 0
  let relationshipsCreated = 0

  // Helper: UPSERT entity and return its id
  async function upsertEntity(typeId, name, attrs = {}, prospectCompanyId = null, entitySource = null, confidence = 'Confirmed') {
    const normalized = normalizeName(name)
    if (!normalized) return null
    const result = await sql`
      INSERT INTO ontology_entities (type_id, name, attributes, prospect_company_id, source, confidence, layer)
      VALUES (${typeId}, ${normalized}, ${JSON.stringify(attrs)}, ${prospectCompanyId}, ${entitySource}, ${confidence}, 1)
      ON CONFLICT (type_id, name) DO UPDATE SET
        updated_at = NOW(),
        prospect_company_id = COALESCE(ontology_entities.prospect_company_id, EXCLUDED.prospect_company_id)
      RETURNING id
    `
    entitiesUpserted++
    return result[0]?.id
  }

  // Helper: INSERT relationship (skip on conflict)
  async function insertRelationship(relTypeId, subjectId, objectId, relSource = null, confidence = 'Confirmed') {
    if (!relTypeId || !subjectId || !objectId) return
    await sql`
      INSERT INTO ontology_relationships (type_id, subject_entity_id, object_entity_id, source, confidence, layer)
      VALUES (${relTypeId}, ${subjectId}, ${objectId}, ${relSource}, ${confidence}, 1)
      ON CONFLICT (type_id, subject_entity_id, object_entity_id) DO NOTHING
    `
    relationshipsCreated++
  }

  // 3. Find or create the Company entity
  const companyAttrs = {}
  if (p.category) companyAttrs.category = p.category
  if (p.in_house_tooling) companyAttrs.in_house_tooling = p.in_house_tooling
  const companyId = await upsertEntity(typeMap['Company'], p.company, companyAttrs, p.id, source)
  if (!companyId) {
    return { prospect_id: prospectId, error: 'Could not create Company entity', duration_ms: Date.now() - start }
  }

  // 4. Delete Layer 1 RELATIONSHIPS only where this company is the subject
  //    Never delete entities — shared entities (ISO 9001, etc.) must survive
  //    Never touch Layer 2 relationships
  await sql`
    DELETE FROM ontology_relationships
    WHERE subject_entity_id = ${companyId} AND layer = 1
  `

  // 5. Re-derive relationships from this prospect's current fields

  // Certifications
  if (p.key_certifications && p.key_certifications.trim()) {
    const certs = p.key_certifications.split(',').map(c => c.trim()).filter(Boolean)
    for (const cert of certs) {
      const certId = await upsertEntity(typeMap['Certification'], cert, {}, null, source)
      if (certId) {
        await insertRelationship(relMap['holds_certification'], companyId, certId, source)
      }
    }
  }

  // RJG cavity pressure
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

  // Medical device manufacturing
  if (p.medical_device_mfg === 'Yes') {
    const marketId = await upsertEntity(typeMap['Market Vertical'], 'Medical Devices', {}, null, source)
    if (marketId) {
      await insertRelationship(relMap['serves_market'], companyId, marketId, source)
    }
  }

  // Ownership type
  if (p.ownership_type && p.ownership_type.trim()) {
    const ownerId = await upsertEntity(typeMap['Ownership Structure'], p.ownership_type.trim(), {}, null, source)
    if (ownerId) {
      await insertRelationship(relMap['has_ownership_structure'], companyId, ownerId, source)
    }
  }

  // Parent company
  if (p.parent_company && p.parent_company.trim()) {
    const parentId = await upsertEntity(typeMap['Company'], p.parent_company.trim(), {}, null, source)
    if (parentId) {
      await insertRelationship(relMap['subsidiary_of'], companyId, parentId, source)
    }
  }

  return {
    prospect_id: prospectId,
    entities_upserted: entitiesUpserted,
    relationships_created: relationshipsCreated,
    duration_ms: Date.now() - start,
  }
}

// Fields that affect ontology — PATCH only triggers rebuild when one of these changes
const ONTOLOGY_FIELDS = [
  'key_certifications', 'rjg_cavity_pressure', 'medical_device_mfg',
  'ownership_type', 'parent_company', 'category', 'in_house_tooling',
]

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

    // ─── Ontology: density by state (for National Map metric) ───
    if (action === 'ontology-density-by-state') {
      try {
        const [relsByState, entsByState, prospectsByState, layerBreakdown] = await Promise.all([
          // Relationship count per state (via subject Company entity → prospect_companies.state)
          sql`SELECT UPPER(pc.state) AS state_code, COUNT(*)::int AS relationship_count
              FROM ontology_relationships orel
              JOIN ontology_entities oe ON orel.subject_entity_id = oe.id
              JOIN prospect_companies pc ON oe.prospect_company_id = pc.id
              WHERE pc.state IS NOT NULL AND pc.state != ''
              GROUP BY UPPER(pc.state)`,
          // Entity count per state (Company entities + related object entities)
          sql`SELECT UPPER(pc.state) AS state_code, COUNT(DISTINCT oe_obj.id)::int + COUNT(DISTINCT oe.id)::int AS entity_count
              FROM ontology_entities oe
              JOIN prospect_companies pc ON oe.prospect_company_id = pc.id
              LEFT JOIN ontology_relationships orel ON orel.subject_entity_id = oe.id
              LEFT JOIN ontology_entities oe_obj ON orel.object_entity_id = oe_obj.id
              WHERE pc.state IS NOT NULL AND pc.state != ''
              GROUP BY UPPER(pc.state)`,
          // Prospect count per state (for normalization)
          sql`SELECT UPPER(state) AS state_code, COUNT(*)::int AS prospect_count
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
              GROUP BY UPPER(state)`,
          // Layer breakdown per state
          sql`SELECT UPPER(pc.state) AS state_code,
                COUNT(*) FILTER (WHERE orel.layer = 1)::int AS layer1_relationships,
                COUNT(*) FILTER (WHERE orel.layer = 2)::int AS layer2_relationships
              FROM ontology_relationships orel
              JOIN ontology_entities oe ON orel.subject_entity_id = oe.id
              JOIN prospect_companies pc ON oe.prospect_company_id = pc.id
              WHERE pc.state IS NOT NULL AND pc.state != ''
              GROUP BY UPPER(pc.state)`,
        ])

        // Build lookup maps
        const relsMap = {}
        for (const r of relsByState) relsMap[r.state_code] = r.relationship_count
        const entsMap = {}
        for (const r of entsByState) entsMap[r.state_code] = r.entity_count
        const prospectsMap = {}
        for (const r of prospectsByState) prospectsMap[r.state_code] = r.prospect_count
        const layerMap = {}
        for (const r of layerBreakdown) layerMap[r.state_code] = { layer1: r.layer1_relationships, layer2: r.layer2_relationships }

        // Collect all state codes
        const allCodes = new Set([...Object.keys(relsMap), ...Object.keys(entsMap)])
        const result = {}
        let totalEntities = 0, totalRelationships = 0, statesWithOntology = 0

        for (const code of allCodes) {
          const relCount = relsMap[code] || 0
          const entCount = entsMap[code] || 0
          const prospCount = prospectsMap[code] || 0
          const layers = layerMap[code] || { layer1: 0, layer2: 0 }
          const density = prospCount > 0 ? Math.round((relCount / prospCount) * 100) / 100 : 0

          result[code] = {
            entity_count: entCount,
            relationship_count: relCount,
            prospect_count: prospCount,
            density,
            layer1_relationships: layers.layer1,
            layer2_relationships: layers.layer2,
          }
          totalEntities += entCount
          totalRelationships += relCount
          if (relCount > 0) statesWithOntology++
        }

        result._totals = { total_entities: totalEntities, total_relationships: totalRelationships, states_with_ontology: statesWithOntology }
        return res.status(200).json(result)
      } catch (error) {
        console.error('Error fetching ontology density by state:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // All ontology entities grouped by type (for extraction prompt deduplication)
    if (action === 'ontology-existing-entities') {
      try {
        const rows = await sql`
          SELECT et.name AS type_name, e.name AS entity_name
          FROM ontology_entities e
          JOIN ontology_entity_types et ON et.id = e.type_id
          ORDER BY et.name, e.name
        `
        const grouped = {}
        for (const row of rows) {
          if (!grouped[row.type_name]) grouped[row.type_name] = []
          grouped[row.type_name].push(row.entity_name)
        }
        return res.status(200).json(grouped)
      } catch (error) {
        console.error('Error fetching ontology existing entities:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Ontology: Knowledge Graph — aggregated super-node explorer ───
    if (action === 'ontology-graph') {
      try {
        const { state, type } = req.query

        // Build optional WHERE filters for company scoping
        let companyFilter = ''
        const filterParams = []
        if (state) {
          filterParams.push(state.toUpperCase())
          companyFilter = `AND pc.state = $1`
        }

        // Get all non-Company entities with relationship counts (as super-nodes)
        const superNodesQuery = `
          SELECT
            et.name AS type_name,
            e.id AS entity_id,
            e.name AS entity_name,
            COUNT(DISTINCT r.subject_entity_id) AS connection_count,
            ARRAY_AGG(DISTINCT r.subject_entity_id) AS member_ids
          FROM ontology_entities e
          JOIN ontology_entity_types et ON et.id = e.type_id
          JOIN ontology_relationships r ON r.object_entity_id = e.id
          JOIN ontology_entities subj ON subj.id = r.subject_entity_id
          JOIN ontology_entity_types subj_type ON subj_type.id = subj.type_id AND subj_type.name = 'Company'
          ${state ? `JOIN prospect_companies pc ON pc.id = subj.prospect_company_id ${companyFilter}` : ''}
          WHERE et.name != 'Company'
          ${type ? `AND et.name = $${filterParams.length + 1}` : ''}
          GROUP BY et.name, e.id, e.name
          HAVING COUNT(DISTINCT r.subject_entity_id) > 0
          ORDER BY COUNT(DISTINCT r.subject_entity_id) DESC
        `
        const queryParams = [...filterParams]
        if (type) queryParams.push(type)

        const superNodes = await sql.query(superNodesQuery, queryParams)

        // Build node list
        const nodes = superNodes.map(sn => ({
          id: `${sn.type_name.toLowerCase().replace(/[\s\/]/g, '-')}-${sn.entity_name}`,
          entityId: sn.entity_id,
          label: sn.entity_name,
          type: sn.type_name,
          count: Number(sn.connection_count),
          isSuper: true,
          memberIds: sn.member_ids.map(Number),
        }))

        // Compute inter-super-node links (shared companies)
        const links = []
        for (let i = 0; i < nodes.length; i++) {
          const setA = new Set(nodes[i].memberIds)
          for (let j = i + 1; j < nodes.length; j++) {
            const setB = new Set(nodes[j].memberIds)
            let shared = 0
            for (const id of setA) {
              if (setB.has(id)) shared++
            }
            if (shared > 0) {
              const strength = shared / Math.max(setA.size, setB.size)
              if (strength >= 0.1) {
                links.push({
                  source: nodes[i].id,
                  target: nodes[j].id,
                  strength: Math.round(strength * 100) / 100,
                  sharedCount: shared,
                })
              }
            }
          }
        }

        // Meta stats
        const metaRows = await sql`
          SELECT
            (SELECT COUNT(*)::int FROM ontology_entities) AS total_entities,
            (SELECT COUNT(*)::int FROM ontology_relationships) AS total_relationships
        `

        return res.status(200).json({
          nodes,
          links,
          meta: {
            totalEntities: metaRows[0].total_entities,
            totalRelationships: metaRows[0].total_relationships,
            stateFilter: state || null,
            typeFilter: type || null,
          },
        })
      } catch (error) {
        console.error('Error fetching ontology graph:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Ontology: Knowledge Graph — 1-hop neighborhood ───
    if (action === 'ontology-neighborhood') {
      try {
        const { entity_id, depth } = req.query
        if (!entity_id) {
          return res.status(400).json({ error: 'entity_id is required' })
        }
        const maxDepth = Math.min(Number(depth) || 1, 2)

        // Get the root entity
        const rootRows = await sql`
          SELECT e.id, e.name, et.name AS type_name, e.prospect_company_id
          FROM ontology_entities e
          JOIN ontology_entity_types et ON et.id = e.type_id
          WHERE e.id = ${entity_id}
        `
        if (rootRows.length === 0) {
          return res.status(404).json({ error: 'Entity not found' })
        }
        const root = rootRows[0]

        // Depth 1: all relationships where entity is subject OR object
        const depth1Rels = await sql`
          SELECT
            r.id AS rel_id,
            rt.name AS rel_type,
            r.subject_entity_id,
            r.object_entity_id,
            se.name AS subject_name,
            set2.name AS subject_type,
            se.prospect_company_id AS subject_prospect_id,
            oe.name AS object_name,
            oet.name AS object_type,
            oe.prospect_company_id AS object_prospect_id
          FROM ontology_relationships r
          JOIN ontology_relationship_types rt ON rt.id = r.type_id
          JOIN ontology_entities se ON se.id = r.subject_entity_id
          JOIN ontology_entity_types set2 ON set2.id = se.type_id
          JOIN ontology_entities oe ON oe.id = r.object_entity_id
          JOIN ontology_entity_types oet ON oet.id = oe.type_id
          WHERE r.subject_entity_id = ${entity_id}
             OR r.object_entity_id = ${entity_id}
        `

        const entityMap = new Map()
        const linkList = []

        // Add root
        entityMap.set(Number(root.id), {
          id: Number(root.id),
          label: root.name,
          type: root.type_name,
          isSuper: false,
          prospectId: root.prospect_company_id,
        })

        for (const rel of depth1Rels) {
          // Add subject entity
          if (!entityMap.has(Number(rel.subject_entity_id))) {
            entityMap.set(Number(rel.subject_entity_id), {
              id: Number(rel.subject_entity_id),
              label: rel.subject_name,
              type: rel.subject_type,
              isSuper: false,
              prospectId: rel.subject_prospect_id,
            })
          }
          // Add object entity
          if (!entityMap.has(Number(rel.object_entity_id))) {
            entityMap.set(Number(rel.object_entity_id), {
              id: Number(rel.object_entity_id),
              label: rel.object_name,
              type: rel.object_type,
              isSuper: false,
              prospectId: rel.object_prospect_id,
            })
          }
          linkList.push({
            source: Number(rel.subject_entity_id),
            target: Number(rel.object_entity_id),
            relType: rel.rel_type,
          })
        }

        // Depth 2: for each neighbor, get their relationships too
        if (maxDepth >= 2) {
          const neighborIds = [...entityMap.keys()].filter(id => id !== Number(entity_id))
          if (neighborIds.length > 0) {
            const depth2Rels = await sql`
              SELECT
                r.id AS rel_id,
                rt.name AS rel_type,
                r.subject_entity_id,
                r.object_entity_id,
                se.name AS subject_name,
                set2.name AS subject_type,
                se.prospect_company_id AS subject_prospect_id,
                oe.name AS object_name,
                oet.name AS object_type,
                oe.prospect_company_id AS object_prospect_id
              FROM ontology_relationships r
              JOIN ontology_relationship_types rt ON rt.id = r.type_id
              JOIN ontology_entities se ON se.id = r.subject_entity_id
              JOIN ontology_entity_types set2 ON set2.id = se.type_id
              JOIN ontology_entities oe ON oe.id = r.object_entity_id
              JOIN ontology_entity_types oet ON oet.id = oe.type_id
              WHERE (r.subject_entity_id = ANY(${neighborIds})
                 OR r.object_entity_id = ANY(${neighborIds}))
                AND r.subject_entity_id != ${entity_id}
                AND r.object_entity_id != ${entity_id}
            `
            for (const rel of depth2Rels) {
              if (!entityMap.has(Number(rel.subject_entity_id))) {
                entityMap.set(Number(rel.subject_entity_id), {
                  id: Number(rel.subject_entity_id),
                  label: rel.subject_name,
                  type: rel.subject_type,
                  isSuper: false,
                  prospectId: rel.subject_prospect_id,
                })
              }
              if (!entityMap.has(Number(rel.object_entity_id))) {
                entityMap.set(Number(rel.object_entity_id), {
                  id: Number(rel.object_entity_id),
                  label: rel.object_name,
                  type: rel.object_type,
                  isSuper: false,
                  prospectId: rel.object_prospect_id,
                })
              }
              const linkKey = `${rel.subject_entity_id}-${rel.object_entity_id}-${rel.rel_type}`
              if (!linkList.some(l => `${l.source}-${l.target}-${l.relType}` === linkKey)) {
                linkList.push({
                  source: Number(rel.subject_entity_id),
                  target: Number(rel.object_entity_id),
                  relType: rel.rel_type,
                })
              }
            }
          }
        }

        return res.status(200).json({
          nodes: [...entityMap.values()],
          links: linkList,
          meta: {
            rootEntityId: Number(entity_id),
            rootLabel: root.name,
            rootType: root.type_name,
            depth: maxDepth,
            nodeCount: entityMap.size,
            linkCount: linkList.length,
          },
        })
      } catch (error) {
        console.error('Error fetching ontology neighborhood:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Ontology: Knowledge Graph — query by criteria ───
    if (action === 'ontology-query') {
      try {
        const { certifications, technologies, markets, ownership, equipment, state: queryState } = req.query

        // Parse comma-separated criteria
        const criteria = {}
        if (certifications) criteria.Certification = certifications.split(',').map(s => s.trim())
        if (technologies) criteria['Technology / Software'] = technologies.split(',').map(s => s.trim())
        if (markets) criteria['Market Vertical'] = markets.split(',').map(s => s.trim())
        if (ownership) criteria['Ownership Structure'] = ownership.split(',').map(s => s.trim())
        if (equipment) criteria['Equipment Brand'] = equipment.split(',').map(s => s.trim())

        const categoryCount = Object.keys(criteria).length
        if (categoryCount === 0) {
          return res.status(400).json({ error: 'At least one filter criterion is required (certifications, technologies, markets, ownership, equipment)' })
        }

        // Flatten all requested entity names
        const allEntityNames = Object.values(criteria).flat()
        const totalCriteria = allEntityNames.length

        // Find companies matching criteria using ontology relationships
        // AND across categories, OR within categories
        const matchQuery = `
          WITH company_edges AS (
            SELECT
              ce.prospect_company_id,
              et.name AS entity_type,
              oe.name AS entity_name
            FROM ontology_relationships r
            JOIN ontology_entities ce ON ce.id = r.subject_entity_id
            JOIN ontology_entity_types cet ON cet.id = ce.type_id AND cet.name = 'Company'
            JOIN ontology_entities oe ON oe.id = r.object_entity_id
            JOIN ontology_entity_types et ON et.id = oe.type_id
            WHERE ce.prospect_company_id IS NOT NULL
              AND oe.name = ANY($1)
          ),
          company_matches AS (
            SELECT
              prospect_company_id,
              COUNT(DISTINCT entity_name) AS match_count,
              COUNT(DISTINCT entity_type) AS categories_matched,
              ARRAY_AGG(DISTINCT entity_name) AS matched_edges
            FROM company_edges
            GROUP BY prospect_company_id
            HAVING COUNT(DISTINCT entity_type) >= $2
          )
          SELECT
            cm.prospect_company_id,
            cm.match_count,
            cm.categories_matched,
            cm.matched_edges,
            pc.company,
            pc.state,
            pc.city,
            pc.signal_count,
            pc.category,
            pc.key_certifications,
            pc.rjg_cavity_pressure,
            pc.ownership_type,
            pc.medical_device_mfg
          FROM company_matches cm
          JOIN prospect_companies pc ON pc.id = cm.prospect_company_id
          ${queryState ? `WHERE pc.state = $3` : ''}
          ORDER BY cm.match_count DESC, pc.signal_count DESC NULLS LAST
        `
        const matchParams = [allEntityNames, categoryCount]
        if (queryState) matchParams.push(queryState.toUpperCase())

        const matches = await sql.query(matchQuery, matchParams)

        const results = matches.map(m => {
          const matchScore = m.match_count / totalCriteria
          return {
            id: m.prospect_company_id,
            company: m.company,
            state: m.state,
            city: m.city,
            matchScore: Math.round(matchScore * 100) / 100,
            matchCount: Number(m.match_count),
            totalCriteria,
            matchedEdges: m.matched_edges,
            hookLine: m.matched_edges.join(', '),
          }
        })

        return res.status(200).json({
          results,
          meta: {
            totalMatches: results.length,
            criteria,
          },
        })
      } catch (error) {
        console.error('Error in ontology query:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Ontology: Knowledge Graph — similar companies ───
    if (action === 'ontology-similar') {
      try {
        const { prospect_id, limit: simLimit } = req.query
        if (!prospect_id) {
          return res.status(400).json({ error: 'prospect_id is required' })
        }
        const resultLimit = Math.min(Number(simLimit) || 10, 50)

        // Get target company info
        const targetRows = await sql`
          SELECT id, company FROM prospect_companies WHERE id = ${prospect_id}
        `
        if (targetRows.length === 0) {
          return res.status(404).json({ error: 'Prospect not found' })
        }
        const target = targetRows[0]

        // Find all object entities connected to the target company's entity
        // Then find other companies sharing those same object entities
        const similarQuery = `
          WITH target_entity AS (
            SELECT id FROM ontology_entities
            WHERE prospect_company_id = $1
            LIMIT 1
          ),
          target_edges AS (
            SELECT r.object_entity_id, oe.name AS entity_name
            FROM ontology_relationships r
            JOIN target_entity te ON te.id = r.subject_entity_id
            JOIN ontology_entities oe ON oe.id = r.object_entity_id
          ),
          other_companies AS (
            SELECT
              ce.prospect_company_id,
              COUNT(DISTINCT te.object_entity_id) AS shared_count,
              ARRAY_AGG(DISTINCT te.entity_name) AS shared_entities
            FROM ontology_relationships r
            JOIN ontology_entities ce ON ce.id = r.subject_entity_id
            JOIN ontology_entity_types cet ON cet.id = ce.type_id AND cet.name = 'Company'
            JOIN target_edges te ON te.object_entity_id = r.object_entity_id
            WHERE ce.prospect_company_id IS NOT NULL
              AND ce.prospect_company_id != $1
            GROUP BY ce.prospect_company_id
          )
          SELECT
            oc.prospect_company_id AS id,
            pc.company,
            pc.state,
            pc.city,
            oc.shared_count,
            oc.shared_entities,
            (SELECT COUNT(*)::int FROM target_edges) AS total_target_edges
          FROM other_companies oc
          JOIN prospect_companies pc ON pc.id = oc.prospect_company_id
          ORDER BY oc.shared_count DESC
          LIMIT $2
        `

        const similar = await sql.query(similarQuery, [prospect_id, resultLimit])

        const totalTargetEdges = similar.length > 0 ? Number(similar[0].total_target_edges) : 0

        return res.status(200).json({
          target: { id: Number(target.id), company: target.company },
          similar: similar.map(s => ({
            id: s.id,
            company: s.company,
            state: s.state,
            city: s.city,
            sharedEdges: Number(s.shared_count),
            sharedEntities: s.shared_entities,
            totalEdgesTarget: totalTargetEdges,
            similarity: totalTargetEdges > 0
              ? Math.round((Number(s.shared_count) / totalTargetEdges) * 100) / 100
              : 0,
          })),
        })
      } catch (error) {
        console.error('Error finding similar companies:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Attachments for a prospect
    if (action === 'data-audit') {
      try {
        // Query 1 — Field completeness counts
        // Query 2 — Logical inconsistency counts
        // Query 3 — Per-state signal health
        const [completeness, consistency, stateSignal] = await Promise.all([
          sql`SELECT
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE signal_count IS NULL OR signal_count = 0)::int as null_signal,
            COUNT(*) FILTER (WHERE cwp_contacts IS NULL)::int as null_cwp,
            COUNT(*) FILTER (WHERE state IS NULL OR state = '')::int as null_state,
            COUNT(*) FILTER (WHERE category IS NULL OR category = '')::int as null_category,
            COUNT(*) FILTER (WHERE priority IS NULL OR priority = '')::int as null_priority,
            COUNT(*) FILTER (WHERE press_count IS NULL OR press_count = 0)::int as null_press,
            COUNT(*) FILTER (WHERE year_founded IS NULL)::int as null_founded,
            COUNT(*) FILTER (WHERE employees_approx IS NULL)::int as null_employees,
            COUNT(*) FILTER (WHERE key_certifications IS NULL OR key_certifications = '')::int as null_certs,
            COUNT(*) FILTER (WHERE ownership_type IS NULL OR ownership_type = '')::int as null_ownership,
            COUNT(*) FILTER (WHERE prospect_status IS NULL OR prospect_status = '')::int as null_status
          FROM prospect_companies`,
          sql`SELECT
            COUNT(*) FILTER (WHERE (rjg_cavity_pressure ILIKE '%yes%' OR rjg_cavity_pressure ILIKE '%confirmed%') AND (signal_count IS NULL OR signal_count = 0))::int as rjg_no_signal,
            COUNT(*) FILTER (WHERE medical_device_mfg = 'Yes' AND (key_certifications IS NULL OR key_certifications NOT ILIKE '%13485%'))::int as medical_no_cert,
            COUNT(*) FILTER (WHERE employees_approx > 200 AND (press_count IS NULL OR press_count = 0))::int as large_no_press,
            COUNT(*) FILTER (WHERE category ILIKE '%converter%' AND (press_count IS NULL OR press_count = 0))::int as converter_no_press,
            COUNT(*) FILTER (WHERE parent_company IS NOT NULL AND parent_company != '' AND (ownership_type IS NULL OR ownership_type = ''))::int as parent_no_ownership,
            COUNT(*) FILTER (WHERE years_in_business IS NOT NULL AND year_founded IS NOT NULL AND ABS(years_in_business - (EXTRACT(YEAR FROM NOW()) - year_founded)) > 2)::int as age_mismatch
          FROM prospect_companies`,
          sql`SELECT state,
            COUNT(*)::int as count,
            ROUND(AVG(COALESCE(signal_count, 0))::numeric, 1)::float as avg_signal,
            COUNT(*) FILTER (WHERE signal_count IS NULL OR signal_count = 0)::int as zero_signal_count
          FROM prospect_companies
          WHERE state IS NOT NULL AND state != ''
          GROUP BY state
          ORDER BY avg_signal ASC`
        ])

        const c = completeness[0]
        const i = consistency[0]

        // Build rules catalog
        const rules = [
          { id: 'null_state', name: 'Missing state', severity: 'critical', category: 'completeness', description: 'Prospects with no state assigned. Cannot appear on National Map or in corridor analytics.', count: c.null_state, suggestion: 'Add state for these companies from their website or source report.' },
          { id: 'rjg_no_signal', name: 'RJG confirmed but signal = 0', severity: 'critical', category: 'consistency', description: 'Companies with confirmed RJG cavity pressure monitoring but signal_count = 0. RJG alone should count as at least 1 signal.', count: i.rjg_no_signal, suggestion: 'Review source reports and set signal_count to at least 1 for confirmed RJG users.' },
          { id: 'null_signal', name: 'Missing signal count', severity: 'high', category: 'completeness', description: 'Prospects with signal_count = 0 or NULL. May have signals that weren\'t captured during import.', count: c.null_signal, suggestion: 'Review source reports for these states and update signal counts, or re-import from corrected data.' },
          { id: 'null_cwp', name: 'Missing CWP contacts', severity: 'high', category: 'completeness', description: 'Prospects with NULL cwp_contacts. CWP warmth indicators won\'t show for these companies.', count: c.null_cwp, suggestion: 'Cross-reference CWP database to populate contact counts.' },
          { id: 'null_category', name: 'Missing category', severity: 'warning', category: 'completeness', description: 'Prospects with no category. Won\'t appear in category breakdown charts.', count: c.null_category, suggestion: 'Classify these companies based on their primary business.' },
          { id: 'null_priority', name: 'Missing priority', severity: 'warning', category: 'completeness', description: 'Prospects with no priority level assigned.', count: c.null_priority, suggestion: 'Review and assign priority based on fit criteria.' },
          { id: 'null_ownership', name: 'Missing ownership type', severity: 'warning', category: 'completeness', description: 'Prospects with no ownership type. Ownership urgency indicators won\'t display.', count: c.null_ownership, suggestion: 'Research ownership structure (PE, family, ESOP, public) for these companies.' },
          { id: 'medical_no_cert', name: 'Medical mfg but no ISO 13485', severity: 'warning', category: 'consistency', description: 'Companies flagged as medical device manufacturers but missing ISO 13485 certification. May be a data gap or genuinely uncertified.', count: i.medical_no_cert, suggestion: 'Verify if these companies hold ISO 13485 and update certifications field.' },
          { id: 'converter_no_press', name: 'Converter with no press count', severity: 'warning', category: 'consistency', description: 'Companies categorized as converters but with no press count recorded. Press count is a key sizing metric for molders.', count: i.converter_no_press, suggestion: 'Research press counts from company websites or industry databases.' },
          { id: 'null_press', name: 'Missing press count', severity: 'info', category: 'completeness', description: 'Prospects with no press count. Minor gap — press count helps size converter operations.', count: c.null_press, suggestion: 'Add press counts when available from research.' },
          { id: 'null_founded', name: 'Missing year founded', severity: 'info', category: 'completeness', description: 'Prospects with no year founded. Affects legacy business calculations.', count: c.null_founded, suggestion: 'Add founding year from company websites.' },
          { id: 'null_employees', name: 'Missing employee count', severity: 'info', category: 'completeness', description: 'Prospects with no employee count. Affects company sizing.', count: c.null_employees, suggestion: 'Add approximate employee counts from LinkedIn or company websites.' },
          { id: 'null_certs', name: 'Missing certifications', severity: 'info', category: 'completeness', description: 'Prospects with no certifications listed. May have certs not yet captured.', count: c.null_certs, suggestion: 'Research certifications from company quality pages.' },
          { id: 'parent_no_ownership', name: 'Has parent but no ownership type', severity: 'info', category: 'consistency', description: 'Companies with a parent company listed but no ownership type. Parent company implies subsidiary structure.', count: i.parent_no_ownership, suggestion: 'Set ownership type based on parent company structure.' },
          { id: 'age_mismatch', name: 'Age calculation mismatch', severity: 'info', category: 'consistency', description: 'Companies where years_in_business doesn\'t match calculation from year_founded (off by >2 years).', count: i.age_mismatch, suggestion: 'Verify year_founded and years_in_business for consistency.' },
        ]

        // Add state signal gap rule from state data
        const problemStates = stateSignal.filter(s => s.avg_signal < 0.5 && s.count >= 5)
        rules.push({
          id: 'state_signal_gap',
          name: 'States with near-zero avg signal',
          severity: 'critical',
          category: 'coverage',
          description: `${problemStates.length} state(s) with 5+ prospects but avg signal < 0.5: ${problemStates.map(s => s.state).join(', ') || 'none'}. Likely a bulk import issue where signal counts defaulted to 0.`,
          count: problemStates.length,
          suggestion: 'Review the source reports for these states and update signal counts from narrative data.',
          examples: problemStates.slice(0, 5).map(s => ({ id: null, company: s.state, detail: `${s.count} prospects, avg_signal=${s.avg_signal}, ${s.zero_signal_count} with zero` }))
        })

        // Query 4 — Fetch examples for rules with count > 0 (batch into one query per category)
        const needExamples = rules.filter(r => r.count > 0 && !r.examples)
        const exampleQueries = []

        // Build example queries for top issues
        const exampleRuleIds = needExamples.slice(0, 8).map(r => r.id)
        if (exampleRuleIds.length > 0) {
          const exampleResults = await sql`
            SELECT * FROM (
              SELECT 'null_signal' as rule_id, id, company, state, COALESCE(signal_count::text, 'NULL') as detail
              FROM prospect_companies
              WHERE (signal_count IS NULL OR signal_count = 0)
              ORDER BY company LIMIT 5
            ) a
            UNION ALL SELECT * FROM (
              SELECT 'null_cwp' as rule_id, id, company, state, 'cwp_contacts=NULL' as detail
              FROM prospect_companies
              WHERE cwp_contacts IS NULL
              ORDER BY company LIMIT 5
            ) b
            UNION ALL SELECT * FROM (
              SELECT 'null_state' as rule_id, id, company, COALESCE(state, '') as state, 'no state' as detail
              FROM prospect_companies
              WHERE state IS NULL OR state = ''
              ORDER BY company LIMIT 5
            ) c
            UNION ALL SELECT * FROM (
              SELECT 'null_category' as rule_id, id, company, COALESCE(state, '') as state, 'no category' as detail
              FROM prospect_companies
              WHERE category IS NULL OR category = ''
              ORDER BY company LIMIT 5
            ) d
            UNION ALL SELECT * FROM (
              SELECT 'rjg_no_signal' as rule_id, id, company, COALESCE(state, '') as state,
                'rjg=' || COALESCE(rjg_cavity_pressure, '') || ', signal=' || COALESCE(signal_count::text, 'NULL') as detail
              FROM prospect_companies
              WHERE (rjg_cavity_pressure ILIKE '%yes%' OR rjg_cavity_pressure ILIKE '%confirmed%')
                AND (signal_count IS NULL OR signal_count = 0)
              ORDER BY company LIMIT 5
            ) e
            UNION ALL SELECT * FROM (
              SELECT 'medical_no_cert' as rule_id, id, company, COALESCE(state, '') as state,
                'medical=Yes, certs=' || COALESCE(key_certifications, 'NULL') as detail
              FROM prospect_companies
              WHERE medical_device_mfg = 'Yes' AND (key_certifications IS NULL OR key_certifications NOT ILIKE '%13485%')
              ORDER BY company LIMIT 5
            ) f
            UNION ALL SELECT * FROM (
              SELECT 'converter_no_press' as rule_id, id, company, COALESCE(state, '') as state,
                'category=' || COALESCE(category, '') || ', press=0' as detail
              FROM prospect_companies
              WHERE category ILIKE '%converter%' AND (press_count IS NULL OR press_count = 0)
              ORDER BY company LIMIT 5
            ) g
            UNION ALL SELECT * FROM (
              SELECT 'age_mismatch' as rule_id, id, company, COALESCE(state, '') as state,
                'founded=' || COALESCE(year_founded::text, 'NULL') || ', years_in_biz=' || COALESCE(years_in_business::text, 'NULL') as detail
              FROM prospect_companies
              WHERE years_in_business IS NOT NULL AND year_founded IS NOT NULL
                AND ABS(years_in_business - (EXTRACT(YEAR FROM NOW()) - year_founded)) > 2
              ORDER BY company LIMIT 5
            ) h
          `

          // Attach examples to rules
          const examplesByRule = {}
          for (const row of exampleResults) {
            if (!examplesByRule[row.rule_id]) examplesByRule[row.rule_id] = []
            if (examplesByRule[row.rule_id].length < 5) {
              examplesByRule[row.rule_id].push({ id: row.id, company: row.company, detail: row.state ? `${row.state} — ${row.detail}` : row.detail })
            }
          }
          for (const rule of rules) {
            if (examplesByRule[rule.id] && !rule.examples) {
              rule.examples = examplesByRule[rule.id]
            }
          }
        }

        // Ensure all rules have examples array
        for (const rule of rules) {
          if (!rule.examples) rule.examples = []
        }

        // Query 5 — Ontology health (try/catch for missing tables)
        let ontologyHealth = null
        try {
          const ontResult = await sql`
            SELECT
              (SELECT COUNT(*)::int FROM ontology_entities WHERE layer = 1) as layer1_entities,
              (SELECT COUNT(*)::int FROM ontology_entities WHERE layer = 2) as layer2_entities,
              (SELECT COUNT(*)::int FROM ontology_relationships WHERE layer = 1) as layer1_relationships,
              (SELECT COUNT(*)::int FROM ontology_relationships WHERE layer = 2) as layer2_relationships,
              (SELECT COUNT(DISTINCT oe.prospect_company_id) FROM ontology_entities oe WHERE oe.prospect_company_id IS NOT NULL) as companies_in_ontology
          `
          const o = ontResult[0]
          ontologyHealth = {
            layer1_entities: o.layer1_entities,
            layer2_entities: o.layer2_entities,
            layer1_relationships: o.layer1_relationships,
            layer2_relationships: o.layer2_relationships,
            companies_in_ontology: o.companies_in_ontology,
            total_prospects: c.total,
            coverage_pct: c.total > 0 ? Math.round((o.companies_in_ontology / c.total) * 100) : 0
          }
        } catch (e) {
          ontologyHealth = { skipped: true, reason: 'Ontology tables not yet created' }
        }

        // Summary counts
        const severityCounts = { critical: 0, high: 0, warning: 0, info: 0, clean: 0 }
        for (const rule of rules) {
          if (rule.count === 0) severityCounts.clean++
          else if (severityCounts[rule.severity] !== undefined) severityCounts[rule.severity]++
        }

        return res.status(200).json({
          timestamp: new Date().toISOString(),
          total_prospects: c.total,
          rules,
          state_signal_health: stateSignal,
          ontology_health: ontologyHealth,
          summary: severityCounts
        })
      } catch (error) {
        console.error('Error running data audit:', error)
        return res.status(500).json({ error: error.message })
      }
    }

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
        const { category, priority, geography_tier, corridor, outreach_group, medical_device_mfg } = req.query

        // Corridor-to-states mapping for filtering
        const CORRIDOR_TO_STATES = {
          'Great Lakes Auto': ['MI','OH','IN','IL','WI'],
          'Northeast Tool': ['PA','NY','CT','NJ','MA','NH','VT','ME','RI','DC'],
          'Southeast Growth': ['NC','GA','FL','TN','SC','VA','AL','MS','KY'],
          'Gulf / Resin Belt': ['TX','LA','OK','AR'],
          'Upper Midwest Medical': ['MN'],
          'West Coast': ['CA','OR','WA'],
          'Mountain / Central': ['CO','AZ','UT','NV','NM','ID','MT','WY','ND','SD','NE','KS','IA','MO'],
          'Non-Contiguous': ['AK','HI'],
        }

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
        if (corridor) {
          const states = CORRIDOR_TO_STATES[corridor]
          if (states) {
            const placeholders = states.map((s, i) => `$${params.length + i + 1}`).join(',')
            params.push(...states)
            conditions.push(`state IN (${placeholders})`)
          } else if (corridor === 'Unknown') {
            conditions.push(`(state IS NULL OR state = '')`)
          }
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
          // Manufacturing corridors (derived from state)
          sql.query(
            `SELECT
               CASE
                 WHEN state IN ('MI','OH','IN','IL','WI') THEN 'Great Lakes Auto'
                 WHEN state IN ('PA','NY','CT','NJ','MA','NH','VT','ME','RI','DC') THEN 'Northeast Tool'
                 WHEN state IN ('NC','GA','FL','TN','SC','VA','AL','MS','KY') THEN 'Southeast Growth'
                 WHEN state IN ('TX','LA','OK','AR') THEN 'Gulf / Resin Belt'
                 WHEN state = 'MN' THEN 'Upper Midwest Medical'
                 WHEN state IN ('CA','OR','WA') THEN 'West Coast'
                 WHEN state IN ('AK','HI') THEN 'Non-Contiguous'
                 WHEN state IS NOT NULL AND state != '' THEN 'Mountain / Central'
                 ELSE 'Unknown'
               END as corridor,
               COUNT(*)::int AS count
             FROM prospect_companies ${whereClause}
             GROUP BY corridor ORDER BY count DESC`,
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
          corridors: geoCounts,
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
      const { category, priority, geography_tier, corridor: listCorridor, outreach_group, medical_device_mfg, prospect_status } = req.query

      // Corridor-to-states mapping for list filtering
      const CORRIDOR_TO_STATES_LIST = {
        'Great Lakes Auto': ['MI','OH','IN','IL','WI'],
        'Northeast Tool': ['PA','NY','CT','NJ','MA','NH','VT','ME','RI','DC'],
        'Southeast Growth': ['NC','GA','FL','TN','SC','VA','AL','MS','KY'],
        'Gulf / Resin Belt': ['TX','LA','OK','AR'],
        'Upper Midwest Medical': ['MN'],
        'West Coast': ['CA','OR','WA'],
        'Mountain / Central': ['CO','AZ','UT','NV','NM','ID','MT','WY','ND','SD','NE','KS','IA','MO'],
        'Non-Contiguous': ['AK','HI'],
      }

      let prospects

      if (category || priority || geography_tier || listCorridor || outreach_group || medical_device_mfg || prospect_status) {
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
        if (listCorridor) {
          const states = CORRIDOR_TO_STATES_LIST[listCorridor]
          if (states) {
            const placeholders = states.map((s, i) => `$${params.length + i + 1}`).join(',')
            params.push(...states)
            conditions.push(`state IN (${placeholders})`)
          } else if (listCorridor === 'Unknown') {
            conditions.push(`(state IS NULL OR state = '')`)
          }
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
        const result = await rebuildOntologyLayer1(sql)
        return res.status(200).json(result)
      } catch (error) {
        console.error('Error rebuilding ontology Layer 1:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Ontology: Layer 2 import from extraction ───
    if (action === 'import-ontology-extraction') {
      try {
        const { prospect_id, entities, relationships } = req.body

        // Validate required fields
        if (!prospect_id) {
          return res.status(400).json({ error: 'prospect_id is required' })
        }
        if (!Array.isArray(entities) || entities.length === 0) {
          return res.status(400).json({ error: 'entities must be a non-empty array' })
        }
        if (!Array.isArray(relationships)) {
          return res.status(400).json({ error: 'relationships must be an array' })
        }

        // Look up prospect
        const prospectRows = await sql`SELECT id, company, source_report FROM prospect_companies WHERE id = ${prospect_id}`
        if (prospectRows.length === 0) {
          return res.status(404).json({ error: 'Prospect not found' })
        }
        const prospect = prospectRows[0]

        // Load entity type and relationship type lookups
        const [entityTypes, relTypes] = await Promise.all([
          sql`SELECT id, name FROM ontology_entity_types`,
          sql`SELECT id, name FROM ontology_relationship_types`,
        ])
        const typeMap = {}
        for (const t of entityTypes) typeMap[t.name] = t.id
        const relMap = {}
        for (const r of relTypes) relMap[r.name] = r.id

        // Find or create the Company entity for this prospect
        let companyEntityRows = await sql`
          SELECT id FROM ontology_entities
          WHERE prospect_company_id = ${prospect_id} AND type_id = ${typeMap['Company']}
          LIMIT 1
        `
        let companyEntityId
        if (companyEntityRows.length > 0) {
          companyEntityId = companyEntityRows[0].id
        } else {
          // Create Company entity if it doesn't exist (Layer 1 not yet run)
          const created = await sql`
            INSERT INTO ontology_entities (type_id, name, prospect_company_id, source, confidence, layer)
            VALUES (${typeMap['Company']}, ${prospect.company}, ${prospect_id}, ${prospect.source_report}, 'Confirmed', 2)
            ON CONFLICT (type_id, name) DO UPDATE SET
              prospect_company_id = COALESCE(ontology_entities.prospect_company_id, EXCLUDED.prospect_company_id),
              updated_at = NOW()
            RETURNING id
          `
          companyEntityId = created[0].id
        }

        let entitiesCreated = 0
        let entitiesUpdated = 0
        let relationshipsCreated = 0
        let relationshipsSkipped = 0

        // Map to track entity name → id for relationship resolution
        const entityIdMap = {}
        entityIdMap[prospect.company] = companyEntityId

        // Process entities
        for (const e of entities) {
          const entityTypeId = typeMap[e.type]
          if (!entityTypeId) continue // skip unknown types

          const name = (e.name || '').trim().replace(/\s+/g, ' ')
          if (!name) continue

          const result = await sql`
            INSERT INTO ontology_entities (type_id, name, source, confidence, layer)
            VALUES (${entityTypeId}, ${name}, ${prospect.source_report}, ${e.confidence || 'Confirmed'}, 2)
            ON CONFLICT (type_id, name) DO UPDATE SET
              updated_at = NOW(),
              layer = GREATEST(ontology_entities.layer, 2)
            RETURNING id, (xmax = 0) AS inserted
          `
          const entityId = result[0]?.id
          if (entityId) {
            entityIdMap[name] = entityId
            if (result[0].inserted) {
              entitiesCreated++
            } else {
              entitiesUpdated++
            }
          }
        }

        // Process relationships
        for (const r of relationships) {
          const relTypeId = relMap[r.relationship_type]
          if (!relTypeId) { relationshipsSkipped++; continue }

          // Resolve subject: use company entity for company name, otherwise look up
          const subjectId = entityIdMap[r.subject] || companyEntityId
          const objectId = entityIdMap[r.object]
          if (!objectId) { relationshipsSkipped++; continue }

          const result = await sql`
            INSERT INTO ontology_relationships (type_id, subject_entity_id, object_entity_id, source, confidence, layer)
            VALUES (${relTypeId}, ${subjectId}, ${objectId}, ${prospect.source_report}, ${r.confidence || 'Confirmed'}, 2)
            ON CONFLICT (type_id, subject_entity_id, object_entity_id) DO NOTHING
          `
          // neon returns affected rows info via result
          if (result.count > 0) {
            relationshipsCreated++
          } else {
            relationshipsSkipped++
          }
        }

        return res.status(200).json({
          entities_created: entitiesCreated,
          entities_updated: entitiesUpdated,
          relationships_created: relationshipsCreated,
          relationships_skipped: relationshipsSkipped,
        })
      } catch (error) {
        console.error('Error importing ontology extraction:', error)
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

        // Rebuild ontology to reflect imported data
        let ontologyResult = null
        try {
          ontologyResult = await rebuildOntologyLayer1(sql)
        } catch (err) {
          console.error('Post-import ontology rebuild failed:', err)
          // Non-fatal — import succeeded, ontology just needs manual rebuild
        }

        return res.status(200).json({
          message: `Import complete: ${upserted} upserted, ${skipped} skipped`,
          upserted,
          skipped,
          ontology: ontologyResult || { error: 'Rebuild failed — run manual rebuild' },
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

      // Derive ontology for new prospect
      let ontologyResult = null
      try {
        ontologyResult = await rebuildOntologyForProspect(sql, result[0].id)
      } catch (err) {
        console.error('Post-create ontology derivation failed:', err)
      }

      return res.status(201).json({ ...result[0], ontology: ontologyResult })
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

      // Conditional ontology rebuild — only when ontology-relevant fields changed
      const touchesOntology = ONTOLOGY_FIELDS.some(field => field in body)
      if (touchesOntology) {
        try {
          await rebuildOntologyForProspect(sql, id)
        } catch (err) {
          console.error('Post-edit ontology rebuild failed:', err)
        }
      }

      return res.status(200).json(result[0])
    } catch (error) {
      console.error('Error updating prospect:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
