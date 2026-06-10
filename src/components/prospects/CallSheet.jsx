import { useState } from 'react'
import { Phone, ChevronDown } from 'lucide-react'
import { isPEOwnership } from '../../utils/priorityScore'
import { buildHookLine } from '../../utils/buildHookLine'
import StatusBadge from './StatusBadge'

/**
 * Call Sheet (QA audit E3) — a ranked "next calls" queue so the dashboard is
 * where outreach starts each morning, not a reference checked afterward.
 *
 * Ranking: callScore = priority_score + urgency boost + PE-window boost.
 *   - Urgency from the earliest open task due date (overdue +25, today +20,
 *     ≤3d +12), falling back to legacy follow_up_date / staleness via
 *     getProspectUrgency (passed in from ProspectTable to avoid a circular
 *     import — it's the documented SYNC copy there).
 *   - PE window +10 when PE-backed with recent M&A (modest on purpose: the
 *     priority score already awards up to 15 for it).
 *   - Excluded: Converted / Nurture / Identified (not callable) and
 *     unscored/exempt rows.
 *
 * Respects the active filter state (same contract as the Charts sub-view) —
 * no filters means the global top of the list.
 */

const PARKED_STATUSES = ['Converted', 'Nurture', 'Identified']
const INITIAL_COUNT = 5
const SHOW_MORE_STEP = 10

function taskUrgencyBoost(earliestDueDate) {
  if (!earliestDueDate) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((earliestDueDate - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { boost: 25, label: `task ${Math.abs(diffDays)}d overdue` }
  if (diffDays === 0) return { boost: 20, label: 'task due today' }
  if (diffDays <= 3) return { boost: 12, label: `task due in ${diffDays}d` }
  return null
}

function fallbackUrgencyBoost(urgency) {
  if (!urgency) return null
  if (urgency.level === 'overdue') return { boost: 25, label: `follow-up ${urgency.label}` }
  if (urgency.level === 'due_today') return { boost: 20, label: 'follow-up due today' }
  if (urgency.level === 'due_soon') return { boost: 12, label: `follow-up ${urgency.label.toLowerCase()}` }
  if (urgency.level === 'stale' || urgency.level === 'stalled') return { boost: 8, label: urgency.label.toLowerCase() }
  return null
}

function buildCallEntry(p, taskInfo, getUrgency) {
  if (PARKED_STATUSES.includes(p.prospect_status)) return null
  if (p.priority_score == null) return null

  const reasons = [{ text: `score ${p.priority_score}`, tone: 'navy' }]
  let score = p.priority_score

  const urgencyBoost = taskUrgencyBoost(taskInfo?.earliestDueDate) || fallbackUrgencyBoost(getUrgency(p))
  if (urgencyBoost) {
    score += urgencyBoost.boost
    reasons.push({ text: urgencyBoost.label, tone: 'red' })
  }

  if (isPEOwnership(p.ownership_type) && p.recent_ma) {
    score += 10
    reasons.push({ text: 'PE window', tone: 'amber' })
  }

  if ((p.cwp_contacts ?? 0) >= 5) {
    reasons.push({ text: `${p.cwp_contacts} CWP contacts`, tone: 'green' })
  }

  return { prospect: p, score, reasons }
}

const REASON_TONES = {
  navy: 'bg-[#041E42]/10 text-[#041E42]',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700',
  green: 'bg-green-100 text-green-700',
}

function daysAgo(dateStr) {
  if (!dateStr) return null
  const diff = Math.round((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
  if (isNaN(diff)) return null
  if (diff <= 0) return 'today'
  return `${diff}d ago`
}

export default function CallSheet({ prospects, taskCounts, getUrgency, onSelect }) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)

  const entries = prospects
    .map(p => buildCallEntry(p, taskCounts.get(p.id), getUrgency))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)

  const visible = entries.slice(0, visibleCount)

  return (
    <div className="max-w-3xl mx-auto px-6 py-5">
      <div className="flex items-center gap-2 mb-1">
        <Phone className="w-4 h-4 text-[#041E42]" />
        <h2 className="text-base font-semibold text-[#041E42]">Next Calls</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Ranked by priority score, plus boosts for due/overdue work and open PE windows.
        Converted, Nurture, and Identified companies are excluded. Filters above apply.
      </p>

      {entries.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500">
            No callable companies match the current filters. Companies need a calculated
            priority score and a non-parked status to appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visible.map((entry, i) => {
              const p = entry.prospect
              const hookLine = buildHookLine(p)
              const lastTouch = daysAgo(p.updated_at)
              return (
                <div
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-[#041E42]/40 hover:shadow-sm cursor-pointer transition-all flex gap-4"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#041E42] text-white text-sm font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900">{p.company}</h3>
                      <StatusBadge status={p.prospect_status} />
                      {lastTouch && (
                        <span className="text-[11px] text-gray-400">last touched {lastTouch}</span>
                      )}
                    </div>
                    {hookLine && (
                      <p className="text-xs text-gray-500 italic mt-0.5">{hookLine}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {entry.reasons.map((r, j) => (
                        <span key={j} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${REASON_TONES[r.tone] || REASON_TONES.navy}`}>
                          {r.text}
                        </span>
                      ))}
                    </div>
                    {p.suggested_next_step && (
                      <p className="text-xs text-gray-600 mt-2 line-clamp-2">
                        <span className="font-medium text-gray-500">Next step:</span> {p.suggested_next_step}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {entries.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(c => c + SHOW_MORE_STEP)}
              className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-[#041E42] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Show {Math.min(SHOW_MORE_STEP, entries.length - visibleCount)} more ({entries.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}
    </div>
  )
}
