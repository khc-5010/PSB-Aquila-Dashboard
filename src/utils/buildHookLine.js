import { isPEOwnership } from './priorityScore'

// "Why this company" one-liner. Moved verbatim from ProspectDetail.jsx so the
// Call Sheet can share it. Priority order: RJG confirmed → converter+tooling →
// press count (or 500+ employees) → site count (≥10) → acquisition count (≥5)
// → 30+ year legacy → PE/M&A → medical device → CWP warmth → top_signal
// fallback. Max 4 hooks, middle-dot separated.
export function buildHookLine(p) {
  const hooks = []

  if (p.rjg_cavity_pressure?.includes('Yes') || p.rjg_cavity_pressure?.includes('confirmed')) {
    hooks.push('RJG cavity pressure user')
  }

  if (p.in_house_tooling === 'Yes' && p.category?.includes('Converter')) {
    hooks.push('vertically integrated (converter + tooling)')
  }

  if (p.press_count) hooks.push(`${p.press_count}-press operation`)
  else if ((p.employees_approx ?? 0) >= 500) hooks.push(`${p.employees_approx}+ employees`)

  if ((p.site_count ?? 0) >= 10) hooks.push(`${p.site_count} sites`)
  if ((p.acquisition_count ?? 0) >= 5) hooks.push(`${p.acquisition_count} acquisitions`)

  if ((p.years_in_business ?? 0) >= 30) hooks.push(`${p.years_in_business}-year legacy`)

  if (isPEOwnership(p.ownership_type) && p.recent_ma) {
    hooks.push('PE-backed, recent M&A')
  } else if (isPEOwnership(p.ownership_type)) {
    hooks.push('PE-backed')
  }

  if (p.medical_device_mfg?.startsWith('Yes')) hooks.push('medical device mfg')

  if ((p.cwp_contacts ?? 0) >= 20) hooks.push('deep PSB relationship')
  else if ((p.cwp_contacts ?? 0) >= 5) hooks.push('warm PSB lead')

  if (hooks.length < 2 && p.top_signal) hooks.push(p.top_signal)

  return hooks.slice(0, 4).join(' · ')
}
