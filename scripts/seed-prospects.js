/**
 * Seed script for prospect_companies table.
 *
 * Usage:
 *   node scripts/seed-prospects.js
 *
 * If public/PSB_Aquila_Alliance_Consolidated_Pipeline.xlsx exists, imports from it.
 * Otherwise, seeds the known group-assigned companies from the spec.
 *
 * Requires DATABASE_URL environment variable.
 */

import { neon } from '@neondatabase/serverless'
import XLSX from 'xlsx'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

// Column mapping from Excel headers to DB columns
const EXCEL_TO_DB = {
  'Company': 'company',
  'Also Known As': 'also_known_as',
  'Website': 'website',
  'Category': 'category',
  'In-House Tooling': 'in_house_tooling',
  'City': 'city',
  'State': 'state',
  'Country': 'country',
  'Geography Tier': 'geography_tier',
  'Source Report': 'source_report',
  'Priority': 'priority',
  'Employees (Approx)': 'employees_approx',
  'Year Founded': 'year_founded',
  'Years in Business': 'years_in_business',
  'Revenue Known': 'revenue_known',
  'Revenue Est ($M)': 'revenue_est_m',
  'Press Count': 'press_count',
  'Signal Count': 'signal_count',
  'Top Signal': 'top_signal',
  'RJG Cavity Pressure': 'rjg_cavity_pressure',
  'Medical Device Mfg': 'medical_device_mfg',
  'Key Certifications': 'key_certifications',
  'Ownership Type': 'ownership_type',
  'Recent M&A': 'recent_ma',
  'CWP Contacts': 'cwp_contacts',
  'PSB Connection Notes': 'psb_connection_notes',
  'Engagement Type': 'engagement_type',
  'Suggested Next Step': 'suggested_next_step',
  'Legacy Data Potential': 'legacy_data_potential',
  'Notes': 'notes',
}

// Group pre-assignments from spec
const GROUP_ASSIGNMENTS = {
  'Group 1': [
    { company: 'Matrix Tool, Inc.', rank: 1 },
    { company: 'X-Cell Tool & Mold', rank: 2 },
    { company: 'C&J Industries, Inc.', rank: 3 },
    { company: 'Automation Plastics Corp', rank: 4 },
    { company: 'Erie Molded Plastics', rank: 5 },
  ],
  'Time-Sensitive': [
    { company: 'Currier Plastics' },
    { company: 'Allegheny Performance Plastics' },
  ],
  'Group 2': [
    { company: 'Venture Plastics' },
    { company: 'Ferriot Inc.' },
    { company: 'Accudyn Products' },
    { company: 'Caplugs/Protective Industries' },
    { company: 'TTMP/PRISM Plastics' },
    { company: 'Adler Industrial Solutions' },
    { company: 'Essentra Components' },
  ],
  'Infrastructure': [
    { company: 'RJG Inc.' },
    { company: 'DME Company' },
    { company: 'Husky Technologies' },
    { company: 'Mold-Masters' },
    { company: 'Beaumont Technologies' },
  ],
}

function cleanValue(val) {
  if (val === undefined || val === null) return null
  if (typeof val === 'number' && isNaN(val)) return null
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed === '' || trimmed.toLowerCase() === 'nan' || trimmed === '#N/A') return null
    return trimmed
  }
  return val
}

function cleanInt(val) {
  if (val === undefined || val === null) return null
  const num = typeof val === 'string' ? parseInt(val, 10) : Math.round(val)
  return isNaN(num) ? null : num
}

function cleanNumeric(val) {
  if (val === undefined || val === null) return null
  const num = typeof val === 'string' ? parseFloat(val.replace(/[$,]/g, '')) : val
  return isNaN(num) ? null : num
}

function fuzzyMatch(a, b) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  return normalize(a) === normalize(b) || normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a))
}

function getGroupAssignment(companyName) {
  for (const [group, companies] of Object.entries(GROUP_ASSIGNMENTS)) {
    for (const entry of companies) {
      if (fuzzyMatch(companyName, entry.company)) {
        return { outreach_group: group, outreach_rank: entry.rank || null }
      }
    }
  }
  return { outreach_group: 'Unassigned', outreach_rank: null }
}

async function insertProspect(row) {
  const { outreach_group, outreach_rank } = getGroupAssignment(row.company || '')

  await sql`
    INSERT INTO prospect_companies (
      company, also_known_as, website, category, in_house_tooling,
      city, state, country, geography_tier, source_report, priority,
      employees_approx, year_founded, years_in_business, revenue_known, revenue_est_m,
      press_count, signal_count, top_signal, rjg_cavity_pressure, medical_device_mfg,
      key_certifications, ownership_type, recent_ma, cwp_contacts, psb_connection_notes,
      engagement_type, suggested_next_step, legacy_data_potential, notes,
      outreach_group, outreach_rank
    ) VALUES (
      ${row.company}, ${row.also_known_as}, ${row.website}, ${row.category}, ${row.in_house_tooling},
      ${row.city}, ${row.state}, ${row.country || 'US'}, ${row.geography_tier}, ${row.source_report}, ${row.priority},
      ${row.employees_approx}, ${row.year_founded}, ${row.years_in_business}, ${row.revenue_known}, ${row.revenue_est_m},
      ${row.press_count}, ${row.signal_count}, ${row.top_signal}, ${row.rjg_cavity_pressure}, ${row.medical_device_mfg},
      ${row.key_certifications}, ${row.ownership_type}, ${row.recent_ma}, ${row.cwp_contacts}, ${row.psb_connection_notes},
      ${row.engagement_type}, ${row.suggested_next_step}, ${row.legacy_data_potential}, ${row.notes},
      ${outreach_group}, ${outreach_rank}
    )
  `
}

async function seedFromExcel(filePath) {
  console.log(`Reading Excel file: ${filePath}`)
  const workbook = XLSX.readFile(filePath)

  // Try "Pipeline" sheet first, fall back to first sheet
  const sheetName = workbook.SheetNames.includes('Pipeline') ? 'Pipeline' : workbook.SheetNames[0]
  console.log(`Using sheet: ${sheetName}`)

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet)
  console.log(`Found ${rows.length} rows`)

  let inserted = 0
  for (const excelRow of rows) {
    const dbRow = {}
    for (const [excelCol, dbCol] of Object.entries(EXCEL_TO_DB)) {
      // Try exact match first, then case-insensitive
      let val = excelRow[excelCol]
      if (val === undefined) {
        const key = Object.keys(excelRow).find(k => k.toLowerCase().trim() === excelCol.toLowerCase())
        val = key ? excelRow[key] : undefined
      }

      if (['employees_approx', 'year_founded', 'years_in_business', 'press_count', 'signal_count', 'cwp_contacts'].includes(dbCol)) {
        dbRow[dbCol] = cleanInt(val)
      } else if (dbCol === 'revenue_est_m') {
        dbRow[dbCol] = cleanNumeric(val)
      } else {
        dbRow[dbCol] = cleanValue(val)
      }
    }

    if (!dbRow.company) continue

    await insertProspect(dbRow)
    inserted++
  }

  console.log(`Inserted ${inserted} prospects from Excel`)
}

async function seedKnownCompanies() {
  console.log('Excel file not found. Seeding known group-assigned companies...')

  const knownCompanies = [
    // Group 1
    { company: 'Matrix Tool, Inc.', city: 'Fairview', state: 'PA', category: 'Converter+Tooling', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY' },
    { company: 'X-Cell Tool & Mold', city: 'Fairview', state: 'PA', category: 'Mold Maker', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY' },
    { company: 'C&J Industries, Inc.', city: 'Meadville', state: 'PA', category: 'Converter+Tooling', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY' },
    { company: 'Automation Plastics Corp', city: 'Aurora', state: 'OH', category: 'Converter', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY' },
    { company: 'Erie Molded Plastics', city: 'Erie', state: 'PA', category: 'Converter', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY' },
    // Time-Sensitive
    { company: 'Currier Plastics', city: 'Auburn', state: 'NY', category: 'Converter', geography_tier: 'Tier 2', priority: 'HIGH PRIORITY', notes: 'PE acquisition Sept 2025 — inside optimal window NOW' },
    { company: 'Allegheny Performance Plastics', city: 'Meadville', state: 'PA', category: 'Converter', geography_tier: 'Tier 1', priority: 'HIGH PRIORITY', notes: 'PE acquisition Oct 2025' },
    // Group 2
    { company: 'Venture Plastics', category: 'Converter', priority: 'QUALIFIED' },
    { company: 'Ferriot Inc.', category: 'Converter+Tooling', priority: 'QUALIFIED' },
    { company: 'Accudyn Products', category: 'Converter', priority: 'QUALIFIED' },
    { company: 'Caplugs/Protective Industries', category: 'Converter', priority: 'QUALIFIED' },
    { company: 'TTMP/PRISM Plastics', category: 'Converter', priority: 'QUALIFIED' },
    { company: 'Adler Industrial Solutions', category: 'Converter', priority: 'QUALIFIED' },
    { company: 'Essentra Components', category: 'Converter', priority: 'QUALIFIED' },
    // Infrastructure
    { company: 'RJG Inc.', category: 'Knowledge Sector', priority: 'STRATEGIC PARTNER' },
    { company: 'DME Company', category: 'Hot Runner Systems', priority: 'STRATEGIC PARTNER' },
    { company: 'Husky Technologies', category: 'Hot Runner Systems', priority: 'STRATEGIC PARTNER' },
    { company: 'Mold-Masters', category: 'Hot Runner Systems', priority: 'STRATEGIC PARTNER' },
    { company: 'Beaumont Technologies', category: 'Knowledge Sector', priority: 'STRATEGIC PARTNER' },
  ]

  let inserted = 0
  for (const company of knownCompanies) {
    const row = {
      company: company.company,
      also_known_as: null, website: null,
      category: company.category || null,
      in_house_tooling: null,
      city: company.city || null,
      state: company.state || null,
      geography_tier: company.geography_tier || null,
      source_report: null,
      priority: company.priority || null,
      employees_approx: null, year_founded: null, years_in_business: null,
      revenue_known: null, revenue_est_m: null, press_count: null,
      signal_count: null, top_signal: null,
      rjg_cavity_pressure: null, medical_device_mfg: null, key_certifications: null,
      ownership_type: null, recent_ma: null, cwp_contacts: null,
      psb_connection_notes: null, engagement_type: null,
      suggested_next_step: null, legacy_data_potential: null,
      notes: company.notes || null,
    }
    await insertProspect(row)
    inserted++
  }

  console.log(`Inserted ${inserted} known companies with group assignments`)
}

async function main() {
  try {
    // Check for Excel file
    const excelPath = resolve('public/PSB_Aquila_Alliance_Consolidated_Pipeline.xlsx')

    if (existsSync(excelPath)) {
      await seedFromExcel(excelPath)
    } else {
      await seedKnownCompanies()
    }

    console.log('Seed complete!')
  } catch (error) {
    console.error('Seed failed:', error)
    process.exit(1)
  }
}

main()
