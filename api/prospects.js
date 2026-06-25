import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/requireAuth.js'

// Certification normalization: map variant names to canonical form
const CERT_NORMALIZATION = {
  'iso 9001:2015': 'ISO 9001',
  'iso 9001:2008': 'ISO 9001',
  'iso 9001 (since 1998)': 'ISO 9001',
  'iso 9001:2008 (outdated)': 'ISO 9001',
  'iso 9000': 'ISO 9001',
  'iso 9001 pending': 'ISO 9001',
  'iso 13485:2016': 'ISO 13485',
  'iso 13485 (pursuing)': 'ISO 13485',
  'iso 13485 compliance': 'ISO 13485',
  'iso 13485 (all 5 sites)': 'ISO 13485',
  'iso 13485:2016; iatf/iso 9001 pending': 'ISO 13485',
  'iso 13485 (reported)': 'ISO 13485',
  'iatf 16949:2016': 'IATF 16949',
  'iso/ts 16949': 'IATF 16949',
  'ts16949': 'IATF 16949',
  'iatf-compliant': 'IATF 16949',
  'as9100:2016': 'AS9100',
  'as9100c': 'AS9100',
  'as9100d': 'AS9100D',
  'iso 14001:2015': 'ISO 14001',
  'iso 14001': 'ISO 14001',
  'itar registered': 'ITAR',
  'cgmp': 'cGMP',
  'gmp': 'cGMP',
  'iso 14644 class 7': 'ISO Class 7 Cleanroom',
  'iso class 8 cleanroom': 'ISO Class 8 Cleanroom',
}

function normalizeCertName(raw) {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()
  return CERT_NORMALIZATION[lower] || trimmed
}

// Multi-vendor cavity-pressure attribution. RJG, Kistler, and Priamus are
// functionally equivalent for AI readiness scoring; only the ontology entity
// name differs so the Knowledge Graph can show vendor-specific clusters.
// Returns null for values that don't map to a cavity-pressure entity.
function getCavityPressureEntityName(rjgVal) {
  if (!rjgVal) return null
  const lower = rjgVal.toLowerCase()
  if (lower.includes('kistler')) return 'Kistler Cavity Pressure Monitoring'
  if (lower.includes('priamus')) return 'Priamus Cavity Pressure Monitoring'
  if (lower.includes('yes') || lower.includes('confirmed') || lower === 'likely') {
    return 'RJG Cavity Pressure Monitoring'
  }
  return null
}

// Private-equity ownership matcher.
// SYNC: identical copy in src/utils/priorityScore.js (isPEOwnership) — keep aligned.
// Matches the dropdown value ('PE-Backed'), bare 'PE', and legacy free-text
// values ('Private Equity', 'Acquired by PE firm ...'). Word-boundary regex so
// 'Cooperative' / 'ESOP' / 'Public' don't false-positive.
function isPEOwnership(value) {
  if (!value) return false
  return /\bpe\b|private equity/i.test(value)
}

// ─── Category parent-group rules for filter matching ─────────────────
// SYNC: Keep in sync with src/utils/categoryGroups.js
// ORDER MATTERS: More specific prefixes MUST come before generic ones.
const CATEGORY_PARENT_RULES = [
  { prefix: 'Mold Maker + Converter', parent: 'Mold Maker + Converter' },
  { prefix: 'Mold Maker', parent: 'Mold Maker' },
  { prefix: 'Mold/Tool Maker', parent: 'Mold Maker' },
  { prefix: 'Mold/Tool', parent: 'Mold Maker' },
  { prefix: 'Toolmaker + Converter', parent: 'Mold Maker + Converter' },
  { prefix: 'Toolmaker', parent: 'Mold Maker' },
  { prefix: 'Tool & Die', parent: 'Mold Maker' },
  { prefix: 'Converter + In-House Tooling', parent: 'Converter + In-House Tooling' },
  { prefix: 'Converter + Mold Maker', parent: 'Mold Maker + Converter' },
  { prefix: 'Converter + Mold Design', parent: 'Mold Maker + Converter' },
  { prefix: 'Captive Converter', parent: 'Captive/OEM' },
  { prefix: 'Captive OEM', parent: 'Captive/OEM' },
  { prefix: 'Captive Molder', parent: 'Captive/OEM' },
  { prefix: 'OEM + Converter', parent: 'Captive/OEM' },
  { prefix: 'OEM + Captive', parent: 'Captive/OEM' },
  { prefix: 'OEM Converter', parent: 'Captive/OEM' },
  { prefix: 'Automotive Tier 1', parent: 'Captive/OEM' },
  { prefix: 'Contract Manufacturer', parent: 'Converter' },
  { prefix: 'Converter', parent: 'Converter' },
  { prefix: 'Micro Injection', parent: 'Converter' },
  { prefix: 'Medical OEM', parent: 'Converter' },
  { prefix: 'Hot Runner', parent: 'Hot Runner Systems' },
  { prefix: 'Knowledge Sector', parent: 'Knowledge Sector' },
  { prefix: 'Catalog/Standards', parent: 'Catalog/Standards' },
  { prefix: 'Strategic', parent: 'Strategic Partner' },
  { prefix: 'Ecosystem', parent: 'Ecosystem/Channel' },
  { prefix: 'Thermoformer', parent: 'Thermoformer' },
  { prefix: 'Does Not Fit', parent: 'Does Not Fit' },
  { prefix: 'Enterprise', parent: 'Does Not Fit' },
]

function buildCategoryCondition(parentGroupName, params) {
  if (!parentGroupName || parentGroupName === 'All') return null
  if (parentGroupName === 'Other') {
    // "Other" = anything not matching any known parent rule
    const excludeClauses = CATEGORY_PARENT_RULES.map(r => {
      params.push(r.prefix + '%')
      return `category NOT LIKE $${params.length}`
    })
    return `(category IS NULL OR (${excludeClauses.join(' AND ')}))`
  }
  const myPrefixes = CATEGORY_PARENT_RULES.filter(r => r.parent === parentGroupName).map(r => r.prefix)
  if (myPrefixes.length === 0) {
    // Unknown parent — exact match fallback
    params.push(parentGroupName)
    return `category = $${params.length}`
  }
  // For each of our prefixes, build a LIKE clause and exclude any more-specific
  // prefixes from OTHER parent groups that share the same start.
  // e.g., "Converter%" must exclude "Converter + In-House Tooling%" and "Converter + Mold Maker%"
  const otherPrefixes = CATEGORY_PARENT_RULES.filter(r => r.parent !== parentGroupName).map(r => r.prefix)
  const likeClauses = myPrefixes.map(p => {
    params.push(p + '%')
    const likeParam = `category LIKE $${params.length}`
    // Find other-group prefixes that would be caught by this LIKE
    const conflicts = otherPrefixes.filter(op => op.startsWith(p) && op !== p)
    if (conflicts.length === 0) return likeParam
    const excludes = conflicts.map(c => {
      params.push(c + '%')
      return `category NOT LIKE $${params.length}`
    })
    return `(${likeParam} AND ${excludes.join(' AND ')})`
  })
  return `(${likeClauses.join(' OR ')})`
}

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

  // 2. Clear Layer 1 data. Relationships first, then only entities that are no
  //    longer referenced by ANY remaining relationship. Company entities are
  //    layer 1 but Layer 2 relationships hang off them with ON DELETE CASCADE —
  //    a blanket `DELETE ... WHERE layer = 1` would cascade away all manually
  //    extracted Layer 2 edges. The NOT EXISTS guard keeps those entities (the
  //    upsert below reuses them via ON CONFLICT), so Layer 2 data survives.
  await sql`DELETE FROM ontology_relationships WHERE layer = 1`
  await sql`
    DELETE FROM ontology_entities e
    WHERE e.layer = 1
      AND NOT EXISTS (
        SELECT 1 FROM ontology_relationships r
        WHERE r.subject_entity_id = e.id OR r.object_entity_id = e.id
      )
  `

  // 3. Read all prospects
  const prospects = await sql`SELECT * FROM prospect_companies`

  // 4. Derive the full entity + relationship sets IN MEMORY, then write them in
  //    a handful of chunked bulk statements. The previous implementation issued
  //    1,000+ sequential awaited round-trips (one upsert/insert per entity and
  //    edge), which pushed the auto-rebuild after every bulk import toward
  //    Vercel's 10s function timeout as the prospect database grows — and a
  //    mid-rebuild timeout leaves the Layer 1 graph wiped/half-built.
  //    Derivation rules below are unchanged (SYNC with rebuildOntologyForProspect).

  function normalizeName(raw) {
    return raw.trim().replace(/\s+/g, ' ')
  }

  // JSON keys: structurally unambiguous even though names contain arbitrary
  // characters. RETURNING type_id comes back as a number, matching typeMap ids.
  const entityKey = (typeId, name) => JSON.stringify([typeId, name])

  // key → { typeId, name, attrs, prospectCompanyId, source, confidence }
  const entityTuples = new Map()
  function collectEntity(typeId, name, attrs = {}, prospectCompanyId = null, source = null, confidence = 'Confirmed') {
    if (!typeId || !name) return null
    const normalized = normalizeName(String(name))
    if (!normalized) return null
    const key = entityKey(typeId, normalized)
    const existing = entityTuples.get(key)
    if (existing) {
      // Merge duplicates: row-linked Company beats reference-only; Confirmed beats Likely
      if (existing.prospectCompanyId == null && prospectCompanyId != null) existing.prospectCompanyId = prospectCompanyId
      if (existing.confidence !== 'Confirmed' && confidence === 'Confirmed') existing.confidence = 'Confirmed'
      if (Object.keys(existing.attrs).length === 0 && Object.keys(attrs).length > 0) existing.attrs = attrs
    } else {
      entityTuples.set(key, { typeId, name: normalized, attrs, prospectCompanyId, source, confidence })
    }
    return key
  }

  // key → { relTypeId, subjectKey, objectKey, source, confidence }
  const relTuples = new Map()
  function collectRelationship(relTypeId, subjectKey, objectKey, source = null, confidence = 'Confirmed') {
    if (!relTypeId || !subjectKey || !objectKey) return
    const key = JSON.stringify([relTypeId, subjectKey, objectKey])
    const existing = relTuples.get(key)
    if (existing) {
      if (existing.confidence !== 'Confirmed' && confidence === 'Confirmed') existing.confidence = 'Confirmed'
      return
    }
    relTuples.set(key, { relTypeId, subjectKey, objectKey, source, confidence })
  }

  for (const p of prospects) {
    const source = p.source_report || null

    // Company entity
    const companyAttrs = {}
    if (p.category) companyAttrs.category = p.category
    if (p.in_house_tooling) companyAttrs.in_house_tooling = p.in_house_tooling
    const companyKey = collectEntity(typeMap['Company'], p.company, companyAttrs, p.id, source)
    if (!companyKey) continue

    // Parse certifications (comma-separated, normalized + deduplicated)
    if (p.key_certifications && p.key_certifications.trim()) {
      const rawCerts = p.key_certifications.split(',').map(c => c.trim()).filter(Boolean)
      const certs = [...new Set(rawCerts.map(normalizeCertName))]
      for (const cert of certs) {
        const certKey = collectEntity(typeMap['Certification'], cert, {}, null, source)
        collectRelationship(relMap['holds_certification'], companyKey, certKey, source)
      }
    }

    // Cavity pressure monitoring → vendor-specific Technology entity
    if (p.rjg_cavity_pressure) {
      const rjgVal = p.rjg_cavity_pressure.toLowerCase()
      const entityName = getCavityPressureEntityName(p.rjg_cavity_pressure)
      if (entityName && (rjgVal.includes('yes') || rjgVal.includes('confirmed'))) {
        const techKey = collectEntity(typeMap['Technology / Software'], entityName, {}, null, source)
        collectRelationship(relMap['uses_technology'], companyKey, techKey, source, 'Confirmed')
      } else if (rjgVal === 'likely') {
        const techKey = collectEntity(typeMap['Technology / Software'], 'RJG Cavity Pressure Monitoring', {}, null, source, 'Likely')
        collectRelationship(relMap['uses_technology'], companyKey, techKey, source, 'Likely')
      }
    }

    // Medical device manufacturing → Market Vertical
    if (p.medical_device_mfg?.startsWith('Yes')) {
      const marketKey = collectEntity(typeMap['Market Vertical'], 'Medical Devices', {}, null, source)
      collectRelationship(relMap['serves_market'], companyKey, marketKey, source)
    }

    // Ownership type → Ownership Structure entity
    if (p.ownership_type && p.ownership_type.trim()) {
      const ownerKey = collectEntity(typeMap['Ownership Structure'], p.ownership_type.trim(), {}, null, source)
      collectRelationship(relMap['has_ownership_structure'], companyKey, ownerKey, source)
    }

    // Parent company + parent_relationship_kind → typed relationship.
    // Phase 3 (Thread 1): rows with parent_relationship_kind = 'absorbed_into' emit
    // absorbed_into; 'subsidiary' or NULL (legacy/unclassified) emit subsidiary_of.
    if (p.parent_company && p.parent_company.trim()) {
      const parentKey = collectEntity(typeMap['Company'], p.parent_company.trim(), {}, null, source)
      const relName = p.parent_relationship_kind === 'absorbed_into' ? 'absorbed_into' : 'subsidiary_of'
      collectRelationship(relMap[relName], companyKey, parentKey, source)
    }

    // Former names → legacy_name_of edges (each former name is a Company entity
    // linked TO the current row's entity; "former_name is a former name for this row").
    if (Array.isArray(p.former_names)) {
      for (const formerName of p.former_names) {
        if (!formerName || !String(formerName).trim()) continue
        const formerKey = collectEntity(typeMap['Company'], String(formerName).trim(), {}, null, source)
        collectRelationship(relMap['legacy_name_of'], formerKey, companyKey, source)
      }
    }

    // Financial sponsor → acquired_by edge (company → sponsor).
    if (p.financial_sponsor && p.financial_sponsor.trim()) {
      const sponsorKey = collectEntity(typeMap['Company'], p.financial_sponsor.trim(), {}, null, source)
      collectRelationship(relMap['acquired_by'], companyKey, sponsorKey, source)
    }
  }

  // 5. Bulk-upsert entities (chunked multi-row VALUES) and resolve ids.
  //    Tuples are pre-deduped by (type_id, name), so a single statement never
  //    hits "ON CONFLICT cannot affect row a second time".
  const entityList = [...entityTuples.values()]
  const keyToId = new Map()
  const ENTITY_CHUNK = 400
  for (let i = 0; i < entityList.length; i += ENTITY_CHUNK) {
    const chunk = entityList.slice(i, i + ENTITY_CHUNK)
    const params = []
    const valuesSql = chunk.map(t => {
      params.push(t.typeId, t.name, JSON.stringify(t.attrs), t.prospectCompanyId, t.source, t.confidence)
      const b = params.length
      return `($${b - 5}::int, $${b - 4}::text, $${b - 3}::jsonb, $${b - 2}::int, $${b - 1}::text, $${b}::text, 1)`
    }).join(', ')
    const rows = await sql.query(
      `INSERT INTO ontology_entities (type_id, name, attributes, prospect_company_id, source, confidence, layer)
       VALUES ${valuesSql}
       ON CONFLICT (type_id, name) DO UPDATE SET
         updated_at = NOW(),
         prospect_company_id = COALESCE(ontology_entities.prospect_company_id, EXCLUDED.prospect_company_id)
       RETURNING id, type_id, name`,
      params
    )
    for (const r of rows) keyToId.set(entityKey(r.type_id, r.name), r.id)
  }

  // 6. Bulk-insert relationships, resolved through the returned entity ids
  const relList = [...relTuples.values()]
  let relationshipsCreated = 0
  const REL_CHUNK = 600
  for (let i = 0; i < relList.length; i += REL_CHUNK) {
    const chunk = relList.slice(i, i + REL_CHUNK)
    const params = []
    const rowsSql = []
    for (const t of chunk) {
      const subjectId = keyToId.get(t.subjectKey)
      const objectId = keyToId.get(t.objectKey)
      if (!subjectId || !objectId) continue
      params.push(t.relTypeId, subjectId, objectId, t.source, t.confidence)
      const b = params.length
      rowsSql.push(`($${b - 4}::int, $${b - 3}::int, $${b - 2}::int, $${b - 1}::text, $${b}::text, 1)`)
    }
    if (rowsSql.length === 0) continue
    await sql.query(
      `INSERT INTO ontology_relationships (type_id, subject_entity_id, object_entity_id, source, confidence, layer)
       VALUES ${rowsSql.join(', ')}
       ON CONFLICT (type_id, subject_entity_id, object_entity_id) DO NOTHING`,
      params
    )
    relationshipsCreated += rowsSql.length
  }

  const duration = Date.now() - startTime
  return {
    entities_created: entityList.length,
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

  // Certifications (normalized + deduplicated)
  if (p.key_certifications && p.key_certifications.trim()) {
    const rawCerts = p.key_certifications.split(',').map(c => c.trim()).filter(Boolean)
    const certs = [...new Set(rawCerts.map(normalizeCertName))]
    for (const cert of certs) {
      const certId = await upsertEntity(typeMap['Certification'], cert, {}, null, source)
      if (certId) {
        await insertRelationship(relMap['holds_certification'], companyId, certId, source)
      }
    }
  }

  // Cavity pressure monitoring → vendor-specific Technology entity
  if (p.rjg_cavity_pressure) {
    const rjgVal = p.rjg_cavity_pressure.toLowerCase()
    const entityName = getCavityPressureEntityName(p.rjg_cavity_pressure)
    if (entityName && (rjgVal.includes('yes') || rjgVal.includes('confirmed'))) {
      const techId = await upsertEntity(typeMap['Technology / Software'], entityName, {}, null, source)
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
  if (p.medical_device_mfg?.startsWith('Yes')) {
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

  // Parent company + parent_relationship_kind → typed relationship (SYNC with bulk rebuild).
  if (p.parent_company && p.parent_company.trim()) {
    const parentId = await upsertEntity(typeMap['Company'], p.parent_company.trim(), {}, null, source)
    if (parentId) {
      const relName = p.parent_relationship_kind === 'absorbed_into' ? 'absorbed_into' : 'subsidiary_of'
      await insertRelationship(relMap[relName], companyId, parentId, source)
    }
  }

  // Former names → legacy_name_of edges.
  if (Array.isArray(p.former_names)) {
    for (const formerName of p.former_names) {
      if (!formerName || !String(formerName).trim()) continue
      const formerId = await upsertEntity(typeMap['Company'], String(formerName).trim(), {}, null, source)
      if (formerId) {
        await insertRelationship(relMap['legacy_name_of'], formerId, companyId, source)
      }
    }
  }

  // Financial sponsor → acquired_by edge.
  if (p.financial_sponsor && p.financial_sponsor.trim()) {
    const sponsorId = await upsertEntity(typeMap['Company'], p.financial_sponsor.trim(), {}, null, source)
    if (sponsorId) {
      await insertRelationship(relMap['acquired_by'], companyId, sponsorId, source)
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
  // Thread 1 (typed parent/FKA model). Phase 1 only triggers the rebuild;
  // Phase 3 will expand rebuildOntologyForProspect to emit absorbed_into +
  // legacy_name_of + acquired_by edges from these fields.
  'parent_relationship_kind', 'financial_sponsor', 'former_names',
]

// ─── Priority Score Calculation ─────────────────────────────────────
// SYNC: This logic is duplicated in src/utils/priorityScore.js — keep both in sync
// When modifying scoring logic, update BOTH files and search for SYNC markers

const EXEMPT_CATEGORIES = ['Knowledge Sector', 'Hot Runner Systems', 'Catalog/Standards', 'Strategic Partner']

const SCORE_INPUT_FIELDS = [
  'press_count', 'employees_approx', 'signal_count', 'cwp_contacts',
  'psb_connection_notes', 'rjg_cavity_pressure', 'in_house_tooling',
  'medical_device_mfg', 'key_certifications', 'ownership_type',
  'recent_ma', 'years_in_business', 'category', 'outreach_group'
]

function isPriorityExempt(prospect) {
  if (prospect.outreach_group === 'Infrastructure') return true
  if (EXEMPT_CATEGORIES.includes(prospect.category)) return true
  return false
}

function calculatePriorityScore(p) {
  if (isPriorityExempt(p)) return null

  const breakdown = {}

  // Scale (0-25): press_count primary, employees fallback
  const presses = p.press_count ?? 0
  const employees = p.employees_approx ?? 0
  if (presses >= 100) breakdown.scale = 25
  else if (presses >= 50) breakdown.scale = 20
  else if (presses >= 20) breakdown.scale = 15
  else if (presses >= 5) breakdown.scale = 10
  else if (presses >= 1) breakdown.scale = 5
  else {
    if (employees >= 500) breakdown.scale = 17
    else if (employees >= 200) breakdown.scale = 12
    else if (employees >= 50) breakdown.scale = 7
    else breakdown.scale = 0
  }

  // Relationship Warmth (0-25): cwp_contacts + psb bonus
  const cwp = p.cwp_contacts ?? 0
  let warmth = 0
  if (cwp >= 20) warmth = 22
  else if (cwp >= 10) warmth = 17
  else if (cwp >= 5) warmth = 12
  else if (cwp >= 1) warmth = 7
  if (p.psb_connection_notes && p.psb_connection_notes.trim()) warmth = Math.min(25, warmth + 4)
  breakdown.warmth = warmth

  // Ownership Urgency (0-15)
  const ownership = (p.ownership_type || '').toLowerCase()
  const recentMa = (p.recent_ma || '').toLowerCase()
  const yearsInBiz = p.years_in_business ?? 0
  const isPE = isPEOwnership(ownership)
  if (isPE && (recentMa.includes('acqui') || recentMa.includes('merge'))) {
    breakdown.urgency = 15
  } else if (isPE) {
    breakdown.urgency = 10
  } else if (ownership.includes('family') && yearsInBiz >= 30) {
    breakdown.urgency = 8
  } else if (ownership.includes('esop')) {
    breakdown.urgency = 4
  } else if (ownership.includes('corporate') || ownership.includes('strategic')) {
    breakdown.urgency = 2
  } else {
    breakdown.urgency = 0
  }

  // Strategic Vertical (0-15)
  const isMedical = (p.medical_device_mfg || '').startsWith('Yes')
  const certs = (p.key_certifications || '').toLowerCase()
  if (isMedical && certs.includes('13485')) {
    breakdown.vertical = 15
  } else if (isMedical) {
    breakdown.vertical = 10
  } else if (certs.includes('iatf') || certs.includes('16949')) {
    breakdown.vertical = 8
  } else if (certs.includes('as9100')) {
    breakdown.vertical = 6
  } else {
    breakdown.vertical = 0
  }

  // Signal Density (0-10)
  const signals = p.signal_count ?? 0
  if (signals >= 10) breakdown.signals = 10
  else if (signals >= 7) breakdown.signals = 8
  else if (signals >= 4) breakdown.signals = 6
  else if (signals >= 2) breakdown.signals = 4
  else if (signals >= 1) breakdown.signals = 2
  else breakdown.signals = 0

  // Technology Signals (0-10)
  const rjg = (p.rjg_cavity_pressure || '').toLowerCase()
  let tech = 0
  if (rjg.includes('yes') || rjg.includes('confirmed')) tech = 10
  else if (rjg.includes('likely')) tech = 6
  if (p.in_house_tooling === 'Yes') tech = Math.min(10, tech + 3)
  breakdown.technology = tech

  const total = breakdown.scale + breakdown.warmth + breakdown.urgency +
                breakdown.vertical + breakdown.signals + breakdown.technology

  return { score: total, breakdown }
}

function getTierFromScore(score) {
  if (score === null || score === undefined) return null
  if (score >= 75) return 'HIGH PRIORITY'
  if (score >= 50) return 'QUALIFIED'
  if (score >= 25) return 'WATCH'
  return 'LOW'
}

function calculateAiReadiness(p) {
  if (isPriorityExempt(p)) return { readiness: 'exempt', criteria: 0, met: [] }

  let criteria = 0
  const met = []
  const rjg = (p.rjg_cavity_pressure || '').toLowerCase()
  if (rjg.includes('yes') || rjg.includes('confirmed') || rjg.includes('likely')) { criteria++; met.push('RJG') }
  if (p.in_house_tooling === 'Yes') { criteria++; met.push('Tooling') }
  const certStr = (p.key_certifications || '').toLowerCase()
  if (certStr.includes('iso') || certStr.includes('iatf') || certStr.includes('as9100')) { criteria++; met.push('ISO') }
  if ((p.press_count ?? 0) >= 20) { criteria++; met.push(`${p.press_count}+ presses`) }
  const isMedical = (p.medical_device_mfg || '').startsWith('Yes')
  const isAutomotive = certStr.includes('iatf') || certStr.includes('16949')
  if (isMedical || isAutomotive) { criteria++; met.push(isMedical ? 'Medical' : 'Automotive') }

  const readiness = criteria >= 3 ? 'green' : criteria >= 1 ? 'yellow' : 'red'
  return { readiness, criteria, met }
}

// Recalculate priority_score / ai_readiness for EVERY prospect in a few
// chunked bulk UPDATEs. The old per-row loop issued ~180 sequential
// round-trips — the same Vercel 10s-timeout exposure as the import loop it
// usually follows. Manual-override semantics preserved: `priority` text only
// changes when priority_manual IS NULL; exempt rows get score NULL +
// readiness 'exempt' and keep their priority text. updated_at is deliberately
// NOT touched (recalc must not reset staleness detection).
async function recalculateAllPriorities(sql) {
  const all = await sql`SELECT * FROM prospect_companies`
  let updated = 0
  let exempt = 0
  const rows = all.map(p => {
    if (isPriorityExempt(p)) {
      exempt++
      return { id: p.id, score: null, readiness: 'exempt', tier: null, isExempt: true }
    }
    updated++
    const scoreResult = calculatePriorityScore(p)
    const readinessResult = calculateAiReadiness(p)
    const score = scoreResult?.score ?? null
    const readiness = readinessResult?.readiness ?? null
    return { id: p.id, score, readiness, tier: getTierFromScore(score), isExempt: false }
  })

  const CHUNK = 300
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const params = []
    const valuesSql = chunk.map(r => {
      params.push(r.id, r.score, r.readiness, r.tier, r.isExempt)
      const b = params.length
      return `($${b - 4}::int, $${b - 3}::int, $${b - 2}::text, $${b - 1}::text, $${b}::boolean)`
    }).join(', ')
    await sql.query(
      `UPDATE prospect_companies pc SET
         priority_score = v.score,
         ai_readiness = v.readiness,
         priority = CASE
           WHEN v.is_exempt OR pc.priority_manual IS NOT NULL OR v.tier IS NULL THEN pc.priority
           ELSE v.tier
         END
       FROM (VALUES ${valuesSql}) AS v(id, score, readiness, tier, is_exempt)
       WHERE pc.id = v.id`,
      params
    )
  }

  return { updated, exempt, total: all.length }
}

// ─── Section E schema additions (self-ensuring) ───────────────────────
// prospect_status_transitions (QA audit E7), prospect_companies.ma_date (E4),
// prospect_contacts (E5). Applied lazily, once per warm instance, from the
// endpoints that touch them — there is no local-dev/migration workflow, so
// endpoints self-ensure instead of erroring until SQL is run by hand.
// Mirrored in scripts/create-status-transitions.sql and
// scripts/create-prospect-contacts.sql for schema reproducibility.
// (Unlike the unguarded ALTER in api/opportunities.js, this runs once per
// cold start, not on every request.)
let schemaAdditionsEnsured = false
async function ensureProspectSchemaAdditions(sql) {
  if (schemaAdditionsEnsured) return
  await sql`
    CREATE TABLE IF NOT EXISTS prospect_status_transitions (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER NOT NULL REFERENCES prospect_companies(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      transitioned_by TEXT
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_status_transitions_prospect ON prospect_status_transitions(prospect_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_status_transitions_at ON prospect_status_transitions(transitioned_at)`
  await sql`ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS ma_date DATE`
  await sql`
    CREATE TABLE IF NOT EXISTS prospect_contacts (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER NOT NULL REFERENCES prospect_companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT,
      email TEXT,
      phone TEXT,
      notes TEXT,
      source TEXT,
      last_contacted DATE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_prospect_contacts_prospect ON prospect_contacts(prospect_id)`
  schemaAdditionsEnsured = true
}

// Append-only prospect status history (QA audit E7) — mirrors the pipeline's
// stage_transitions so "outreach-ready inventory over time" becomes
// reconstructable. History accrues from deploy; earlier changes were never
// recorded (only updated_at moved). Call sites wrap this in try/catch —
// logging must never fail the write it accompanies.
async function logStatusChange(sql, prospectId, fromStatus, toStatus, transitionedBy) {
  if (!toStatus || fromStatus === toStatus) return
  await ensureProspectSchemaAdditions(sql)
  await sql`
    INSERT INTO prospect_status_transitions (prospect_id, from_status, to_status, transitioned_by)
    VALUES (${prospectId}, ${fromStatus || null}, ${toStatus}, ${transitionedBy || null})
  `
}

// PE acquisition window from ma_date (QA audit E4). The 6-18 months
// post-acquisition stretch is the alliance's core PE thesis.
// SYNC: identical copy in src/utils/peWindow.js — keep both aligned.
function getPEWindowInfo(maDate) {
  const d = parseLocalDate(maDate)
  if (!d || isNaN(d)) return null
  const now = new Date()
  const monthsSince = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  if (monthsSince < 0) {
    return { phase: 'upcoming', monthsSince, label: 'M&A date is in the future', shortLabel: 'PE deal pending' }
  }
  if (monthsSince < 6) {
    const opens = 6 - monthsSince
    return { phase: 'early', monthsSince, label: `optimal window opens in ${opens}mo (${monthsSince}mo since acquisition)`, shortLabel: `PE window opens in ${opens}mo` }
  }
  if (monthsSince <= 18) {
    const closes = 18 - monthsSince
    const closesText = closes === 0 ? 'closing this month' : `closes in ${closes}mo`
    return { phase: 'optimal', monthsSince, label: `INSIDE optimal window — ${closesText} (${monthsSince}mo since acquisition)`, shortLabel: `PE window ${closesText}` }
  }
  if (monthsSince <= 24) {
    return { phase: 'closing', monthsSince, label: `past optimal window by ${monthsSince - 18}mo — engage soon`, shortLabel: 'PE window closing' }
  }
  return { phase: 'closed', monthsSince, label: `window closed (${monthsSince}mo since acquisition)`, shortLabel: 'PE window closed' }
}

// Parse a DATE-only string (YYYY-MM-DD or ISO timestamp) safely in local timezone.
// SYNC: Also exists in ProspectTable.jsx — keep both copies identical.
function parseLocalDate(val) {
  if (!val) return null
  const str = typeof val === 'string' ? val : val instanceof Date ? val.toISOString() : String(val)
  const [y, m, d] = str.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// SYNC: Keep in sync with getProspectUrgency() in ProspectTable.jsx
//
// `follow_up_date` no longer drives urgency (its UI editor was removed when tasks
// superseded it; remaining values are pre-task fossils that pinned promoted/parked
// companies into phantom "Nd overdue" with no way to clear them). Date-based urgency
// now lives on tasks; this function reports status-staleness only.
function getProspectUrgency(prospect) {
  // Parked statuses are off the radar: Converted (promoted to the pipeline), Nurture,
  // and Identified (not yet worked).
  const parkedStatuses = ['Converted', 'Nurture', 'Identified']
  if (parkedStatuses.includes(prospect.prospect_status)) return null

  const now = new Date()
  const updatedAt = prospect.updated_at ? new Date(prospect.updated_at) : null
  const daysSinceUpdate = updatedAt ? Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24)) : null

  if (prospect.prospect_status === 'Outreach Ready' && daysSinceUpdate >= 14) {
    return { level: 'stale', label: `${daysSinceUpdate}d idle`, color: 'orange', priority: 5 }
  }
  if (prospect.prospect_status === 'Prioritized' && daysSinceUpdate >= 14) {
    return { level: 'stalled', label: 'Research stalled', color: 'orange', priority: 6 }
  }
  if (prospect.prospect_status === 'Research Complete' && daysSinceUpdate >= 7) {
    return { level: 'stalled', label: 'Needs outreach', color: 'orange', priority: 7 }
  }

  return null
}

/**
 * Consolidated prospect API — single serverless function.
 *
 * GET  /api/prospects           — list all (with optional filter query params)
 * GET  /api/prospects?id=123    — get single prospect
 * GET  /api/prospects?action=daily-digest — cron-secured daily digest email sender
 * POST /api/prospects           — create single prospect
 * POST /api/prospects?action=import — bulk import/upsert (preserves user-edited fields)
 * PATCH /api/prospects?id=123   — update single prospect
 */
// ─────────────────────────────────────────────────────────────────────────
// Read-only reasoning assistant (POST ?action=assistant)
//
// Server-side tool-use loop against Together.ai's OpenAI-compatible chat
// completions API. Plain fetch (house style, like the Resend call above) with
// an Authorization: Bearer ${TOGETHER_AI_API} header. STRICTLY READ-ONLY:
// every tool executor issues SELECT only; there is no INSERT/UPDATE/DELETE
// anywhere in this code path. All work is awaited before the response is sent
// (Vercel freezes after res.end()).
// ─────────────────────────────────────────────────────────────────────────
const ASSISTANT_ENDPOINT = 'https://api.together.xyz/v1/chat/completions'
// Must be a current Together model that supports OpenAI-style function calling.
// Llama-3.3-70B-Instruct-Turbo has a STABLE id (not a date-stamped snapshot) and
// solid tool-calling — preferred over DeepSeek snapshots (`DeepSeek-V3-0324`,
// `-V3.1`, …) whose ids rotate and silently 4xx when retired. The bare
// `deepseek-ai/DeepSeek-V3` id we shipped first was already stale → every call
// 4xx'd → "assistant temporarily unavailable".
const ASSISTANT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
const ASSISTANT_MAX_TURNS = 8
const ASSISTANT_MAX_TOKENS = 2048
const ASSISTANT_TOOL_RESULT_CAP = 12000 // hard backstop on each stringified tool_result

const ASSISTANT_SYSTEM = `You are the research assistant inside the PSB-Aquila prospect dashboard, a tool the Penn State Behrend - Aquila Industrial AI Alliance uses to track injection-molding and plastics manufacturers as partnership prospects. Your users are the alliance team, including Brett Hyder, a 40-year plastics-industry expert.

Answer questions about prospects using only data you retrieve through your tools. Ground every factual claim in tool results. If a tool returns nothing, or a brief is missing, say so plainly instead of guessing. You are read-only: you cannot change records, create tasks, or send anything, and you never imply that you have.

You can read two distinct things, and you must keep them straight:
- **Prospects** (the Prospects tab) — the ~179 companies the alliance is researching and qualifying. Tools: search_prospects, get_prospect, find_similar_prospects, query_ontology, get_research_brief, list_companies_by_category.
- **The Pipeline** (the opportunities tab) — the smaller set of active *deals* that have been promoted from prospects, each with a stage, owner, value, and a "who has the ball" (waiting_on) field. Tools: search_pipeline, get_opportunity. A deal's source_prospect_id links it back to its prospect.
You can also read state-level research reports via get_state_report. When a user says "the pipeline," they mean the live opportunities/deals — use search_pipeline, and don't confuse a prospect (a research target) with an opportunity (an active deal). Be precise about which one a fact comes from.

Categories: a prospect's category is exactly the value in its category field — never infer, assign, or upgrade a category from general knowledge about a brand (a well-known catalog distributor may be categorized a Converter in our data; report what the data says). For "who are the [type] companies" or "how many [type] companies" questions, use list_companies_by_category, querying it with the bare type word ("knowledge", "catalog") rather than a full exact category name. Brett's "knowledge companies" = category Knowledge Sector; "catalog companies" = Catalog/Standards. Some companies carry a combined tag such as "Knowledge AND Catalog" — count them as EACH type named, so they appear under both knowledge and catalog; querying by the bare word includes these hybrids automatically, and you must never drop a company just because its tag combines two types. If a category search returns nothing, say nothing matched — never pad the answer with companies of other categories.

Be concise and direct, in a neutral analyst voice. When sizing up a company, weight what Brett weights: press count over raw employee count, ownership type and acquisition urgency, relevant certifications, technology signals such as RJG cavity-pressure, and relationship warmth from the PSB connection notes. To compare a prospect against others, first call find_similar_prospects, then call get_prospect on the ones worth detailing, and write the comparison only once you actually have that detail.

Your reply is shown to the user as the finished answer. Never end a reply by saying you "will" retrieve, look up, or pull records next — if you need more data, call the tool now (it runs automatically and hands you the result so you can keep going). Only write a text reply once your answer is complete and self-contained; the user cannot see your tool calls or trigger them, so don't ask them to wait or promise a follow-up.

Keep answers to a few short paragraphs. Use a compact list only when comparing multiple companies.`

// Appended to the system prompt only when the request is mode:'draft' (Phase 2,
// L1). The assistant writes a message for the user to review/edit/send — it still
// sends nothing and writes nothing. Grounding + no-fabrication rules still apply.
const ASSISTANT_DRAFT_GUIDANCE = `DRAFTING MODE. The user wants you to draft a message they will review, edit, and send themselves. You are NOT sending anything and you cannot send — produce text only. First gather context with your tools (get_prospect / get_research_brief for a prospect; search_pipeline / get_opportunity for a live deal), then write.

Voice & shape: write as the Penn State Behrend - Aquila Industrial AI Alliance making a warm, professional first contact. Open with a specific, genuine reason we're reaching out to THIS company — a real hook from the data (RJG/cavity-pressure use, in-house tooling, a recent acquisition or PE window, a relevant certification, medical/automotive focus, a PSB/CWP connection). Keep it short and skimmable (~120-180 words), plain language, no buzzword soup, no hard sell. Close with a low-friction call to action (a brief intro conversation).

Stakeholder notifications (for an opportunity / deal): route by project type — Research Agreement → Alicyn Rhoades (VC Research) + Jennifer Surrena (contracts), 4-6 week processing; Senior Design → Dean Lewis (dal16@psu.edu), Aug 15 fall deadline; Strategic Membership → Amy Bridger. Reflect the right contact and any deadline.

Hard rules: ground every company-specific claim in tool data — never invent facts, names, numbers, contacts, or relationships. For anything you can't know (sender name, scheduling, signature, a recipient name not in the data), leave a clearly marked [placeholder]. If you lack enough data to personalize, say so and draft a minimal version rather than fabricating.

Output format: a "Subject:" line, then the message body. After the message, add one short italic line listing the hooks you used and any [placeholders] to fill before sending.`

// ─── Phase 4a: server-side ontology Layer-2 extraction (?action=ai-extract-ontology) ───
// Read-only: produces a {entities, relationships} proposal from a research brief.
// The WRITE still goes through the existing, tested import-ontology-extraction
// path on human confirm (ImportOntologyModal preview). These valid-type lists
// SYNC with src/components/prospects/ImportOntologyModal.jsx — keep identical.
const AI_EXTRACT_ENTITY_TYPES = [
  'Technology / Software', 'Equipment Brand', 'Quality Method', 'Material',
  'Market Vertical', 'Manufacturing Process', 'Workforce Capability',
  'Company', 'Certification', 'Ownership Structure',
]
const AI_EXTRACT_REL_TYPES = [
  'uses_technology', 'uses_equipment_brand', 'holds_certification', 'serves_market',
  'operates_process', 'employs_method', 'processes_material', 'has_workforce_capability',
  'acquired_by', 'subsidiary_of', 'partners_with', 'competes_with', 'supplies_to',
  'has_ownership_structure',
]
const AI_EXTRACT_CONFIDENCES = ['Confirmed', 'Likely', 'Inferred']

const ASSISTANT_EXTRACT_SYSTEM = `You are an information-extraction engine for a plastics-manufacturing knowledge graph. From a company's research brief, extract structured entities and the relationships connecting them to the company. Respond with ONLY a single JSON object — no markdown fences, no commentary.`

// Robustly pull a JSON object out of a model reply (strips ``` fences / stray prose).
function parseExtractionJson(text) {
  if (!text || typeof text !== 'string') return null
  let s = text.trim()
  const fence = s.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last === -1 || last < first) return null
  try { return JSON.parse(s.slice(first, last + 1)) } catch { return null }
}

const ASSISTANT_TOOLS = [
  {
    name: 'search_prospects',
    description: 'Search the prospect database by structured filters and/or a free-text term. Returns a trimmed list (id, company, city, state, category, priority, top_signal, key_certifications). Use this to find prospects matching criteria, then call get_prospect for detail. Results are capped; narrow with filters.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Free text matched (ILIKE) against company name, also-known-as, category, and notes.' },
        category: { type: 'string', description: "Category filter (case-insensitive substring). Known values include: Converter, Converter + In-House Tooling, Mold Maker, Mold Maker + Converter, Hot Runner Systems, Catalog/Standards, Knowledge Sector, Strategic Partner, Ecosystem/Channel, Captive OEM, Thermoformer. 'knowledge companies' = Knowledge Sector; 'catalog companies' = Catalog/Standards (substring matching also catches combined tags like 'Knowledge AND Catalog', so hybrids surface under each type). For an exhaustive category roster prefer list_companies_by_category." },
        priority: { type: 'string' },
        corridor: { type: 'string' },
        outreach_group: { type: 'string' },
        medical_device_mfg: { type: 'string' },
        prospect_status: { type: 'string' },
        geography_tier: { type: 'string' },
        limit: { type: 'integer', description: 'Default 25, max 50.' },
      },
      required: [],
    },
  },
  {
    name: 'get_prospect',
    description: 'Get full context for one prospect by its prospect_id: company profile, metrics, signals, ownership and relationship notes (including PSB connection notes), contacts, corporate links (parent/subsidiaries), and whether a research brief exists (with a short excerpt). For the full brief text, call get_research_brief.',
    input_schema: { type: 'object', properties: { prospect_id: { type: 'integer' } }, required: ['prospect_id'] },
  },
  {
    name: 'find_similar_prospects',
    description: "Given a prospect id, return the most similar prospects by shared ontology entities (certifications, technologies, markets, equipment), with a similarity score and the shared entities. Use this to answer 'how does this prospect compare to similar companies in our prospect database'. (This is the prospect list, not the live opportunities Pipeline tab — the assistant has no access to that.)",
    input_schema: {
      type: 'object',
      properties: {
        prospect_id: { type: 'integer' },
        limit: { type: 'integer', description: 'Default 5, max 15.' },
      },
      required: ['prospect_id'],
    },
  },
  {
    name: 'query_ontology',
    description: "Find prospects matching capability criteria across the ontology. Provide any of: certifications, technologies, markets, ownership, equipment, quality_methods (each a list of strings), optionally scoped to a state. Returns matching companies with a match score, the matched criteria, and a one-line hook. Use for 'which prospects have X cert / serve Y vertical / run Z equipment'.",
    input_schema: {
      type: 'object',
      properties: {
        certifications: { type: 'array', items: { type: 'string' } },
        technologies: { type: 'array', items: { type: 'string' } },
        markets: { type: 'array', items: { type: 'string' } },
        ownership: { type: 'array', items: { type: 'string' } },
        equipment: { type: 'array', items: { type: 'string' } },
        quality_methods: { type: 'array', items: { type: 'string' } },
        state: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'get_research_brief',
    description: 'Return the full research-brief text for a prospect by its prospect_id, if one exists. Call this only when the excerpt from get_prospect is not enough. Returns the brief content or a note that none exists.',
    input_schema: { type: 'object', properties: { prospect_id: { type: 'integer' } }, required: ['prospect_id'] },
  },
  {
    name: 'search_pipeline',
    description: "Search the live Pipeline — the opportunities (active deals) the team is working, NOT the prospect list. Returns deals with stage, owner, estimated value, lead_type, waiting_on (who has the ball), next_action, outcome, the source prospect, and when each was last touched. Optional filters: search (company name), stage (on_deck/outreach/channel_routing/client_readiness/project_setup/active/complete), owner, lead_type (client/partner), outcome (won/lost/abandoned). Use for 'what's in the pipeline', 'what's stalled', 'what deals does X own'.",
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        stage: { type: 'string' },
        owner: { type: 'string' },
        lead_type: { type: 'string' },
        outcome: { type: 'string' },
        limit: { type: 'integer', description: 'Default 25, max 50.' },
      },
      required: [],
    },
  },
  {
    name: 'get_opportunity',
    description: 'Get full detail for one live Pipeline opportunity (active deal) by its opportunity_id, including its recent activity log (the bidirectional comms history). Use to summarize a deal or answer "what is the next step / who has the ball / what happened so far".',
    input_schema: { type: 'object', properties: { opportunity_id: { type: 'integer' } }, required: ['opportunity_id'] },
  },
  {
    name: 'get_state_report',
    description: 'Return the current state research report (markdown) for a 2-letter US state code (e.g. PA, OH, TX), if one exists. These are the deep state-level prospecting reports from the National Map. Returns the report content or a note that none exists.',
    input_schema: { type: 'object', properties: { state: { type: 'string', description: '2-letter state code, e.g. "PA".' } }, required: ['state'] },
  },
  {
    name: 'list_companies_by_category',
    description: "Authoritative, exact roster of prospects by category — use this for 'who are the X companies' / 'how many X companies' questions instead of guessing or padding. Pass category as the BARE type word (case-insensitive substring): 'catalog', 'knowledge', 'converter', 'mold maker', etc. — NOT a full exact category name. Because it is a substring match, combined/hybrid tags are included: 'catalog' returns Catalog/Standards AND anything tagged 'Knowledge AND Catalog', and 'knowledge' returns Knowledge Sector AND 'Knowledge AND Catalog' — so a company that is both surfaces under both. Omit category to get the full category distribution (every distinct category and its count). Deterministic: returns exactly what is in the data.",
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Case-insensitive substring of the category to list. Omit to get the category distribution (all categories + counts).' },
      },
      required: [],
    },
  },
]

// search_prospects — mirrors the GET list arm's filter-building, with a trimmed
// SELECT and an added free-text ILIKE. Uses sql.query(text, params) with $N
// placeholders (the file's dynamic-WHERE convention).
async function assistantSearchProspects(sql, input = {}) {
  const conditions = []
  const params = []
  const add = (val) => { params.push(val); return `$${params.length}` }

  if (input.search && String(input.search).trim()) {
    const p = add(`%${String(input.search).trim()}%`)
    conditions.push(`(company ILIKE ${p} OR also_known_as ILIKE ${p} OR category ILIKE ${p} OR notes ILIKE ${p})`)
  }
  if (input.outreach_group) conditions.push(`outreach_group = ${add(input.outreach_group)}`)
  if (input.category) {
    // Forgiving, case-insensitive substring match — assistant-only, deliberately
    // NOT buildCategoryCondition (whose exact parent-group logic the Prospects-tab
    // filter depends on). That function turned any non-canonical value into
    // `category = '<verbatim>'`, so "catalog"/"knowledge"/"Catalog" matched zero
    // rows. ILIKE '%catalog%' -> Catalog/Standards, '%knowledge%' -> Knowledge Sector.
    conditions.push(`category ILIKE ${add(`%${String(input.category).trim()}%`)}`)
  }
  if (input.priority) conditions.push(`priority = ${add(input.priority)}`)
  if (input.prospect_status) conditions.push(`prospect_status = ${add(input.prospect_status)}`)
  if (input.geography_tier) conditions.push(`geography_tier = ${add(input.geography_tier)}`)
  if (input.medical_device_mfg) conditions.push(`medical_device_mfg LIKE 'Yes%'`)
  if (input.corridor) {
    // SYNC: corridor→states — mirrors the GET list arm, ProspectTable.jsx, corridors.js
    const CORRIDOR_TO_STATES = {
      'Great Lakes Auto': ['MI', 'OH', 'IN', 'IL', 'WI'],
      'Northeast Tool': ['PA', 'NY', 'CT', 'NJ', 'MA', 'NH', 'VT', 'ME', 'RI', 'DC', 'DE', 'MD', 'WV'],
      'Southeast Growth': ['NC', 'GA', 'FL', 'TN', 'SC', 'VA', 'AL', 'MS', 'KY'],
      'Gulf / Resin Belt': ['TX', 'LA', 'OK', 'AR'],
      'Upper Midwest Medical': ['MN'],
      'West Coast': ['CA', 'OR', 'WA'],
      'Mountain / Central': ['CO', 'AZ', 'UT', 'NV', 'NM', 'ID', 'MT', 'WY', 'ND', 'SD', 'NE', 'KS', 'IA', 'MO'],
      'Non-Contiguous': ['AK', 'HI'],
    }
    const c = String(input.corridor).trim()
    if (c === 'International') conditions.push(`(country IS NOT NULL AND country != 'US')`)
    else if (c === 'Unknown') conditions.push(`((country IS NULL OR country = 'US') AND (state IS NULL OR state = ''))`)
    else if (CORRIDOR_TO_STATES[c]) {
      const ph = CORRIDOR_TO_STATES[c].map((s) => add(s)).join(',')
      conditions.push(`((country IS NULL OR country = 'US') AND state IN (${ph}))`)
    }
  }

  let limit = parseInt(input.limit, 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = 25
  if (limit > 50) limit = 50

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limitPh = add(limit)
  const text = `
    SELECT id, company, city, state, category, priority, top_signal, key_certifications,
           signal_count, press_count, cwp_contacts, prospect_status, outreach_group
    FROM prospect_companies
    ${where}
    ORDER BY signal_count DESC NULLS LAST, company ASC
    LIMIT ${limitPh}
  `
  const rows = await sql.query(text, params)
  return { count: rows.length, limit, results: rows }
}

// get_prospect — trimmed version of the export-json bundle: explicit columns
// (never SELECT *), 1-hop typed corporate links, contacts, and a research-brief
// flag + ~500-char excerpt.
async function assistantGetProspect(sql, input = {}) {
  // Accept either name — sibling tools use prospect_id, so the model often
  // carries that key over to this tool too.
  const id = parseInt(input.prospect_id ?? input.id, 10)
  if (!Number.isFinite(id)) return { error: 'A numeric prospect_id is required.' }

  const rows = await sql`
    SELECT id, company, also_known_as, website, category, in_house_tooling, city, state, country,
           priority, priority_score, ai_readiness, employees_approx, year_founded, years_in_business,
           revenue_known, revenue_est_m, press_count, site_count, acquisition_count, signal_count,
           top_signal, rjg_cavity_pressure, medical_device_mfg, key_certifications, ownership_type,
           recent_ma, parent_company, parent_relationship_kind, financial_sponsor, former_names,
           decision_location, cwp_contacts, psb_connection_notes, engagement_type, suggested_next_step,
           legacy_data_potential, notes, outreach_group, prospect_status, created_at, updated_at,
           (SELECT COUNT(*)::int FROM opportunities o WHERE o.source_prospect_id = prospect_companies.id) AS conversion_count
    FROM prospect_companies
    WHERE id = ${id}
  `
  if (!rows || rows.length === 0) return { error: `No prospect found with id ${id}.` }
  const p = rows[0]

  const TYPED_KINDS = ['subsidiary', 'absorbed_into']
  const linked = []
  const seen = new Set([p.id])
  const pushLink = (row, relationship) => {
    if (!row || seen.has(row.id) || linked.length >= 25) return
    seen.add(row.id)
    linked.push({ id: row.id, company: row.company, city: row.city, state: row.state, relationship })
  }

  if (p.company) {
    const children = await sql`
      SELECT id, company, city, state, parent_relationship_kind
      FROM prospect_companies
      WHERE LOWER(TRIM(parent_company)) = LOWER(TRIM(${p.company}))
        AND parent_relationship_kind = ANY(${TYPED_KINDS})
        AND id <> ${p.id}
    `
    for (const c of children) pushLink(c, c.parent_relationship_kind)
  }
  if (p.parent_company && TYPED_KINDS.includes(p.parent_relationship_kind)) {
    const parents = await sql`
      SELECT id, company, city, state
      FROM prospect_companies
      WHERE LOWER(TRIM(company)) = LOWER(TRIM(${p.parent_company})) AND id <> ${p.id}
      LIMIT 1
    `
    if (parents[0]) pushLink(parents[0], 'parent')
  }
  if (Array.isArray(p.former_names) && p.former_names.length) {
    const lowered = p.former_names.map((n) => String(n).trim().toLowerCase()).filter(Boolean)
    if (lowered.length) {
      const fnRows = await sql`
        SELECT id, company, city, state
        FROM prospect_companies
        WHERE LOWER(TRIM(company)) = ANY(${lowered}) AND id <> ${p.id}
      `
      for (const f of fnRows) pushLink(f, 'former_name')
    }
  }

  const contacts = await sql`
    SELECT name, role, email, phone, notes, source, last_contacted
    FROM prospect_contacts WHERE prospect_id = ${p.id} ORDER BY name ASC
  `
  const trimmedContacts = contacts.map((c) => ({
    ...c,
    notes: c.notes && c.notes.length > 200 ? c.notes.slice(0, 200) + '…' : c.notes,
  }))

  const briefRows = await sql`
    SELECT content FROM prospect_attachments
    WHERE prospect_id = ${p.id} AND attachment_type = 'research_brief'
    ORDER BY created_at DESC LIMIT 1
  `
  const hasBrief = briefRows.length > 0 && !!briefRows[0].content
  const briefExcerpt = hasBrief ? String(briefRows[0].content).slice(0, 500) : null

  return {
    company: p,
    contacts: trimmedContacts,
    linked_entities: linked,
    has_research_brief: hasBrief,
    brief_excerpt: briefExcerpt,
  }
}

// find_similar_prospects — mirrors the ontology-similar arm.
async function assistantFindSimilar(sql, input = {}) {
  const prospectId = parseInt(input.prospect_id ?? input.id, 10)
  if (!Number.isFinite(prospectId)) return { error: 'A numeric prospect_id is required.' }
  let limit = parseInt(input.limit, 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = 5
  if (limit > 15) limit = 15

  const targetRows = await sql`SELECT id, company FROM prospect_companies WHERE id = ${prospectId}`
  if (!targetRows.length) return { error: `No prospect found with id ${prospectId}.` }

  const rows = await sql`
    WITH target_entity AS (
      SELECT id FROM ontology_entities WHERE prospect_company_id = ${prospectId} LIMIT 1
    ),
    target_edges AS (
      SELECT r.object_entity_id, oe.name AS entity_name
      FROM ontology_relationships r
      JOIN target_entity te ON te.id = r.subject_entity_id
      JOIN ontology_entities oe ON oe.id = r.object_entity_id
    ),
    other_companies AS (
      SELECT ce.prospect_company_id,
             COUNT(DISTINCT te.object_entity_id) AS shared_count,
             ARRAY_AGG(DISTINCT te.entity_name) AS shared_entities
      FROM ontology_relationships r
      JOIN ontology_entities ce ON ce.id = r.subject_entity_id
      JOIN ontology_entity_types cet ON cet.id = ce.type_id AND cet.name = 'Company'
      JOIN target_edges te ON te.object_entity_id = r.object_entity_id
      WHERE ce.prospect_company_id IS NOT NULL AND ce.prospect_company_id != ${prospectId}
      GROUP BY ce.prospect_company_id
    )
    SELECT oc.prospect_company_id AS id, pc.company, pc.state, pc.city,
           oc.shared_count, oc.shared_entities,
           (SELECT COUNT(*)::int FROM target_edges) AS total_target_edges
    FROM other_companies oc
    JOIN prospect_companies pc ON pc.id = oc.prospect_company_id
    ORDER BY oc.shared_count DESC
    LIMIT ${limit}
  `
  const similar = rows.map((r) => ({
    id: r.id,
    company: r.company,
    city: r.city,
    state: r.state,
    sharedEdges: r.shared_count,
    sharedEntities: r.shared_entities,
    similarity: r.total_target_edges ? Math.round((r.shared_count / r.total_target_edges) * 100) / 100 : 0,
  }))
  return { target: { id: targetRows[0].id, company: targetRows[0].company }, similar }
}

// query_ontology — mirrors the ontology-query arm (AND across categories, OR within).
async function assistantQueryOntology(sql, input = {}) {
  const CRITERIA_MAP = [
    ['certifications', 'Certification'],
    ['technologies', 'Technology / Software'],
    ['markets', 'Market Vertical'],
    ['ownership', 'Ownership Structure'],
    ['equipment', 'Equipment Brand'],
    ['quality_methods', 'Quality Method'],
  ]
  const criteria = {}
  const allEntityNames = []
  for (const [key, typeName] of CRITERIA_MAP) {
    const vals = input[key]
    let cleaned = []
    if (Array.isArray(vals)) cleaned = vals.map((v) => String(v).trim()).filter(Boolean)
    else if (typeof vals === 'string' && vals.trim()) cleaned = vals.split(',').map((v) => v.trim()).filter(Boolean)
    if (cleaned.length) { criteria[typeName] = cleaned; allEntityNames.push(...cleaned) }
  }
  if (allEntityNames.length === 0) {
    return { error: 'Provide at least one criterion: certifications, technologies, markets, ownership, equipment, or quality_methods.' }
  }
  const categoryCount = Object.keys(criteria).length

  const state = input.state ? String(input.state).trim() : null
  const params = [allEntityNames, categoryCount]
  let stateClause = ''
  if (state === 'INTL') stateClause = `WHERE pc.country IS NOT NULL AND pc.country != 'US'`
  else if (state) { params.push(state); stateClause = `WHERE pc.state = $3` }

  const text = `
    WITH company_edges AS (
      SELECT ce.prospect_company_id, et.name AS entity_type, oe.name AS entity_name
      FROM ontology_relationships r
      JOIN ontology_entities ce ON ce.id = r.subject_entity_id
      JOIN ontology_entity_types cet ON cet.id = ce.type_id AND cet.name = 'Company'
      JOIN ontology_entities oe ON oe.id = r.object_entity_id
      JOIN ontology_entity_types et ON et.id = oe.type_id
      WHERE ce.prospect_company_id IS NOT NULL AND oe.name = ANY($1)
    ),
    company_matches AS (
      SELECT prospect_company_id,
             COUNT(DISTINCT entity_name) AS match_count,
             COUNT(DISTINCT entity_type) AS categories_matched,
             ARRAY_AGG(DISTINCT entity_name) AS matched_edges
      FROM company_edges
      GROUP BY prospect_company_id
      HAVING COUNT(DISTINCT entity_type) >= $2
    )
    SELECT cm.prospect_company_id, cm.match_count, cm.matched_edges,
           pc.company, pc.state, pc.city
    FROM company_matches cm
    JOIN prospect_companies pc ON pc.id = cm.prospect_company_id
    ${stateClause}
    ORDER BY cm.match_count DESC, pc.signal_count DESC NULLS LAST
    LIMIT 25
  `
  const rows = await sql.query(text, params)
  const totalCriteria = allEntityNames.length
  const results = rows.map((r) => ({
    id: r.prospect_company_id,
    company: r.company,
    state: r.state,
    city: r.city,
    matchScore: totalCriteria ? Math.round((r.match_count / totalCriteria) * 100) / 100 : 0,
    matchedEdges: r.matched_edges,
    hookLine: (r.matched_edges || []).join(', '),
  }))
  return { count: results.length, criteria, results }
}

// get_research_brief — full brief content (token-capped) or a "none" note.
async function assistantGetResearchBrief(sql, input = {}) {
  const id = parseInt(input.prospect_id ?? input.id, 10)
  if (!Number.isFinite(id)) return { error: 'A numeric prospect_id is required.' }
  const rows = await sql`
    SELECT content, created_at, created_by FROM prospect_attachments
    WHERE prospect_id = ${id} AND attachment_type = 'research_brief'
    ORDER BY created_at DESC LIMIT 1
  `
  if (!rows.length || !rows[0].content) return { note: 'No research brief on file for this prospect.' }
  const MAX = 8000
  let content = String(rows[0].content)
  let truncated = false
  if (content.length > MAX) { content = content.slice(0, MAX); truncated = true }
  return { content, truncated, created_at: rows[0].created_at, created_by: rows[0].created_by }
}

// search_pipeline — the live opportunities (Pipeline tab), SELECT-only. Mirrors
// the GET list shape in api/opportunities.js (source_prospect_name join +
// last_activity_at subquery). Optional filters; capped at 50.
async function assistantSearchPipeline(sql, input = {}) {
  const conditions = []
  const params = []
  const add = (val) => { params.push(val); return `$${params.length}` }
  if (input.search && String(input.search).trim()) {
    conditions.push(`o.company_name ILIKE ${add(`%${String(input.search).trim()}%`)}`)
  }
  if (input.stage) conditions.push(`o.stage = ${add(String(input.stage).trim())}`)
  if (input.owner) conditions.push(`o.owner = ${add(String(input.owner).trim())}`)
  if (input.lead_type) conditions.push(`o.lead_type = ${add(String(input.lead_type).trim())}`)
  if (input.outcome) conditions.push(`o.outcome = ${add(String(input.outcome).trim())}`)
  let limit = parseInt(input.limit, 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = 25
  if (limit > 50) limit = 50
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const text = `
    SELECT o.id, o.company_name, o.project_type, o.stage, o.owner, o.estimated_value,
           o.lead_type, o.waiting_on, o.next_action, o.outcome, o.source_prospect_id,
           o.created_at, o.updated_at,
           pc.company AS source_prospect_name,
           (SELECT MAX(a.activity_date) FROM activities a WHERE a.opportunity_id = o.id) AS last_activity_at
    FROM opportunities o
    LEFT JOIN prospect_companies pc ON pc.id = o.source_prospect_id
    ${where}
    ORDER BY o.updated_at DESC
    LIMIT ${add(limit)}
  `
  const rows = await sql.query(text, params)
  return { count: rows.length, limit, results: rows }
}

// get_opportunity — one opportunity (the live deal) by id + its recent activity log.
async function assistantGetOpportunity(sql, input = {}) {
  const id = input.opportunity_id ?? input.id
  if (id == null || String(id).trim() === '') return { error: 'An opportunity_id is required.' }
  const rows = await sql`
    SELECT o.id, o.company_name, o.description, o.project_type, o.stage, o.owner,
           o.estimated_value, o.source, o.psb_relationship, o.next_action, o.outcome,
           o.lead_type, o.waiting_on, o.source_prospect_id, o.closed_at, o.created_at, o.updated_at,
           pc.company AS source_prospect_name
    FROM opportunities o
    LEFT JOIN prospect_companies pc ON pc.id = o.source_prospect_id
    WHERE o.id = ${id}
  `
  if (!rows.length) return { error: `No opportunity found with id ${id}.` }
  const activities = await sql`
    SELECT activity_date, description, created_by FROM activities
    WHERE opportunity_id = ${id} ORDER BY activity_date DESC LIMIT 10
  `
  return { opportunity: rows[0], recent_activity: activities }
}

// get_state_report — the current state research report (markdown, token-capped).
async function assistantGetStateReport(sql, input = {}) {
  const state = input.state ? String(input.state).trim().toUpperCase() : ''
  if (!state) return { error: 'A 2-letter state code is required.' }
  const rows = await sql`
    SELECT state_code, state_name, title, content, researched_at, researched_by, prospect_count_at_time
    FROM state_research_reports
    WHERE state_code = ${state} AND is_current = true
    ORDER BY uploaded_at DESC LIMIT 1
  `
  if (!rows.length || !rows[0].content) return { note: `No current research report on file for ${state}.` }
  const r = rows[0]
  const MAX = 8000
  let content = String(r.content)
  let truncated = false
  if (content.length > MAX) { content = content.slice(0, MAX); truncated = true }
  return {
    state_code: r.state_code, state_name: r.state_name, title: r.title,
    researched_at: r.researched_at, researched_by: r.researched_by,
    prospect_count_at_time: r.prospect_count_at_time, content, truncated,
  }
}

// list_companies_by_category — deterministic category roster (belt-and-suspenders
// for "who are the X companies"): pure SQL on the category column so the model never
// has to guess membership or invent a classification. With no category, returns the
// full category distribution (the authoritative vocabulary + counts).
async function assistantListByCategory(sql, input = {}) {
  const cat = input.category ? String(input.category).trim() : ''
  if (!cat) {
    const dist = await sql`
      SELECT COALESCE(NULLIF(TRIM(category), ''), '(uncategorized)') AS category, COUNT(*)::int AS count
      FROM prospect_companies
      GROUP BY 1
      ORDER BY count DESC, category ASC
    `
    return { mode: 'distribution', total_categories: dist.length, categories: dist }
  }
  const CAP = 100
  const rows = await sql`
    SELECT id, company, city, state, category, priority, prospect_status
    FROM prospect_companies
    WHERE category ILIKE ${'%' + cat + '%'}
    ORDER BY category ASC, company ASC
  `
  const matched = [...new Set(rows.map(r => r.category).filter(Boolean))]
  return {
    mode: 'list',
    query: cat,
    matched_categories: matched,
    count: rows.length,
    truncated: rows.length > CAP,
    companies: rows.slice(0, CAP),
  }
}

// Dispatch a tool_use block to its read-only executor.
async function runAssistantTool(sql, name, input) {
  switch (name) {
    case 'search_prospects': return assistantSearchProspects(sql, input)
    case 'get_prospect': return assistantGetProspect(sql, input)
    case 'find_similar_prospects': return assistantFindSimilar(sql, input)
    case 'query_ontology': return assistantQueryOntology(sql, input)
    case 'get_research_brief': return assistantGetResearchBrief(sql, input)
    case 'search_pipeline': return assistantSearchPipeline(sql, input)
    case 'get_opportunity': return assistantGetOpportunity(sql, input)
    case 'get_state_report': return assistantGetStateReport(sql, input)
    case 'list_companies_by_category': return assistantListByCategory(sql, input)
    default: return { error: `Unknown tool: ${name}` }
  }
}

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)
  const { action, id } = req.query

  // Server-side session validation for every action except the daily digest,
  // which is invoked by Vercel Cron and authenticates with CRON_SECRET inside
  // its own branch below.
  if (!(req.method === 'GET' && action === 'daily-digest')) {
    const authUser = await requireAuth(req, res)
    if (!authUser) return
  }

  // ─── GET ───────────────────────────────────────────────
  if (req.method === 'GET') {

    // ── Daily Digest (cron-secured) ─────────────────────
    if (action === 'daily-digest') {
      const authHeader = req.headers.authorization
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      try {
        // ma_date / status-transitions may not exist until first ensure
        await ensureProspectSchemaAdditions(sql)

        // 1. Get all active users with digest enabled
        const users = await sql`
          SELECT id, name, email, digest_enabled, digest_preferences
          FROM users
          WHERE is_active = true AND digest_enabled = true
        `

        if (users.length === 0) {
          return res.status(200).json({ message: 'No users with digest enabled', sent: 0 })
        }

        // 2. Get prospects with fields needed for urgency computation
        const prospects = await sql`
          SELECT id, company, city, state, category, prospect_status,
                 suggested_next_step, follow_up_date, updated_at,
                 ownership_type, recent_ma, ma_date, outreach_group, signal_count,
                 parent_company
          FROM prospect_companies
        `

        // 3. Compute urgency for each prospect
        const actionItems = prospects
          .map(p => ({ ...p, urgency: getProspectUrgency(p) }))
          .filter(p => p.urgency !== null)
          .sort((a, b) => a.urgency.priority - b.urgency.priority)

        // 4. Identify PE window prospects. With a structured ma_date the list
        //    ranks by time remaining in the 6-18mo window (E4); rows with only
        //    free-text recent_ma keep the legacy behavior and sort last.
        const peWindowProspects = prospects
          .filter(p => isPEOwnership(p.ownership_type) && (p.ma_date || p.recent_ma))
          .map(p => ({ ...p, peWindow: getPEWindowInfo(p.ma_date) }))
          .filter(p => !p.peWindow || p.peWindow.phase !== 'closed')
          .sort((a, b) => {
            if (a.peWindow && b.peWindow) return b.peWindow.monthsSince - a.peWindow.monthsSince
            if (a.peWindow) return -1
            if (b.peWindow) return 1
            return 0
          })

        // 4b. Open tasks for the My Tasks digest section (Couch Mode Phase 2).
        //     One query; per-user filtering happens in the loop below using the
        //     badge rule (assignee = user OR unassigned). Defensive try/catch so
        //     a tasks-table problem can never sink the whole digest run.
        let openTasks = []
        try {
          openTasks = await sql`
            SELECT t.id, t.prospect_id, t.description, t.due_date, t.assignee, p.company
            FROM prospect_tasks t
            JOIN prospect_companies p ON p.id = t.prospect_id
            WHERE t.status = 'open'
            ORDER BY t.due_date ASC NULLS LAST, t.created_at ASC
          `
        } catch (taskErr) {
          console.error('Digest: tasks query failed (section skipped):', taskErr.message)
        }

        // Prospects that already have an open task are tracked in "My Open Tasks"
        // below — used to de-dup them out of the Stale / Stalled section so a single
        // company never appears twice in one digest (matches the TodayView
        // Needs Attention de-dup). Empty set if the tasks query failed → no de-dup.
        const openTaskProspectIds = new Set(openTasks.map(t => t.prospect_id))

        // 5. Send personalized digest to each user
        const results = []
        const dashboardUrl = 'https://psb-aquila-dashboard.vercel.app'

        for (const user of users) {
          const prefs = user.digest_preferences || { stale: true, pe_windows: true }

          // Build sections based on user preferences
          const sections = []

          // (The "Overdue Follow-Ups" and "Due This Week" sections were removed when
          //  follow_up_date urgency was retired — getProspectUrgency only emits stale/
          //  stalled now, and date-based items live on tasks → "My Open Tasks" below.)
          if (prefs.stale) {
            const items = actionItems.filter(p =>
              ['stale', 'stalled'].includes(p.urgency.level) && !openTaskProspectIds.has(p.id)
            )
            if (items.length > 0) sections.push({ title: 'Stale / Stalled', emoji: '🟠', items, color: '#F97316' })
          }

          if (prefs.pe_windows && peWindowProspects.length > 0) {
            sections.push({
              title: 'PE Window Watch',
              emoji: '⏱️',
              items: peWindowProspects.map(p => ({ ...p, urgency: { label: p.peWindow?.shortLabel || p.recent_ma?.substring(0, 60) || 'PE-backed' } })),
              color: '#7C3AED',
            })
          }

          // My Open Tasks — same rule as the dashboard badge: assigned to this
          // user or unassigned. The 'tasks' pref key is new; digest_preferences
          // rows saved before it existed lack the key, so absence = enabled.
          if (prefs.tasks !== false) {
            const mine = openTasks.filter(t => !t.assignee || t.assignee === user.name)
            if (mine.length > 0) {
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              sections.push({
                title: 'My Open Tasks',
                emoji: '✅',
                color: '#041E42',
                // Shaped for the generic 3-column row renderer: company | middle
                // (state slot carries the task text; city stays null so the
                // renderer doesn't add a comma) | due label.
                items: mine.map(t => {
                  const due = parseLocalDate(t.due_date)
                  let label = 'no due date'
                  if (due) {
                    const diff = Math.round((due - today) / 86400000)
                    label = diff < 0 ? `${Math.abs(diff)}d overdue`
                      : diff === 0 ? 'due today'
                      : diff <= 7 ? `due in ${diff}d`
                      : due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }
                  const text = (t.description || '').length > 70 ? t.description.slice(0, 67) + '…' : (t.description || '')
                  return { company: t.company, city: null, state: text, urgency: { label } }
                }),
              })
            }
          }

          // Skip if nothing to report
          if (sections.length === 0) {
            results.push({ user: user.name, status: 'skipped', reason: 'no items' })
            continue
          }

          // Build email HTML
          const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0)
          const subject = `Pipeline Digest: ${totalItems} item${totalItems !== 1 ? 's' : ''} need attention`

          const sectionHtml = sections.map(section => `
            <div style="margin-bottom: 24px;">
              <h2 style="font-size: 16px; color: ${section.color}; margin: 0 0 12px 0; border-bottom: 2px solid ${section.color}; padding-bottom: 6px;">
                ${section.emoji} ${section.title} (${section.items.length})
              </h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                ${section.items.slice(0, 15).map(item => `
                  <tr style="border-bottom: 1px solid #E5E7EB;">
                    <td style="padding: 8px 4px; font-weight: 600; color: #111827;">${item.company}</td>
                    <td style="padding: 8px 4px; color: #6B7280;">${item.city ? item.city + ', ' : ''}${item.state || ''}</td>
                    <td style="padding: 8px 4px; color: ${section.color}; font-size: 12px; font-weight: 600;">${item.urgency.label}</td>
                  </tr>
                `).join('')}
                ${section.items.length > 15 ? `
                  <tr><td colspan="3" style="padding: 8px 4px; color: #9CA3AF; font-style: italic;">
                    + ${section.items.length - 15} more...
                  </td></tr>
                ` : ''}
              </table>
            </div>
          `).join('')

          const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: #041E42; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 18px;">PSB-Aquila Pipeline Digest</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.8;">
                  ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div style="border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px; padding: 20px;">
                <p style="color: #374151; font-size: 14px; margin: 0 0 20px 0;">
                  Hi ${user.name}, here's your pipeline update:
                </p>
                ${sectionHtml}
                <div style="margin-top: 24px; text-align: center;">
                  <a href="${dashboardUrl}" style="display: inline-block; background: #041E42; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
                    Open Dashboard
                  </a>
                </div>
                <p style="margin-top: 20px; font-size: 11px; color: #9CA3AF; text-align: center;">
                  Manage your digest preferences in the dashboard header menu.
                </p>
              </div>
            </div>
          `

          // Send via Resend
          try {
            const sendRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'PSB-Aquila Dashboard <onboarding@resend.dev>',
                to: user.email,
                subject,
                html: emailHtml,
              }),
            })

            if (sendRes.ok) {
              results.push({ user: user.name, status: 'sent', items: totalItems })
            } else {
              const err = await sendRes.text()
              console.error(`Resend failed for ${user.name}:`, err)
              results.push({ user: user.name, status: 'failed', error: err })
            }
          } catch (sendErr) {
            console.error(`Resend error for ${user.name}:`, sendErr)
            results.push({ user: user.name, status: 'failed', error: sendErr.message })
          }
        }

        return res.status(200).json({
          message: 'Digest run complete',
          results,
          sent: results.filter(r => r.status === 'sent').length,
          skipped: results.filter(r => r.status === 'skipped').length,
          failed: results.filter(r => r.status === 'failed').length,
        })

      } catch (error) {
        console.error('Daily digest error:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // State-level aggregations for National Map
    if (action === 'state-stats') {
      try {
        const [stateCounts, categoryBreakdown, signalAvg, cwpTotals, priorityCounts, topCompanies, totals] = await Promise.all([
          // Prospect count per state (US only — National Map is US-scoped)
          sql`SELECT state, COUNT(*)::int AS prospect_count
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
                AND (country IS NULL OR country = 'US')
              GROUP BY state`,
          // Top 3 categories per state
          sql`SELECT state, category, COUNT(*)::int AS count
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != '' AND category IS NOT NULL
                AND (country IS NULL OR country = 'US')
              GROUP BY state, category
              ORDER BY state, count DESC`,
          // Average signal count per state
          sql`SELECT state, ROUND(AVG(COALESCE(signal_count, 0))::numeric, 1)::float AS avg_signal
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
                AND (country IS NULL OR country = 'US')
              GROUP BY state`,
          // Total CWP contacts per state
          sql`SELECT state, COALESCE(SUM(COALESCE(cwp_contacts, 0)), 0)::int AS cwp_total
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
                AND (country IS NULL OR country = 'US')
              GROUP BY state`,
          // Priority breakdown per state
          sql`SELECT state, priority, COUNT(*)::int AS count
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
                AND (country IS NULL OR country = 'US')
              GROUP BY state, priority`,
          // Top 3 companies per state by signal_count
          sql`SELECT state, company, signal_count, category, priority
              FROM (
                SELECT state, company, signal_count, category, priority,
                       ROW_NUMBER() OVER (PARTITION BY state ORDER BY signal_count DESC NULLS LAST) AS rn
                FROM prospect_companies
                WHERE state IS NOT NULL AND state != ''
                  AND (country IS NULL OR country = 'US')
              ) ranked
              WHERE rn <= 3`,
          // Pipeline-wide totals (US only)
          sql`SELECT
                COUNT(*)::int AS total_prospects,
                COUNT(DISTINCT state)::int AS states_covered,
                ROUND(AVG(COALESCE(signal_count, 0))::numeric, 1)::float AS avg_signal_overall,
                COALESCE(SUM(COALESCE(cwp_contacts, 0)), 0)::int AS total_cwp
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
                AND (country IS NULL OR country = 'US')`,
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
                AND oe_obj.name IN ('RJG Cavity Pressure Monitoring', 'Kistler Cavity Pressure Monitoring', 'Priamus Cavity Pressure Monitoring')`,
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
          // National Map metric — US only
          sql`SELECT UPPER(pc.state) AS state_code, COUNT(*)::int AS relationship_count
              FROM ontology_relationships orel
              JOIN ontology_entities oe ON orel.subject_entity_id = oe.id
              JOIN prospect_companies pc ON oe.prospect_company_id = pc.id
              WHERE pc.state IS NOT NULL AND pc.state != ''
                AND (pc.country IS NULL OR pc.country = 'US')
              GROUP BY UPPER(pc.state)`,
          // Entity count per state (Company entities + related object entities)
          sql`SELECT UPPER(pc.state) AS state_code, COUNT(DISTINCT oe_obj.id)::int + COUNT(DISTINCT oe.id)::int AS entity_count
              FROM ontology_entities oe
              JOIN prospect_companies pc ON oe.prospect_company_id = pc.id
              LEFT JOIN ontology_relationships orel ON orel.subject_entity_id = oe.id
              LEFT JOIN ontology_entities oe_obj ON orel.object_entity_id = oe_obj.id
              WHERE pc.state IS NOT NULL AND pc.state != ''
                AND (pc.country IS NULL OR pc.country = 'US')
              GROUP BY UPPER(pc.state)`,
          // Prospect count per state (for normalization)
          sql`SELECT UPPER(state) AS state_code, COUNT(*)::int AS prospect_count
              FROM prospect_companies
              WHERE state IS NOT NULL AND state != ''
                AND (country IS NULL OR country = 'US')
              GROUP BY UPPER(state)`,
          // Layer breakdown per state
          sql`SELECT UPPER(pc.state) AS state_code,
                COUNT(*) FILTER (WHERE orel.layer = 1)::int AS layer1_relationships,
                COUNT(*) FILTER (WHERE orel.layer = 2)::int AS layer2_relationships
              FROM ontology_relationships orel
              JOIN ontology_entities oe ON orel.subject_entity_id = oe.id
              JOIN prospect_companies pc ON oe.prospect_company_id = pc.id
              WHERE pc.state IS NOT NULL AND pc.state != ''
                AND (pc.country IS NULL OR pc.country = 'US')
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

    // ─── Phase 4a: server-side AI ontology extraction (read-only proposal) ───
    // Reads the prospect's research brief + existing entities, asks the model for
    // a {entities, relationships} extraction, validates against the canonical type
    // lists, and RETURNS it (no write). The human reviews + imports via the
    // existing ImportOntologyModal → import-ontology-extraction path.
    if (action === 'ai-extract-ontology') {
      try {
        const apiKey = process.env.TOGETHER_AI_API
        if (!apiKey) return res.status(500).json({ error: 'AI extraction is not configured.' })
        const pid = parseInt(id, 10)
        if (!Number.isFinite(pid)) return res.status(400).json({ error: 'A numeric prospect id is required.' })

        const prows = await sql`SELECT id, company, category, state, source_report FROM prospect_companies WHERE id = ${pid}`
        if (!prows.length) return res.status(404).json({ error: `No prospect found with id ${pid}.` })
        const p = prows[0]

        const briefRows = await sql`
          SELECT content FROM prospect_attachments
          WHERE prospect_id = ${pid} AND attachment_type = 'research_brief'
          ORDER BY created_at DESC LIMIT 1`
        if (!briefRows.length || !briefRows[0].content) {
          return res.status(400).json({ error: 'This prospect has no research brief to extract from.' })
        }
        let brief = String(briefRows[0].content)
        if (brief.length > 8000) brief = brief.slice(0, 8000)

        const entRows = await sql`
          SELECT et.name AS type_name, e.name AS entity_name
          FROM ontology_entities e JOIN ontology_entity_types et ON et.id = e.type_id
          ORDER BY et.name, e.name`
        const grouped = {}
        for (const r of entRows) { (grouped[r.type_name] = grouped[r.type_name] || []).push(r.entity_name) }
        const existingList = Object.entries(grouped)
          .map(([t, names]) => `- ${t}: ${names.slice(0, 40).join(', ')}`).join('\n') || '(none yet)'

        const userPrompt = `Company: ${p.company} (prospect_id ${p.id})
Category: ${p.category || 'N/A'} · State: ${p.state || 'N/A'} · Source: ${p.source_report || 'N/A'}

Allowed entity "type" values (use these EXACTLY): ${AI_EXTRACT_ENTITY_TYPES.join(', ')}.
Allowed "relationship_type" values (use these EXACTLY): ${AI_EXTRACT_REL_TYPES.join(', ')}.
"confidence" must be one of: Confirmed, Likely, Inferred.

Existing entities already in the graph — REUSE these exact names when the brief refers to them (do not create near-duplicates):
${existingList}

Output JSON shape (and nothing else):
{"entities":[{"type":"<one of the allowed types>","name":"<entity name>","confidence":"Confirmed|Likely|Inferred","notes":"<short, optional>"}],"relationships":[{"relationship_type":"<one of the allowed types>","subject":"${p.company}","object":"<entity name>","confidence":"Confirmed|Likely|Inferred"}]}

Rules: only extract what the brief actually supports — never invent. The subject of most relationships is "${p.company}". Skip anything you can't tie to a real statement in the brief.

RESEARCH BRIEF:
${brief}`

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 9500)
        let modelData
        try {
          const r = await fetch(ASSISTANT_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              model: ASSISTANT_MODEL,
              max_tokens: 2048,
              temperature: 0.2,
              messages: [
                { role: 'system', content: ASSISTANT_EXTRACT_SYSTEM },
                { role: 'user', content: userPrompt },
              ],
            }),
            signal: controller.signal,
          })
          if (!r.ok) {
            const detail = await r.text().catch(() => '')
            console.error(`ai-extract-ontology: Together ${r.status}: ${detail.slice(0, 300)}`)
            return res.status(502).json({ error: 'The extraction model is unavailable right now. Try the copy-paste extraction instead.' })
          }
          modelData = await r.json()
        } catch (e) {
          if (e && e.name === 'AbortError') {
            return res.status(504).json({ error: 'Extraction timed out. Try again, or use the copy-paste extraction.' })
          }
          throw e
        } finally {
          clearTimeout(timer)
        }

        const text = modelData?.choices?.[0]?.message?.content || ''
        const parsed = parseExtractionJson(text)
        if (!parsed) {
          return res.status(502).json({ error: 'The model did not return usable JSON. Try again or use the copy-paste extraction.' })
        }
        const entities = (Array.isArray(parsed.entities) ? parsed.entities : [])
          .filter((e) => e && AI_EXTRACT_ENTITY_TYPES.includes(e.type) && e.name && String(e.name).trim())
          .map((e) => {
            const o = { type: e.type, name: String(e.name).trim() }
            if (AI_EXTRACT_CONFIDENCES.includes(e.confidence)) o.confidence = e.confidence
            if (e.notes && String(e.notes).trim()) o.notes = String(e.notes).trim()
            return o
          })
        const relationships = (Array.isArray(parsed.relationships) ? parsed.relationships : [])
          .filter((r) => r && AI_EXTRACT_REL_TYPES.includes(r.relationship_type) && r.subject && r.object)
          .map((r) => {
            const o = { relationship_type: r.relationship_type, subject: String(r.subject).trim(), object: String(r.object).trim() }
            if (AI_EXTRACT_CONFIDENCES.includes(r.confidence)) o.confidence = r.confidence
            return o
          })
        return res.status(200).json({ company: p.company, prospect_id: p.id, entities, relationships, model: ASSISTANT_MODEL })
      } catch (error) {
        console.error('Error in ai-extract-ontology:', error)
        return res.status(500).json({ error: 'Something went wrong during extraction.' })
      }
    }

    // ─── Ontology: Knowledge Graph — aggregated super-node explorer ───
    if (action === 'ontology-graph') {
      try {
        const { state, type } = req.query

        // Build optional WHERE filters for company scoping
        let companyFilter = ''
        const filterParams = []
        if (state === 'INTL') {
          companyFilter = `AND pc.country IS NOT NULL AND pc.country != 'US'`
        } else if (state) {
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
            ARRAY_AGG(DISTINCT r.subject_entity_id) AS member_ids,
            ARRAY_AGG(DISTINCT subj.prospect_company_id) FILTER (WHERE subj.prospect_company_id IS NOT NULL) AS member_prospect_ids
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
          // Prospect-company ids of member companies — used by GraphExplorer to
          // map query-result company ids onto super-nodes for highlighting.
          memberProspectIds: (sn.member_prospect_ids || []).map(Number),
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
        const { entity_id, depth, state } = req.query
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

        // If state filter is active, remove Company nodes not in that state.
        // Special value 'INTL' filters to non-US companies.
        if (state) {
          const stateProspects = state === 'INTL'
            ? await sql`SELECT id FROM prospect_companies WHERE country IS NOT NULL AND country != 'US'`
            : await sql`SELECT id FROM prospect_companies WHERE UPPER(state) = ${state.toUpperCase()}`
          const stateProspectIds = new Set(stateProspects.map(r => r.id))

          // Keep non-Company nodes and Company nodes in the target state
          const filteredEntityMap = new Map()
          for (const [id, entity] of entityMap) {
            if (entity.type !== 'Company' || !entity.prospectId || stateProspectIds.has(entity.prospectId)) {
              filteredEntityMap.set(id, entity)
            }
          }

          const filteredIds = new Set(filteredEntityMap.keys())
          const filteredLinks = linkList.filter(l =>
            filteredIds.has(l.source) && filteredIds.has(l.target)
          )

          return res.status(200).json({
            nodes: [...filteredEntityMap.values()],
            links: filteredLinks,
            meta: {
              rootEntityId: Number(entity_id),
              rootLabel: root.name,
              rootType: root.type_name,
              depth: maxDepth,
              nodeCount: filteredEntityMap.size,
              linkCount: filteredLinks.length,
              stateFilter: state.toUpperCase(),
            },
          })
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
        const { certifications, technologies, markets, ownership, equipment, quality_methods, state: queryState } = req.query

        // Parse comma-separated criteria
        const criteria = {}
        if (certifications) criteria.Certification = certifications.split(',').map(s => s.trim())
        if (technologies) criteria['Technology / Software'] = technologies.split(',').map(s => s.trim())
        if (markets) criteria['Market Vertical'] = markets.split(',').map(s => s.trim())
        if (ownership) criteria['Ownership Structure'] = ownership.split(',').map(s => s.trim())
        if (equipment) criteria['Equipment Brand'] = equipment.split(',').map(s => s.trim())
        if (quality_methods) criteria['Quality Method'] = quality_methods.split(',').map(s => s.trim())

        const categoryCount = Object.keys(criteria).length
        if (categoryCount === 0) {
          return res.status(400).json({ error: 'At least one filter criterion is required (certifications, technologies, markets, ownership, equipment, quality_methods)' })
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
          ${queryState === 'INTL'
            ? `WHERE pc.country IS NOT NULL AND pc.country != 'US'`
            : (queryState ? `WHERE pc.state = $3` : '')}
          ORDER BY cm.match_count DESC, pc.signal_count DESC NULLS LAST
        `
        const matchParams = [allEntityNames, categoryCount]
        if (queryState && queryState !== 'INTL') matchParams.push(queryState.toUpperCase())

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
            COUNT(*) FILTER (WHERE (state IS NULL OR state = '') AND (country IS NULL OR country = 'US'))::int as null_state,
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
            COUNT(*) FILTER (WHERE medical_device_mfg LIKE 'Yes%' AND (key_certifications IS NULL OR key_certifications NOT ILIKE '%13485%'))::int as medical_no_cert,
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
          { id: 'null_state', name: 'Missing state (US only)', severity: 'critical', category: 'completeness', description: 'US prospects with no state assigned. Cannot appear on National Map or in corridor analytics. International prospects are excluded from this check.', count: c.null_state, suggestion: 'Add state for these companies from their website or source report.' },
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
              WHERE (state IS NULL OR state = '') AND (country IS NULL OR country = 'US')
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
              WHERE medical_device_mfg LIKE 'Yes%' AND (key_certifications IS NULL OR key_certifications NOT ILIKE '%13485%')
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

    // Thread 1: backfill candidates for typed parent/FKA model (READ-ONLY).
    // Computes heuristic suggestions for parent_relationship_kind / financial_sponsor /
    // former_names from current parent_company + also_known_as values. Does NOT write.
    // The companion POST action 'apply-parent-type-classifications' performs the writes.
    if (action === 'backfill-parent-types-dryrun') {
      try {
        const rows = await sql`
          SELECT id, company, parent_company, also_known_as, ownership_type, recent_ma
          FROM prospect_companies
        `

        // Index company names for token-match validation (Barnes-style aka cleanup).
        const companyNameSet = new Set()
        for (const r of rows) {
          if (r.company) companyNameSet.add(r.company.trim().toLowerCase())
        }

        // Count children per parent_company (case-insensitive, trimmed).
        const childCounts = new Map()
        for (const r of rows) {
          if (r.parent_company && r.parent_company.trim()) {
            const key = r.parent_company.trim().toLowerCase()
            childCounts.set(key, (childCounts.get(key) || 0) + 1)
          }
        }

        // Heuristic patterns for financial-sponsor detection.
        //   PE_PATTERN:  matches the strong PE markers anywhere in the string.
        //   PE_ENDING:   looser; only the trailing word — used when combined with singleton signal.
        //   BARE_SUFFIX: ambiguous standalone strings that should NOT auto-flag (Group / Holdings alone).
        const PE_PATTERN = /\b(Capital|Private Equity|PE|LP|Fund|Investments?)\b/i
        const PE_ENDING = /(Partners|Equity)\s*$/i
        const BARE_SUFFIX = /^(Group|Holdings|Inc\.?|Corp\.?|LLC|Ltd\.?)\s*$/i

        function classifyParentString(parent) {
          if (!parent || !parent.trim()) return null
          const trimmed = parent.trim()
          if (BARE_SUFFIX.test(trimmed)) return null
          if (PE_PATTERN.test(trimmed)) return 'pattern'
          if (PE_ENDING.test(trimmed)) return 'ending'
          return null
        }

        const candidates = []

        for (const r of rows) {
          // A) Financial sponsor extraction.
          const peHit = classifyParentString(r.parent_company)
          if (peHit) {
            const ownershipPE = r.ownership_type && /\bPE\b/i.test(r.ownership_type)
            const childCountForParent = childCounts.get(r.parent_company.trim().toLowerCase()) || 0
            let confidence = null
            let reason = ''
            if (peHit === 'pattern' && ownershipPE) {
              confidence = 'high'
              reason = "parent_company matches PE pattern AND ownership_type contains 'PE'"
            } else if (peHit === 'pattern') {
              confidence = 'medium'
              reason = 'parent_company matches PE pattern (no ownership_type corroboration)'
            } else if (peHit === 'ending' && childCountForParent === 1) {
              confidence = 'medium'
              reason = 'parent_company ends in Partners/Equity AND is singleton in parent landscape'
            }
            if (confidence) {
              candidates.push({
                id: r.id,
                company: r.company,
                category: 'financial_sponsor',
                current: {
                  parent_company: r.parent_company,
                  also_known_as: r.also_known_as,
                  ownership_type: r.ownership_type,
                },
                suggested: { financial_sponsor: r.parent_company.trim(), parent_company: null },
                confidence,
                reason,
              })
              continue
            }
          }

          // B) Absorbed-brand candidate.
          if (r.also_known_as && r.also_known_as.trim() && r.parent_company && r.parent_company.trim()) {
            const aka = r.also_known_as.trim()
            if (!aka.includes(',') && !aka.includes('/')) {
              const recentMaMatches = r.recent_ma && /\b(acquired by|absorbed|merger|merged|bought by)\b/i.test(r.recent_ma)
              candidates.push({
                id: r.id,
                company: r.company,
                category: 'absorbed_into',
                current: {
                  parent_company: r.parent_company,
                  also_known_as: aka,
                  recent_ma: r.recent_ma,
                },
                suggested: { parent_relationship_kind: 'absorbed_into', former_names: [aka], also_known_as: null },
                confidence: recentMaMatches ? 'high' : 'medium',
                reason: recentMaMatches
                  ? 'aka populated with single name AND recent_ma confirms acquisition'
                  : 'aka populated with single name (suggests former name); recent_ma not corroborating',
              })
              continue
            }
          }

          // C) Subsidiary candidate.
          if (r.parent_company && r.parent_company.trim() && (!r.also_known_as || !r.also_known_as.trim())) {
            const parentKey = r.parent_company.trim().toLowerCase()
            const cc = childCounts.get(parentKey) || 0
            if (cc >= 2) {
              const isCorporate = r.ownership_type && /(corporate|strategic)/i.test(r.ownership_type)
              candidates.push({
                id: r.id,
                company: r.company,
                category: 'subsidiary',
                current: { parent_company: r.parent_company, ownership_type: r.ownership_type },
                suggested: { parent_relationship_kind: 'subsidiary' },
                confidence: isCorporate ? 'high' : 'medium',
                reason: isCorporate
                  ? `aka empty, parent has ${cc} children, ownership_type Corporate/Strategic`
                  : `aka empty, parent has ${cc} children (real operational parent)`,
              })
              continue
            }
          }

          // D) Brand-list aka cleanup (Barnes pattern).
          if (r.also_known_as && r.also_known_as.trim()) {
            const tokens = r.also_known_as.split(/[,/]/).map(s => s.trim()).filter(Boolean)
            if (tokens.length >= 3) {
              const matches = tokens.filter(t => companyNameSet.has(t.toLowerCase()))
              if (matches.length >= 2) {
                candidates.push({
                  id: r.id,
                  company: r.company,
                  category: 'aka_cleanup',
                  current: { also_known_as: r.also_known_as, parent_company: r.parent_company },
                  suggested: { also_known_as: null },
                  confidence: 'high',
                  reason: `aka contains ${tokens.length} comma/slash-separated tokens; ${matches.length} match existing company rows (brand-list misuse)`,
                })
              }
            }
          }
        }

        const summary = {
          total_candidates: candidates.length,
          by_category: candidates.reduce((acc, c) => { acc[c.category] = (acc[c.category] || 0) + 1; return acc }, {}),
          by_confidence: candidates.reduce((acc, c) => { acc[c.confidence] = (acc[c.confidence] || 0) + 1; return acc }, {}),
        }

        return res.status(200).json({ summary, candidates })
      } catch (error) {
        console.error('Error running backfill dryrun:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Trends: monthly counts for quarterly-review charts (QA audit E7) ───
    // Deliberately global (the Charts sub-view's filters don't apply) — these
    // are program-level momentum numbers, not slice-and-dice analytics.
    if (action === 'trends') {
      try {
        await ensureProspectSchemaAdditions(sql)
        const [added, conversions, briefs, statusFlows] = await Promise.all([
          sql`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
              FROM prospect_companies
              WHERE created_at >= NOW() - INTERVAL '12 months'
              GROUP BY 1 ORDER BY 1`,
          sql`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
              FROM opportunities
              WHERE source_prospect_id IS NOT NULL AND created_at >= NOW() - INTERVAL '12 months'
              GROUP BY 1 ORDER BY 1`,
          sql`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
              FROM prospect_attachments
              WHERE attachment_type = 'research_brief' AND created_at >= NOW() - INTERVAL '12 months'
              GROUP BY 1 ORDER BY 1`,
          sql`SELECT to_char(date_trunc('month', transitioned_at), 'YYYY-MM') AS month, to_status, COUNT(*)::int AS count
              FROM prospect_status_transitions
              WHERE transitioned_at >= NOW() - INTERVAL '12 months'
              GROUP BY 1, 2 ORDER BY 1`,
        ])

        // Continuous last-12-months scaffold so the charts have stable axes
        const months = []
        const now = new Date()
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }
        const toMap = rows => Object.fromEntries(rows.map(r => [r.month, r.count]))
        const addedMap = toMap(added)
        const convMap = toMap(conversions)
        const briefMap = toMap(briefs)
        const series = months.map(m => ({
          month: m,
          added: addedMap[m] || 0,
          conversions: convMap[m] || 0,
          briefs: briefMap[m] || 0,
        }))

        return res.status(200).json({
          series,
          status_transitions: statusFlows,
          meta: {
            months: 12,
            note: 'Status history accrues from the day transition logging deployed — earlier status changes were never recorded.',
          },
        })
      } catch (error) {
        console.error('Error fetching trends:', error)
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

    // Contacts for a prospect (QA audit E5)
    if (action === 'contacts' && id) {
      try {
        await ensureProspectSchemaAdditions(sql)
        const contacts = await sql`
          SELECT * FROM prospect_contacts
          WHERE prospect_id = ${id}
          ORDER BY name ASC
        `
        return res.status(200).json(contacts)
      } catch (error) {
        console.error('Error fetching contacts:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Activity log for a prospect
    if (action === 'get-activity-log' && id) {
      try {
        const entries = await sql`
          SELECT * FROM prospect_activity_log
          WHERE prospect_id = ${id}
          ORDER BY created_at DESC
        `
        return res.status(200).json(entries)
      } catch (error) {
        console.error('Error fetching activity log:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Full single-company export: the live company + its 1-hop corporate links
    // (typed parent/children + former-name rows) + each record's attachments,
    // activity log, and tasks, assembled into one JSON payload for an external
    // AI assistant. Reuses the single-prospect read shape (the `if (id)` handler
    // below), plus the attachments / get-activity-log / tasks read shapes above.
    if (action === 'export-json' && id) {
      try {
        // 1.1: contacts[] now populated from prospect_contacts (QA audit E5)
        const SCHEMA_VERSION = '1.1'
        const TYPED_KINDS = ['subsidiary', 'absorbed_into']
        const LINKED_CAP = 25
        await ensureProspectSchemaAdditions(sql)

        // 1. Primary company — same shape as GET ?id=X (SELECT p.* keeps this
        //    robust to the live schema, which drifts from create-prospect-table.sql).
        const primaryRows = await sql`
          SELECT p.*,
            (SELECT COUNT(*)::int FROM opportunities o WHERE o.source_prospect_id = p.id) as conversion_count
          FROM prospect_companies p
          WHERE p.id = ${id}
        `
        if (!primaryRows || primaryRows.length === 0) {
          return res.status(404).json({ error: 'Prospect not found' })
        }
        const primary = primaryRows[0]
        const primaryId = Number(primary.id)

        // 2. Resolve 1-hop corporate links. Relationships are denormalized strings,
        //    so matching is case-insensitive (LOWER(TRIM(...))) — consistent with the
        //    import upsert and the table's name-string grouping. Deduped by row id
        //    (a typed label wins over former_name); cycle-guarded via `visited`.
        //    SYNC: this walk mirrors the reference implementation in
        //    scripts/verify-export.js — keep the two aligned.
        const visited = new Set([primaryId])
        const linked = [] // { row, relationship, link_basis }
        const addLinked = (row, relationship, link_basis) => {
          const rid = Number(row.id)
          if (visited.has(rid)) return
          visited.add(rid)
          linked.push({ row, relationship, link_basis })
        }

        // 2a. Typed children: rows naming this company as their typed parent.
        const children = await sql`
          SELECT * FROM prospect_companies
          WHERE LOWER(TRIM(parent_company)) = LOWER(TRIM(${primary.company}))
            AND parent_relationship_kind = ANY(${TYPED_KINDS})
            AND id <> ${primaryId}
        `
        for (const row of children) addLinked(row, row.parent_relationship_kind, 'parent_company')

        // 2b. Typed parent: this company's own parent (only when its kind is typed).
        if (primary.parent_company && TYPED_KINDS.includes(primary.parent_relationship_kind)) {
          const parents = await sql`
            SELECT * FROM prospect_companies
            WHERE LOWER(TRIM(company)) = LOWER(TRIM(${primary.parent_company}))
              AND id <> ${primaryId}
            LIMIT 1
          `
          for (const row of parents) addLinked(row, 'parent', 'parent_company')
        }

        // 2c. Former-name rows: each former_names entry resolved to its own row, if one exists.
        //     This is what catches an absorbed legacy shop (e.g. X-Cell under Sybridge)
        //     when it is linked only through former_names rather than parent_company.
        if (Array.isArray(primary.former_names) && primary.former_names.length > 0) {
          const lowered = primary.former_names
            .filter(Boolean)
            .map((n) => String(n).trim().toLowerCase())
          if (lowered.length > 0) {
            const fkaRows = await sql`
              SELECT * FROM prospect_companies
              WHERE LOWER(TRIM(company)) = ANY(${lowered})
                AND id <> ${primaryId}
            `
            for (const row of fkaRows) addLinked(row, 'former_name', 'former_names')
          }
        }

        const truncated = linked.length > LINKED_CAP
        const linkedFinal = truncated ? linked.slice(0, LINKED_CAP) : linked

        // 3. Batch-fetch sub-records for every involved company (1 query each).
        const allIds = [primaryId, ...linkedFinal.map((l) => Number(l.row.id))]
        const [attachmentRows, activityRows, taskRows, contactRows] = await Promise.all([
          sql`SELECT * FROM prospect_attachments WHERE prospect_id = ANY(${allIds}) ORDER BY created_at DESC`,
          sql`SELECT * FROM prospect_activity_log WHERE prospect_id = ANY(${allIds}) ORDER BY created_at DESC`,
          sql`SELECT * FROM prospect_tasks WHERE prospect_id = ANY(${allIds}) ORDER BY due_date ASC NULLS LAST, created_at ASC`,
          sql`SELECT * FROM prospect_contacts WHERE prospect_id = ANY(${allIds}) ORDER BY name ASC`,
        ])

        const groupByProspect = (rows) => {
          const m = new Map()
          for (const r of rows) {
            const key = Number(r.prospect_id)
            if (!m.has(key)) m.set(key, [])
            m.get(key).push(r)
          }
          return m
        }
        const attByP = groupByProspect(attachmentRows)
        const actByP = groupByProspect(activityRows)
        const taskByP = groupByProspect(taskRows)
        const contactByP = groupByProspect(contactRows)

        // 4. Shapers — stable, LLM-friendly keys.
        const shapeAttachment = (a) => ({
          type: a.attachment_type,
          title: a.title || null,
          body: a.content || '',
          created_at: a.created_at,
          created_by: a.created_by || null,
        })
        // No `type` column exists; derive best-effort from the lifecycle entry prefixes.
        const deriveActivityType = (text) => {
          const t = (text || '').replace(/^\s+/, '')
          if (/^(Task |✓ Task|✗ Task|↺ Task|⌫ Task)/.test(t)) return 'task'
          if (/^⚑/.test(t) || /^✓ Review/.test(t)) return 'flag'
          return 'note'
        }
        const shapeActivity = (e) => ({
          timestamp: e.created_at,
          author: e.created_by || null,
          type: deriveActivityType(e.entry_text),
          entry: e.entry_text || '',
        })
        const shapeTask = (t) => ({
          task: t.description,
          assignee: t.assignee || null,
          due_date: t.due_date,
          status: t.status,
          created_by: t.created_by || null,
          created_at: t.created_at,
          completed_at: t.completed_at || null,
          completed_by: t.completed_by || null,
        })
        // contacts[]: structured rows from prospect_contacts (E5, schema 1.1).
        // Older person-level mentions still live in free text (notes /
        // psb_connection_notes) and research-brief attachments, which travel too.
        const shapeContact = (c) => ({
          name: c.name,
          role: c.role || null,
          email: c.email || null,
          phone: c.phone || null,
          notes: c.notes || null,
          source: c.source || null,
          last_contacted: c.last_contacted || null,
          created_by: c.created_by || null,
          created_at: c.created_at,
        })
        const subRecords = (pid) => ({
          contacts: (contactByP.get(pid) || []).map(shapeContact),
          attachments: (attByP.get(pid) || []).map(shapeAttachment),
          activity_log: (actByP.get(pid) || []).map(shapeActivity),
          tasks: (taskByP.get(pid) || []).map(shapeTask),
        })

        // 5. Assemble payload.
        const primarySub = subRecords(primaryId)
        const payload = {
          generated_at: new Date().toISOString(),
          schema_version: SCHEMA_VERSION,
          company: primary,
          contacts: primarySub.contacts,
          attachments: primarySub.attachments,
          activity_log: primarySub.activity_log,
          tasks: primarySub.tasks,
          linked_entities: linkedFinal.map(({ row, relationship, link_basis }) => {
            const sub = subRecords(Number(row.id))
            return {
              relationship,
              link_basis,
              company: row,
              contacts: sub.contacts,
              attachments: sub.attachments,
              activity_log: sub.activity_log,
              tasks: sub.tasks,
            }
          }),
        }
        if (truncated) payload.linked_entities_truncated = true

        return res.status(200).json(payload)
      } catch (error) {
        console.error('Error building export-json:', error)
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
          'Northeast Tool': ['PA','NY','CT','NJ','MA','NH','VT','ME','RI','DC','DE','MD','WV'],
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
          const groups = outreach_group.split(',').map(s => s.trim()).filter(Boolean)
          if (groups.length === 1) {
            params.push(groups[0])
            conditions.push(`outreach_group = $${params.length}`)
          } else if (groups.length > 1) {
            const placeholders = groups.map(g => { params.push(g); return `$${params.length}` }).join(',')
            conditions.push(`outreach_group IN (${placeholders})`)
          }
        }
        if (category) {
          const cats = category.split(',').map(s => s.trim()).filter(Boolean)
          if (cats.length === 1) {
            const catCondition = buildCategoryCondition(cats[0], params)
            if (catCondition) conditions.push(catCondition)
          } else if (cats.length > 1) {
            const catClauses = cats.map(c => buildCategoryCondition(c, params)).filter(Boolean)
            if (catClauses.length > 0) conditions.push(`(${catClauses.join(' OR ')})`)
          }
        }
        if (priority) {
          const pris = priority.split(',').map(s => s.trim()).filter(Boolean)
          if (pris.length === 1) {
            params.push(pris[0])
            conditions.push(`priority = $${params.length}`)
          } else if (pris.length > 1) {
            const placeholders = pris.map(p => { params.push(p); return `$${params.length}` }).join(',')
            conditions.push(`priority IN (${placeholders})`)
          }
        }
        if (geography_tier) {
          params.push(geography_tier)
          conditions.push(`geography_tier = $${params.length}`)
        }
        if (corridor) {
          // SYNC: country/corridor — also in ProspectTable.jsx, corridors.js
          const corridors = corridor.split(',').map(s => s.trim()).filter(Boolean)
          const allStates = []
          let hasUnknown = false
          let hasInternational = false
          for (const c of corridors) {
            if (c === 'International') hasInternational = true
            else if (c === 'Unknown') hasUnknown = true
            else {
              const states = CORRIDOR_TO_STATES[c]
              if (states) allStates.push(...states)
            }
          }
          const stateConditions = []
          if (allStates.length > 0) {
            const placeholders = allStates.map(s => { params.push(s); return `$${params.length}` }).join(',')
            stateConditions.push(`((country IS NULL OR country = 'US') AND state IN (${placeholders}))`)
          }
          if (hasUnknown) stateConditions.push(`((country IS NULL OR country = 'US') AND (state IS NULL OR state = ''))`)
          if (hasInternational) stateConditions.push(`(country IS NOT NULL AND country != 'US')`)
          if (stateConditions.length > 0) conditions.push(`(${stateConditions.join(' OR ')})`)
        }
        if (medical_device_mfg) {
          conditions.push(`medical_device_mfg LIKE 'Yes%'`)
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
          // Manufacturing corridors (derived from country + state)
          // SYNC: country/corridor — also in ProspectTable.jsx, corridors.js
          sql.query(
            `SELECT
               CASE
                 WHEN country IS NOT NULL AND country != 'US' THEN 'International'
                 WHEN state IN ('MI','OH','IN','IL','WI') THEN 'Great Lakes Auto'
                 WHEN state IN ('PA','NY','CT','NJ','MA','NH','VT','ME','RI','DC','DE','MD','WV') THEN 'Northeast Tool'
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
          if (row.medical_device_mfg?.startsWith('Yes')) {
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
             AND medical_device_mfg LIKE 'Yes%'
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

    // ─── Tasks (Threads 2+3): list or count prospect_tasks rows ───
    if (action === 'tasks') {
      try {
        const { assignee = 'all', current_user, status = 'open', prospect_id: pid, format = 'full' } = req.query

        const conditions = []
        const params = []

        if (pid) {
          params.push(pid)
          conditions.push(`t.prospect_id = $${params.length}`)
        }

        // SYNC: badge logic — also in src/components/prospects/tasks/taskUtils.js
        // The "My Tasks" badge counts open tasks where assignee = current_user OR assignee IS NULL.
        if (assignee === 'me') {
          if (!current_user) {
            return res.status(400).json({ error: 'current_user query param is required when assignee=me' })
          }
          params.push(current_user)
          conditions.push(`(t.assignee = $${params.length} OR t.assignee IS NULL)`)
        } else if (assignee === 'unassigned') {
          conditions.push('t.assignee IS NULL')
        } else if (assignee !== 'all') {
          params.push(assignee)
          conditions.push(`t.assignee = $${params.length}`)
        }

        if (status !== 'all') {
          params.push(status)
          conditions.push(`t.status = $${params.length}`)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        if (format === 'count') {
          const countQuery = `SELECT COUNT(*)::int AS count FROM prospect_tasks t ${whereClause}`
          const [row] = await sql.query(countQuery, params)
          return res.status(200).json({ count: row?.count ?? 0 })
        }

        // Full format: join with prospect_companies so the UI gets company_name without a second fetch.
        const listQuery = `
          SELECT t.*, p.company AS company_name, p.prospect_status, p.outreach_group
          FROM prospect_tasks t
          JOIN prospect_companies p ON p.id = t.prospect_id
          ${whereClause}
          ORDER BY t.due_date ASC NULLS LAST, t.created_at ASC
        `
        const rows = await sql.query(listQuery, params)
        return res.status(200).json(rows)
      } catch (error) {
        console.error('Error fetching tasks:', error)
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
        'Northeast Tool': ['PA','NY','CT','NJ','MA','NH','VT','ME','RI','DC','DE','MD','WV'],
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
          const groups = outreach_group.split(',').map(s => s.trim()).filter(Boolean)
          if (groups.length === 1) {
            params.push(groups[0])
            conditions.push(`outreach_group = $${params.length}`)
          } else if (groups.length > 1) {
            const placeholders = groups.map(g => { params.push(g); return `$${params.length}` }).join(',')
            conditions.push(`outreach_group IN (${placeholders})`)
          }
        }
        if (category) {
          const cats = category.split(',').map(s => s.trim()).filter(Boolean)
          if (cats.length === 1) {
            const catCondition = buildCategoryCondition(cats[0], params)
            if (catCondition) conditions.push(catCondition)
          } else if (cats.length > 1) {
            const catClauses = cats.map(c => buildCategoryCondition(c, params)).filter(Boolean)
            if (catClauses.length > 0) conditions.push(`(${catClauses.join(' OR ')})`)
          }
        }
        if (priority) {
          const pris = priority.split(',').map(s => s.trim()).filter(Boolean)
          if (pris.length === 1) {
            params.push(pris[0])
            conditions.push(`priority = $${params.length}`)
          } else if (pris.length > 1) {
            const placeholders = pris.map(p => { params.push(p); return `$${params.length}` }).join(',')
            conditions.push(`priority IN (${placeholders})`)
          }
        }
        if (geography_tier) {
          params.push(geography_tier)
          conditions.push(`geography_tier = $${params.length}`)
        }
        if (listCorridor) {
          // SYNC: country/corridor — also in ProspectTable.jsx, corridors.js
          const corridors = listCorridor.split(',').map(s => s.trim()).filter(Boolean)
          const allStates = []
          let hasUnknown = false
          let hasInternational = false
          for (const c of corridors) {
            if (c === 'International') hasInternational = true
            else if (c === 'Unknown') hasUnknown = true
            else {
              const states = CORRIDOR_TO_STATES_LIST[c]
              if (states) allStates.push(...states)
            }
          }
          const stateConditions = []
          if (allStates.length > 0) {
            const placeholders = allStates.map(s => { params.push(s); return `$${params.length}` }).join(',')
            stateConditions.push(`((country IS NULL OR country = 'US') AND state IN (${placeholders}))`)
          }
          if (hasUnknown) stateConditions.push(`((country IS NULL OR country = 'US') AND (state IS NULL OR state = ''))`)
          if (hasInternational) stateConditions.push(`(country IS NOT NULL AND country != 'US')`)
          if (stateConditions.length > 0) conditions.push(`(${stateConditions.join(' OR ')})`)
        }
        if (medical_device_mfg) {
          conditions.push(`medical_device_mfg LIKE 'Yes%'`)
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

    // ─── Tasks (Threads 2+3): hard delete a task row ───
    if (action === 'tasks') {
      const { task_id, deleted_by } = req.query
      if (!task_id) {
        return res.status(400).json({ error: 'task_id query param is required' })
      }
      const actor = deleted_by || 'Unknown'
      try {
        const [task] = await sql`SELECT * FROM prospect_tasks WHERE id = ${task_id}`
        if (!task) return res.status(404).json({ error: 'Task not found' })

        await sql`DELETE FROM prospect_tasks WHERE id = ${task_id}`

        await sql`
          INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
          VALUES (${task.prospect_id}, ${'⌫ Task deleted: ' + task.description}, ${actor})
        `

        return res.status(200).json({ deleted: true, id: parseInt(task_id, 10) })
      } catch (error) {
        console.error('Error deleting task:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Contacts (QA audit E5): delete with activity log entry ───
    if (action === 'contacts') {
      const { contact_id, deleted_by } = req.query
      if (!contact_id) {
        return res.status(400).json({ error: 'contact_id query param is required' })
      }
      try {
        await ensureProspectSchemaAdditions(sql)
        const [contact] = await sql`SELECT * FROM prospect_contacts WHERE id = ${contact_id}`
        if (!contact) return res.status(404).json({ error: 'Contact not found' })

        await sql`DELETE FROM prospect_contacts WHERE id = ${contact_id}`
        await sql`
          INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
          VALUES (${contact.prospect_id}, ${'Contact removed: ' + contact.name}, ${deleted_by || 'Unknown'})
        `

        return res.status(200).json({ deleted: true, id: parseInt(contact_id, 10) })
      } catch (error) {
        console.error('Error deleting contact:', error)
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

    // ─── Read-only reasoning assistant (Together.ai chat-completions tool-use loop) ───
    // Answers questions about prospects, grounded entirely in data fetched
    // through the five read-only tools above. No DB writes. Auth is already
    // enforced by the file-level requireAuth guard at the top of the handler.
    if (action === 'assistant') {
      try {
        const apiKey = process.env.TOGETHER_AI_API
        if (!apiKey) {
          console.error('Assistant: TOGETHER_AI_API is not configured')
          return res.status(500).json({ error: 'The assistant is not configured.' })
        }

        const body = req.body || {}
        const incoming = body.messages
        if (!Array.isArray(incoming) || incoming.length === 0) {
          return res.status(400).json({ error: 'messages must be a non-empty array.' })
        }
        for (const m of incoming) {
          if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
            return res.status(400).json({ error: 'Each message must be { role: "user" | "assistant", content: string }.' })
          }
        }

        // OpenAI-compatible: the system prompt is the first message (not a
        // top-level field). Draft mode (L1) appends drafting guidance; still
        // read-only on data (it generates text, sends nothing). Then add the
        // prospect-context line when launched from one.
        let systemPrompt = body.mode === 'draft' ? `${ASSISTANT_SYSTEM}\n\n${ASSISTANT_DRAFT_GUIDANCE}` : ASSISTANT_SYSTEM
        const prospectId = parseInt(body.prospectId, 10)
        if (Number.isFinite(prospectId)) {
          const ctxRows = await sql`SELECT company FROM prospect_companies WHERE id = ${prospectId}`
          if (ctxRows.length) {
            systemPrompt += `\n\nThe user is currently viewing prospect #${prospectId} (${ctxRows[0].company}). Treat that as the starting point unless they ask about something else.`
          }
        }

        // System message + the visible conversation; tool round-trips appended server-side.
        const messages = [
          { role: 'system', content: systemPrompt },
          ...incoming.map((m) => ({ role: m.role, content: m.content })),
        ]
        // Map the neutral tool defs to OpenAI's function-tool shape (input_schema → parameters).
        const openaiTools = ASSISTANT_TOOLS.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.input_schema },
        }))
        const toolsUsed = new Set()

        const callModel = async ({ forceText = false } = {}) => {
          const payload = {
            model: ASSISTANT_MODEL,
            max_tokens: ASSISTANT_MAX_TOKENS,
            messages,
            tools: openaiTools,
            tool_choice: forceText ? 'none' : 'auto',
          }
          const r = await fetch(ASSISTANT_ENDPOINT, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
          })
          if (!r.ok) {
            const detail = await r.text().catch(() => '')
            console.error(`Assistant: Together API ${r.status}: ${detail.slice(0, 500)}`)
            const err = new Error('llm_error')
            err.isLlm = true
            throw err
          }
          return r.json()
        }

        for (let turn = 0; turn < ASSISTANT_MAX_TURNS; turn++) {
          const data = await callModel()
          const choice = (data.choices && data.choices[0]) || {}
          const message = choice.message || {}
          const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []

          if (choice.finish_reason !== 'tool_calls' || toolCalls.length === 0) {
            // stop / length / content_filter — terminal.
            const answer = (message.content && message.content.trim()) || 'I was unable to produce an answer.'
            return res.status(200).json({ answer, toolsUsed: [...toolsUsed] })
          }

          // Append the assistant turn (carries the tool_calls) before the tool results.
          messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls })

          // Run each tool call read-only; append one tool message per call.
          for (const call of toolCalls) {
            const fn = call.function || {}
            toolsUsed.add(fn.name)
            let resultStr
            try {
              let args = {}
              if (fn.arguments) {
                try { args = JSON.parse(fn.arguments) } catch { args = {} }
              }
              const result = await runAssistantTool(sql, fn.name, args)
              resultStr = JSON.stringify(result)
            } catch (toolErr) {
              console.error(`Assistant tool ${fn.name} failed:`, toolErr)
              resultStr = JSON.stringify({ error: 'The tool failed to run.' })
            }
            if (resultStr.length > ASSISTANT_TOOL_RESULT_CAP) {
              resultStr = resultStr.slice(0, ASSISTANT_TOOL_RESULT_CAP) + '…(truncated)'
            }
            messages.push({ role: 'tool', tool_call_id: call.id, content: resultStr })
          }
        }

        // Hit MAX_TURNS — one final no-tools call to force a text wrap-up.
        try {
          const data = await callModel({ forceText: true })
          const message = (data.choices && data.choices[0] && data.choices[0].message) || {}
          const answer = (message.content && message.content.trim()) || 'I gathered some information but ran out of reasoning steps before finishing.'
          return res.status(200).json({
            answer: answer + '\n\n_(Note: reached the reasoning-step limit.)_',
            toolsUsed: [...toolsUsed],
          })
        } catch (finalErr) {
          return res.status(200).json({
            answer: 'I gathered some information but ran out of reasoning steps before finishing. Please try narrowing your question.',
            toolsUsed: [...toolsUsed],
          })
        }
      } catch (error) {
        if (error && error.isLlm) {
          return res.status(500).json({ error: 'The assistant is temporarily unavailable. Please try again.' })
        }
        console.error('Assistant error:', error)
        return res.status(500).json({ error: 'Something went wrong while answering.' })
      }
    }

    // ─── Recalculate all priority scores (batched — see helper) ───
    if (action === 'recalculate-all-priorities') {
      try {
        const result = await recalculateAllPriorities(sql)
        return res.status(200).json(result)
      } catch (error) {
        console.error('Error recalculating priorities:', error)
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

    // Thread 1: apply human-reviewed classifications from the dryrun.
    // Body: { classifications: [{ id, suggested: {<field>: <value>, ...} }, ...], applied_by? }
    // Each suggested field must be in ALLOWED_FIELDS. Null values are explicit clears.
    // sql.query (raw text + values) is used here — matches the existing PATCH path so
    // TEXT[] (former_names) parameter binding goes through the same well-trodden code path.
    if (action === 'apply-parent-type-classifications') {
      try {
        const { classifications, applied_by } = req.body
        if (!Array.isArray(classifications) || classifications.length === 0) {
          return res.status(400).json({ error: 'classifications must be a non-empty array' })
        }

        const ALLOWED_FIELDS = new Set([
          'parent_relationship_kind', 'financial_sponsor', 'former_names',
          'parent_company', 'also_known_as',
        ])

        let applied = 0
        const errors = []

        for (const c of classifications) {
          if (!c.id || !c.suggested || typeof c.suggested !== 'object') {
            errors.push({ id: c.id ?? null, error: 'malformed classification entry' })
            continue
          }

          const setClauses = []
          const values = []
          for (const [field, value] of Object.entries(c.suggested)) {
            if (!ALLOWED_FIELDS.has(field)) continue
            values.push(value)  // null is allowed (explicit clear)
            setClauses.push(`${field} = $${values.length}`)
          }

          if (applied_by) {
            values.push(applied_by)
            setClauses.push(`last_edited_by = $${values.length}`)
          }

          if (setClauses.length === 0) {
            errors.push({ id: c.id, error: 'no allowed fields in suggested' })
            continue
          }

          values.push(c.id)
          const idParam = values.length

          const queryText = `
            UPDATE prospect_companies
            SET ${setClauses.join(', ')}, updated_at = NOW()
            WHERE id = $${idParam}
          `

          try {
            await sql.query(queryText, values)
            applied++
          } catch (err) {
            errors.push({ id: c.id, error: err.message })
          }
        }

        return res.status(200).json({ applied, errors, total: classifications.length })
      } catch (error) {
        console.error('Error applying classifications:', error)
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

    // Update an existing attachment (edit mode — no status auto-advancement)
    if (action === 'update-attachment') {
      try {
        const { attachment_id, content, updated_by } = req.body
        if (!attachment_id || !content) {
          return res.status(400).json({ error: 'attachment_id and content are required' })
        }

        const result = await sql`
          UPDATE prospect_attachments
          SET content = ${content.trim()},
              title = COALESCE(${req.body.title || null}, title)
          WHERE id = ${attachment_id}
          RETURNING *
        `

        if (!result || result.length === 0) {
          return res.status(404).json({ error: 'Attachment not found' })
        }

        // NOTE: Do NOT auto-advance prospect_status here — that only happens on initial attach

        return res.status(200).json(result[0])
      } catch (error) {
        console.error('Error updating attachment:', error)
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
          // Pre-read so the auto-advance lands in status history (E7)
          let statusBefore = null
          try {
            const [row] = await sql`SELECT prospect_status FROM prospect_companies WHERE id = ${prospect_id}`
            statusBefore = row?.prospect_status ?? null
          } catch { /* best effort */ }

          await sql`
            UPDATE prospect_companies
            SET prospect_status = 'Outreach Ready',
                last_edited_by = ${created_by || null},
                updated_at = NOW()
            WHERE id = ${prospect_id}
              AND prospect_status IN ('Identified', 'Prioritized', 'Research Complete')
          `

          if (['Identified', 'Prioritized', 'Research Complete'].includes(statusBefore)) {
            try {
              await logStatusChange(sql, prospect_id, statusBefore, 'Outreach Ready', created_by || null)
            } catch (err) {
              console.error('Status transition logging failed:', err)
            }
          }
        }

        return res.status(201).json(result[0])
      } catch (error) {
        console.error('Error creating attachment:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Contacts (QA audit E5): create ───
    if (action === 'contacts') {
      try {
        const { prospect_id, name, role, email, phone, notes, source, last_contacted, created_by } = req.body
        if (!prospect_id || !name?.trim()) {
          return res.status(400).json({ error: 'prospect_id and name are required' })
        }

        await ensureProspectSchemaAdditions(sql)
        const [contact] = await sql`
          INSERT INTO prospect_contacts (prospect_id, name, role, email, phone, notes, source, last_contacted, created_by)
          VALUES (${prospect_id}, ${name.trim()}, ${role || null}, ${email || null}, ${phone || null},
                  ${notes || null}, ${source || null}, ${last_contacted || null}, ${created_by || null})
          RETURNING *
        `

        // Activity log entry on add/delete only — edits don't log (same
        // anti-noise rule as tasks). Does NOT touch suggested_next_step.
        await sql`
          INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
          VALUES (${prospect_id}, ${'Contact added: ' + contact.name + (contact.role ? ` (${contact.role})` : '')}, ${created_by || 'Unknown'})
        `

        return res.status(201).json(contact)
      } catch (error) {
        console.error('Error creating contact:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Add activity log entry for a prospect
    if (action === 'add-activity') {
      try {
        const { prospect_id, entry_text, created_by } = req.body
        if (!prospect_id || !entry_text?.trim()) {
          return res.status(400).json({ error: 'prospect_id and entry_text are required' })
        }

        const [entry] = await sql`
          INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
          VALUES (${prospect_id}, ${entry_text.trim()}, ${created_by || 'Unknown'})
          RETURNING *
        `

        // Auto-sync: keep suggested_next_step on the prospect updated to latest entry
        await sql`
          UPDATE prospect_companies
          SET suggested_next_step = ${entry_text.trim()}, updated_at = NOW()
          WHERE id = ${prospect_id}
        `

        return res.status(201).json(entry)
      } catch (error) {
        console.error('Error adding activity:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Flag a prospect for review (atomic: sets flag + creates activity log entry)
    if (action === 'flag-for-review') {
      try {
        const { prospect_id, review_note, flagged_by } = req.body
        if (!prospect_id || !review_note?.trim()) {
          return res.status(400).json({ error: 'prospect_id and review_note are required' })
        }

        await sql`
          UPDATE prospect_companies
          SET needs_review = true,
              review_note = ${review_note.trim()},
              review_flagged_by = ${flagged_by || 'Unknown'},
              review_flagged_at = NOW(),
              updated_at = NOW()
          WHERE id = ${prospect_id}
        `

        await sql`
          INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
          VALUES (${prospect_id}, ${'\u2691 Flagged for review: ' + review_note.trim()}, ${flagged_by || 'Unknown'})
        `

        const [updated] = await sql`SELECT * FROM prospect_companies WHERE id = ${prospect_id}`
        return res.status(200).json(updated)
      } catch (error) {
        console.error('Error flagging prospect:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // Resolve a review flag
    if (action === 'resolve-review') {
      try {
        const { prospect_id, resolved_by } = req.body
        if (!prospect_id) {
          return res.status(400).json({ error: 'prospect_id is required' })
        }

        await sql`
          UPDATE prospect_companies
          SET needs_review = false,
              review_note = NULL,
              review_flagged_by = NULL,
              review_flagged_at = NULL,
              updated_at = NOW()
          WHERE id = ${prospect_id}
        `

        await sql`
          INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
          VALUES (${prospect_id}, ${'\u2713 Review resolved'}, ${resolved_by || 'Unknown'})
        `

        const [updated] = await sql`SELECT * FROM prospect_companies WHERE id = ${prospect_id}`
        return res.status(200).json(updated)
      } catch (error) {
        console.error('Error resolving review:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Tasks (Threads 2+3): create a new task ───
    // Emits an activity-log entry but does NOT touch suggested_next_step
    // (preserved exclusively for the existing add-activity flow).
    if (action === 'tasks') {
      try {
        const { prospect_id, description, due_date, assignee, created_by } = req.body
        if (!prospect_id || !description?.trim() || !created_by?.trim()) {
          return res.status(400).json({ error: 'prospect_id, description, and created_by are required' })
        }

        const [task] = await sql`
          INSERT INTO prospect_tasks (prospect_id, description, due_date, assignee, status, created_by)
          VALUES (${prospect_id}, ${description.trim()}, ${due_date || null}, ${assignee || null}, 'open', ${created_by})
          RETURNING *
        `

        await sql`
          INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
          VALUES (${prospect_id}, ${'Task created: ' + description.trim()}, ${created_by})
        `

        return res.status(201).json(task)
      } catch (error) {
        console.error('Error creating task:', error)
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

        // 1. Merge duplicate company names within the payload (later rows'
        //    non-null values win — same net result as the old INSERT-then-
        //    COALESCE-UPDATE sequence, required now that existence is checked
        //    once up front instead of per row).
        const mergedRows = new Map() // normalized name → { row, count }
        for (const p of prospects) {
          if (!p.company?.trim()) {
            skipped++
            continue
          }
          const norm = p.company.trim().toLowerCase()
          const entry = mergedRows.get(norm)
          if (entry) {
            entry.count++
            for (const [k, v] of Object.entries(p)) {
              if (v !== null && v !== undefined && v !== '') entry.row[k] = v
            }
          } else {
            mergedRows.set(norm, { row: { ...p }, count: 1 })
          }
        }

        // 2. Single round-trip existence check. The old per-row SELECT was
        //    half of the 360+ sequential queries that pushed large imports
        //    toward Vercel's 10s timeout.
        const existingRows = await sql`SELECT id, LOWER(TRIM(company)) AS norm FROM prospect_companies`
        const existingByNorm = new Map(existingRows.map(r => [r.norm, r.id]))

        // 3. Build all UPDATE/INSERT statements unawaited (neon queries are
        //    lazy) and execute them as chunked HTTP batch transactions — one
        //    round-trip per chunk instead of one per row.
        const statements = []
        for (const { row: p, count } of mergedRows.values()) {
          const company = p.company.trim()
          const existingId = existingByNorm.get(company.toLowerCase())

          if (existingId) {
            // Update research columns only — PRESERVE user-edited fields
            statements.push(sql`
              UPDATE prospect_companies SET
                also_known_as = COALESCE(${p.also_known_as || null}, also_known_as),
                website = COALESCE(${p.website || null}, website),
                category = COALESCE(${p.category || null}, category),
                in_house_tooling = COALESCE(${p.in_house_tooling || null}, in_house_tooling),
                city = COALESCE(${p.city || null}, city),
                state = COALESCE(${p.state || null}, state),
                country = COALESCE(${p.country || null}, country),
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
                parent_relationship_kind = COALESCE(${p.parent_relationship_kind || null}, parent_relationship_kind),
                financial_sponsor = COALESCE(${p.financial_sponsor || null}, financial_sponsor),
                former_names = COALESCE(${(Array.isArray(p.former_names) && p.former_names.length > 0) ? p.former_names : null}, former_names),
                decision_location = COALESCE(${p.decision_location || null}, decision_location),
                cwp_contacts = COALESCE(${p.cwp_contacts || null}, cwp_contacts),
                psb_connection_notes = COALESCE(${p.psb_connection_notes || null}, psb_connection_notes),
                engagement_type = COALESCE(${p.engagement_type || null}, engagement_type),
                suggested_next_step = COALESCE(${p.suggested_next_step || null}, suggested_next_step),
                legacy_data_potential = COALESCE(${p.legacy_data_potential || null}, legacy_data_potential),
                notes = COALESCE(${p.notes || null}, notes),
                updated_at = NOW()
              WHERE id = ${existingId}
            `)
          } else {
            statements.push(sql`
              INSERT INTO prospect_companies (
                company, also_known_as, website, category, in_house_tooling,
                city, state, country, geography_tier, source_report, priority,
                employees_approx, year_founded, years_in_business, revenue_known, revenue_est_m,
                press_count, signal_count, top_signal, rjg_cavity_pressure, medical_device_mfg,
                key_certifications, ownership_type, recent_ma, parent_company, decision_location,
                cwp_contacts, psb_connection_notes,
                engagement_type, suggested_next_step, legacy_data_potential, notes,
                outreach_group, outreach_rank, added_by,
                parent_relationship_kind, financial_sponsor, former_names
              ) VALUES (
                ${company}, ${p.also_known_as || null}, ${p.website || null}, ${p.category || null}, ${p.in_house_tooling || null},
                ${p.city || null}, ${p.state || null}, ${p.country || 'US'}, ${p.geography_tier || null}, ${p.source_report || null}, ${p.priority || null},
                ${p.employees_approx || null}, ${p.year_founded || null}, ${p.years_in_business || null}, ${p.revenue_known || null}, ${p.revenue_est_m || null},
                ${p.press_count || null}, ${p.signal_count || null}, ${p.top_signal || null}, ${p.rjg_cavity_pressure || null}, ${p.medical_device_mfg || null},
                ${p.key_certifications || null}, ${p.ownership_type || null}, ${p.recent_ma || null}, ${p.parent_company || null}, ${p.decision_location || null},
                ${p.cwp_contacts || null}, ${p.psb_connection_notes || null},
                ${p.engagement_type || null}, ${p.suggested_next_step || null}, ${p.legacy_data_potential || null}, ${p.notes || null},
                'Unassigned', ${null}, ${req.body.added_by || null},
                ${p.parent_relationship_kind || null}, ${p.financial_sponsor || null}, ${(Array.isArray(p.former_names) && p.former_names.length > 0) ? p.former_names : null}
              )
            `)
          }

          upserted += count
        }

        // 4. Execute in chunks. sql.transaction() pipelines a chunk over one
        //    HTTP request (and makes it atomic); fall back to sequential
        //    execution only if the driver doesn't expose it.
        const BATCH_SIZE = 50
        for (let i = 0; i < statements.length; i += BATCH_SIZE) {
          const chunk = statements.slice(i, i + BATCH_SIZE)
          if (typeof sql.transaction === 'function') {
            await sql.transaction(chunk)
          } else {
            for (const stmt of chunk) await stmt
          }
        }

        // Rebuild ontology to reflect imported data (set-based — a handful of
        // bulk statements, see rebuildOntologyLayer1)
        let ontologyResult = null
        try {
          ontologyResult = await rebuildOntologyLayer1(sql)
        } catch (err) {
          console.error('Post-import ontology rebuild failed:', err)
          // Non-fatal — import succeeded, ontology just needs manual rebuild
        }

        // Recalculate priority scores so imported research data scores
        // immediately (previously stale until each row was PATCHed or a
        // manual recalculate-all run)
        let priorityResult = null
        try {
          priorityResult = await recalculateAllPriorities(sql)
        } catch (err) {
          console.error('Post-import priority recalc failed:', err)
          // Non-fatal — run POST ?action=recalculate-all-priorities manually
        }

        return res.status(200).json({
          message: `Import complete: ${upserted} upserted, ${skipped} skipped`,
          upserted,
          skipped,
          ontology: ontologyResult || { error: 'Rebuild failed — run manual rebuild' },
          priorities: priorityResult || { error: 'Recalc failed — run recalculate-all-priorities' },
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
          city, state, country, geography_tier, source_report, priority,
          employees_approx, year_founded, years_in_business, revenue_known, revenue_est_m,
          press_count, signal_count, top_signal, rjg_cavity_pressure, medical_device_mfg,
          key_certifications, ownership_type, recent_ma, parent_company, decision_location,
          cwp_contacts, psb_connection_notes,
          engagement_type, suggested_next_step, legacy_data_potential, notes,
          outreach_group, outreach_rank, group_notes, last_edited_by, added_by
        ) VALUES (
          ${company.trim()}, ${b.also_known_as || null}, ${b.website || null}, ${b.category || null}, ${b.in_house_tooling || null},
          ${b.city || null}, ${b.state || null}, ${b.country || 'US'}, ${b.geography_tier || null}, ${b.source_report || null}, ${b.priority || null},
          ${b.employees_approx || null}, ${b.year_founded || null}, ${b.years_in_business || null}, ${b.revenue_known || null}, ${b.revenue_est_m || null},
          ${b.press_count || null}, ${b.signal_count || null}, ${b.top_signal || null}, ${b.rjg_cavity_pressure || null}, ${b.medical_device_mfg || null},
          ${b.key_certifications || null}, ${b.ownership_type || null}, ${b.recent_ma || null}, ${b.parent_company || null}, ${b.decision_location || null},
          ${b.cwp_contacts || null}, ${b.psb_connection_notes || null},
          ${b.engagement_type || null}, ${b.suggested_next_step || null}, ${b.legacy_data_potential || null}, ${b.notes || null},
          ${b.outreach_group || 'Unassigned'}, ${b.outreach_rank || null}, ${b.group_notes || null}, ${b.last_edited_by || null}, ${b.added_by || null}
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
    // ─── Tasks (Threads 2+3): update task fields, with status-transition activity logging ───
    if (action === 'tasks') {
      try {
        const { task_id } = req.query
        if (!task_id) {
          return res.status(400).json({ error: 'task_id query param is required for PATCH ?action=tasks' })
        }

        const { description, due_date, assignee, status, updated_by } = req.body
        if (!updated_by?.trim()) {
          return res.status(400).json({ error: 'updated_by is required' })
        }

        if (status !== undefined && !['open', 'done', 'dismissed'].includes(status)) {
          return res.status(400).json({ error: "status must be 'open', 'done', or 'dismissed'" })
        }

        const [current] = await sql`SELECT * FROM prospect_tasks WHERE id = ${task_id}`
        if (!current) return res.status(404).json({ error: 'Task not found' })

        const setClauses = []
        const params = []
        if (description !== undefined) { params.push(description.trim()); setClauses.push(`description = $${params.length}`) }
        if (due_date !== undefined) { params.push(due_date || null); setClauses.push(`due_date = $${params.length}`) }
        if (assignee !== undefined) { params.push(assignee || null); setClauses.push(`assignee = $${params.length}`) }

        // Status transition handling: completed_at/completed_by are managed implicitly.
        // Only logs to activity feed on actual status change — editing description on an
        // already-open task does not generate noise.
        let transition = null
        if (status !== undefined && status !== current.status) {
          params.push(status); setClauses.push(`status = $${params.length}`)
          if (status === 'done' || status === 'dismissed') {
            params.push(updated_by); setClauses.push(`completed_by = $${params.length}`)
            setClauses.push(`completed_at = NOW()`)
            transition = status === 'done' ? 'completed' : 'dismissed'
          } else if (status === 'open') {
            setClauses.push(`completed_by = NULL`)
            setClauses.push(`completed_at = NULL`)
            transition = 'reopened'
          }
        }

        if (setClauses.length === 0) {
          return res.status(400).json({ error: 'No fields to update' })
        }

        params.push(task_id)
        const idParam = params.length
        const queryText = `UPDATE prospect_tasks SET ${setClauses.join(', ')} WHERE id = $${idParam} RETURNING *`
        const updatedRows = await sql.query(queryText, params)
        const updated = updatedRows[0]

        if (transition) {
          const symbol = transition === 'completed' ? '✓' : transition === 'dismissed' ? '✗' : '↺'
          const entryText = `${symbol} Task ${transition}: ${updated.description}`
          await sql`
            INSERT INTO prospect_activity_log (prospect_id, entry_text, created_by)
            VALUES (${updated.prospect_id}, ${entryText}, ${updated_by})
          `
        }

        return res.status(200).json(updated)
      } catch (error) {
        console.error('Error updating task:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    // ─── Contacts (QA audit E5): update fields ───
    if (action === 'contacts') {
      try {
        const { contact_id } = req.query
        if (!contact_id) {
          return res.status(400).json({ error: 'contact_id query param is required for PATCH ?action=contacts' })
        }
        const { name, role, email, phone, notes, source, last_contacted } = req.body
        if (name !== undefined && !String(name).trim()) {
          return res.status(400).json({ error: 'name cannot be empty' })
        }

        await ensureProspectSchemaAdditions(sql)
        const setClauses = []
        const params = []
        if (name !== undefined) { params.push(String(name).trim()); setClauses.push(`name = $${params.length}`) }
        if (role !== undefined) { params.push(role || null); setClauses.push(`role = $${params.length}`) }
        if (email !== undefined) { params.push(email || null); setClauses.push(`email = $${params.length}`) }
        if (phone !== undefined) { params.push(phone || null); setClauses.push(`phone = $${params.length}`) }
        if (notes !== undefined) { params.push(notes || null); setClauses.push(`notes = $${params.length}`) }
        if (source !== undefined) { params.push(source || null); setClauses.push(`source = $${params.length}`) }
        if (last_contacted !== undefined) { params.push(last_contacted || null); setClauses.push(`last_contacted = $${params.length}`) }

        if (setClauses.length === 0) {
          return res.status(400).json({ error: 'No fields to update' })
        }

        params.push(contact_id)
        const updated = await sql.query(
          `UPDATE prospect_contacts SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
          params
        )
        if (!updated || updated.length === 0) {
          return res.status(404).json({ error: 'Contact not found' })
        }
        return res.status(200).json(updated[0])
      } catch (error) {
        console.error('Error updating contact:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    if (!id) {
      return res.status(400).json({ error: 'id query param is required for PATCH' })
    }

    const body = req.body
    const allowedFields = [
      'company', 'also_known_as', 'website', 'category', 'in_house_tooling',
      'city', 'state', 'country', 'geography_tier', 'source_report', 'priority',
      'employees_approx', 'year_founded', 'years_in_business', 'revenue_known', 'revenue_est_m',
      'press_count', 'signal_count', 'top_signal', 'rjg_cavity_pressure', 'medical_device_mfg',
      'key_certifications', 'ownership_type', 'recent_ma', 'cwp_contacts', 'psb_connection_notes',
      'engagement_type', 'suggested_next_step', 'legacy_data_potential', 'notes',
      'outreach_group', 'outreach_rank', 'group_notes', 'last_edited_by', 'prospect_status',
      'parent_company', 'decision_location', 'follow_up_date', 'ma_date',
      'site_count', 'acquisition_count',
      'priority_manual',
      'needs_review', 'review_note', 'review_flagged_by', 'review_flagged_at',
      // Thread 1 (typed parent/FKA model)
      'parent_relationship_kind', 'financial_sponsor', 'former_names',
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
      // E4: the ma_date column self-ensures; E7: capture the old status so the
      // transition can be logged after the write succeeds
      let statusBefore = null
      if (body.prospect_status !== undefined || body.ma_date !== undefined) {
        await ensureProspectSchemaAdditions(sql)
        if (body.prospect_status !== undefined) {
          const [row] = await sql`SELECT prospect_status FROM prospect_companies WHERE id = ${id}`
          statusBefore = row?.prospect_status ?? null
        }
      }

      const result = await sql.query(queryText, values)

      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'Prospect not found' })
      }

      // E7: append-only status history (best-effort — never fails the PATCH)
      if (body.prospect_status !== undefined) {
        try {
          await logStatusChange(sql, id, statusBefore, body.prospect_status, body.last_edited_by || null)
        } catch (err) {
          console.error('Status transition logging failed:', err)
        }
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

      // ─── Priority score recalculation ───
      const patchedFields = Object.keys(body)
      const touchesScoreInputs = SCORE_INPUT_FIELDS.some(f => patchedFields.includes(f))
      const manualPriorityEdit = patchedFields.includes('priority')

      if (manualPriorityEdit) {
        // Store the manual override
        await sql`UPDATE prospect_companies SET priority_manual = ${body.priority} WHERE id = ${id}`
      }

      if (touchesScoreInputs || manualPriorityEdit) {
        // Re-fetch the full record (may have been updated by ontology rebuild)
        const [current] = await sql`SELECT * FROM prospect_companies WHERE id = ${id}`
        if (current && !isPriorityExempt(current)) {
          const scoreResult = calculatePriorityScore(current)
          const readinessResult = calculateAiReadiness(current)
          const newScore = scoreResult?.score ?? null
          const newReadiness = readinessResult?.readiness ?? null
          const newTier = getTierFromScore(newScore)

          if (current.priority_manual) {
            await sql`UPDATE prospect_companies SET priority_score = ${newScore}, ai_readiness = ${newReadiness} WHERE id = ${id}`
          } else {
            await sql`UPDATE prospect_companies SET priority_score = ${newScore}, ai_readiness = ${newReadiness}, priority = ${newTier} WHERE id = ${id}`
          }
        } else if (current && isPriorityExempt(current)) {
          await sql`UPDATE prospect_companies SET priority_score = NULL, ai_readiness = 'exempt' WHERE id = ${id}`
        }
        // Re-fetch to return accurate data
        const [fresh] = await sql`SELECT * FROM prospect_companies WHERE id = ${id}`
        return res.status(200).json(fresh)
      }

      return res.status(200).json(result[0])
    } catch (error) {
      console.error('Error updating prospect:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
