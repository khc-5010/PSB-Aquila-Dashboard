import { parseLocalDate } from '../components/prospects/tasks/taskUtils'

// PE acquisition window from ma_date (QA audit E4). The 6-18 months
// post-acquisition stretch is the alliance's core PE thesis.
// SYNC: identical copy in api/prospects.js (getPEWindowInfo) — keep aligned.
export function getPEWindowInfo(maDate) {
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

// Tailwind tone classes per phase (shared by detail panel + call sheet tags)
export const PE_WINDOW_TONES = {
  upcoming: 'bg-blue-100 text-blue-700',
  early: 'bg-blue-100 text-blue-700',
  optimal: 'bg-red-100 text-red-700',
  closing: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-100 text-gray-500',
}
