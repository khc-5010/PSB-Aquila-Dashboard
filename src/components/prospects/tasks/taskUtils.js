// Threads 2+3: shared helpers for the prospect_tasks UI surface.
//
// Two SYNC contracts in this file:
//   1. parseLocalDate — duplicated in ProspectTable.jsx and api/prospects.js
//   2. isMyTaskInBadge — duplicated server-side in api/prospects.js (?action=tasks)

// SYNC: parseLocalDate also in src/components/prospects/ProspectTable.jsx and api/prospects.js
export function parseLocalDate(val) {
  if (!val) return null
  const str = typeof val === 'string' ? val : val instanceof Date ? val.toISOString() : String(val)
  const [y, m, d] = str.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// SYNC: badge logic — also in api/prospects.js GET ?action=tasks handler
// Open tasks where assignee = currentUser OR assignee IS NULL contribute to the "My Tasks" badge.
export function isMyTaskInBadge(task, currentUserName) {
  if (!task) return false
  if (task.status !== 'open') return false
  if (!task.assignee) return true
  return task.assignee === currentUserName
}

// Mirrors the Tier-1 logic in getProspectUrgency(). Open tasks only;
// completed/dismissed always return null.
export function getTaskUrgency(task) {
  if (!task || task.status !== 'open') return null
  if (!task.due_date) return null

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDate = parseLocalDate(task.due_date)
  if (!dueDate || isNaN(dueDate)) return null

  const diffDays = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { level: 'overdue', label: `${Math.abs(diffDays)}d overdue`, color: 'red', priority: 1 }
  if (diffDays === 0) return { level: 'due_today', label: 'Due today', color: 'amber', priority: 2 }
  if (diffDays <= 3) return { level: 'due_soon', label: `Due in ${diffDays}d`, color: 'yellow', priority: 3 }
  if (diffDays <= 7) return { level: 'due_week', label: `Due in ${diffDays}d`, color: 'blue', priority: 4 }
  return { level: 'scheduled', label: dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'gray', priority: 10 }
}

const URGENCY_COLOR_CLASSES = {
  red: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  yellow: { dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  blue: { dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  gray: { dot: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
}

export function getUrgencyClasses(level) {
  if (!level) return URGENCY_COLOR_CLASSES.gray
  return URGENCY_COLOR_CLASSES[level.color] || URGENCY_COLOR_CLASSES.gray
}

// Quick-set buttons for due-date pickers (mirrors the existing follow_up_date UX in ProspectDetail).
export const DUE_DATE_PRESETS = [
  { label: 'Tomorrow', days: 1 },
  { label: '+3 days', days: 3 },
  { label: '+1 week', days: 7 },
  { label: '+2 weeks', days: 14 },
  { label: '+1 month', days: 30 },
]

// Build a local YYYY-MM-DD string `days` days from today (avoids UTC drift).
export function getDateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Compute earliest open-task due date for a list of tasks (used by Tasks column in ProspectTable).
// Returns { count, earliestUrgency } — earliestUrgency is null if no dated tasks.
export function summarizeOpenTasks(tasks) {
  const open = tasks.filter(t => t.status === 'open')
  if (open.length === 0) return { count: 0, earliestUrgency: null }
  const dated = open.filter(t => t.due_date).map(t => ({ t, d: parseLocalDate(t.due_date) })).filter(x => x.d)
  if (dated.length === 0) return { count: open.length, earliestUrgency: null }
  dated.sort((a, b) => a.d - b.d)
  return { count: open.length, earliestUrgency: getTaskUrgency(dated[0].t) }
}

// Hard-coded fallback team list. Used if /api/auth?action=team-members fails or hasn't loaded yet.
// Keep in sync with the active users in production (4 users today).
export const TEAM_MEMBERS_FALLBACK = [
  { name: 'Kyle', color: '#7C3AED' },
  { name: 'Duane', color: '#2563EB' },
  { name: 'Steve', color: '#16A34A' },
  { name: 'Brett', color: '#D97706' },
]
