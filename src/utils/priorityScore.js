// SYNC: This logic is duplicated in api/prospects.js — keep both in sync
// When modifying scoring logic, update BOTH files and search for SYNC markers

const EXEMPT_CATEGORIES = ['Knowledge Sector', 'Hot Runner Systems', 'Catalog/Standards', 'Strategic Partner']

const SCORE_INPUT_FIELDS = [
  'press_count', 'employees_approx', 'signal_count', 'cwp_contacts',
  'psb_connection_notes', 'rjg_cavity_pressure', 'in_house_tooling',
  'medical_device_mfg', 'key_certifications', 'ownership_type',
  'recent_ma', 'years_in_business', 'category', 'outreach_group'
]

function isExempt(prospect) {
  if (prospect.outreach_group === 'Infrastructure') return true
  if (EXEMPT_CATEGORIES.includes(prospect.category)) return true
  return false
}

function calculatePriorityScore(p) {
  if (isExempt(p)) return null

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
  if (ownership.includes('private equity') && (recentMa.includes('acqui') || recentMa.includes('merge'))) {
    breakdown.urgency = 15
  } else if (ownership.includes('private equity')) {
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
  if (isExempt(p)) return { readiness: 'exempt', criteria: 0, met: [] }

  let criteria = 0
  const met = []
  const rjg = (p.rjg_cavity_pressure || '').toLowerCase()
  if (rjg.includes('yes') || rjg.includes('confirmed') || rjg.includes('likely')) { criteria++; met.push('RJG') }
  if (p.in_house_tooling === 'Yes') { criteria++; met.push('Tooling') }
  const certs = (p.key_certifications || '').toLowerCase()
  if (certs.includes('iso') || certs.includes('iatf') || certs.includes('as9100')) { criteria++; met.push('ISO') }
  if ((p.press_count ?? 0) >= 20) { criteria++; met.push(`${p.press_count}+ presses`) }
  const isMedical = (p.medical_device_mfg || '').startsWith('Yes')
  const isAutomotive = certs.includes('iatf') || certs.includes('16949')
  if (isMedical || isAutomotive) { criteria++; met.push(isMedical ? 'Medical' : 'Automotive') }

  const readiness = criteria >= 3 ? 'green' : criteria >= 1 ? 'yellow' : 'red'
  return { readiness, criteria, met }
}

export { calculatePriorityScore, getTierFromScore, calculateAiReadiness, isExempt, SCORE_INPUT_FIELDS, EXEMPT_CATEGORIES }
