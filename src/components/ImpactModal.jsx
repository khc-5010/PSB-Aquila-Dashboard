import { useEffect } from 'react'
import { STAGES } from '../constants/options'

/**
 * Impact panel — the ROI story for the prospect database (QA audit E1).
 * Everything here is computed client-side from the opportunities array App
 * already fetched; `source_prospect_id` marks opportunities created via
 * Promote to Pipeline.
 */

const formatValue = (value) => {
  const n = parseFloat(value) || 0
  if (n === 0) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}K`
  return `$${n.toLocaleString()}`
}

// "Q3 2026" plus a numeric key for sorting (newest first)
function quarterOf(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  const q = Math.floor(d.getMonth() / 3) + 1
  return { label: `Q${q} ${d.getFullYear()}`, key: d.getFullYear() * 4 + q }
}

const OUTCOME_STYLES = {
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-600',
  abandoned: 'bg-gray-100 text-gray-500',
}

function getStageBadge(opp) {
  if (opp.outcome) {
    return { name: opp.outcome.toUpperCase(), color: OUTCOME_STYLES[opp.outcome] || 'bg-gray-100 text-gray-600' }
  }
  const stage = STAGES.find(s => s.id === opp.stage)
  const stageColors = {
    on_deck: 'bg-slate-100 text-slate-700',
    outreach: 'bg-indigo-100 text-indigo-700',
    channel_routing: 'bg-teal-100 text-teal-700',
    client_readiness: 'bg-amber-100 text-amber-700',
    project_setup: 'bg-purple-100 text-purple-700',
    active: 'bg-green-100 text-green-700',
    complete: 'bg-gray-100 text-gray-700',
  }
  return { name: stage?.name || opp.stage, color: stageColors[opp.stage] || 'bg-gray-100 text-gray-600' }
}

function ImpactModal({ opportunities, onClose, onSelectOpportunity }) {
  // Close on Escape (new modal — no pre-existing behavior to preserve)
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const sourced = opportunities.filter(opp => opp.source_prospect_id)

  const pipelineValue = sourced
    .filter(opp => opp.stage !== 'complete')
    .reduce((sum, opp) => sum + (parseFloat(opp.est_value) || 0), 0)
  const wonValue = sourced
    .filter(opp => opp.outcome === 'won')
    .reduce((sum, opp) => sum + (parseFloat(opp.est_value) || 0), 0)
  const activeCount = sourced.filter(opp => opp.stage === 'active').length

  // By-quarter rollup: conversions + sourced $ keyed on created_at,
  // won $ keyed on closed_at
  const quarters = new Map()
  const ensureQuarter = (q) => {
    if (!quarters.has(q.key)) quarters.set(q.key, { label: q.label, converted: 0, sourcedValue: 0, wonValue: 0 })
    return quarters.get(q.key)
  }
  for (const opp of sourced) {
    const created = quarterOf(opp.created_at)
    if (created) {
      const row = ensureQuarter(created)
      row.converted += 1
      row.sourcedValue += parseFloat(opp.est_value) || 0
    }
    if (opp.outcome === 'won') {
      const closed = quarterOf(opp.closed_at || opp.updated_at)
      if (closed) ensureQuarter(closed).wonValue += parseFloat(opp.est_value) || 0
    }
  }
  const quarterRows = [...quarters.entries()].sort((a, b) => b[0] - a[0]).map(([, row]) => row)

  const sortedOpps = [...sourced].sort((a, b) => (parseFloat(b.est_value) || 0) - (parseFloat(a.est_value) || 0))

  const handleRowClick = (opp) => {
    if (onSelectOpportunity) {
      onSelectOpportunity(opp)
      onClose()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">Prospect Database Impact</h2>
            <p className="text-sm text-gray-500 mt-1">
              Opportunities sourced from the prospect database via Promote to Pipeline
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto flex-1">
            {/* Headline stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div>
                <p className="text-2xl font-bold text-[#041E42]">{formatValue(pipelineValue)}</p>
                <p className="text-xs text-gray-500">Pipeline Sourced</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">{formatValue(wonValue)}</p>
                <p className="text-xs text-gray-500">Won</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#041E42]">{activeCount}</p>
                <p className="text-xs text-gray-500">Active Projects</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#041E42]">{sourced.length}</p>
                <p className="text-xs text-gray-500">Total Converted</p>
              </div>
            </div>

            {sourced.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">
                No opportunities have been promoted from the Prospects tab yet.
              </p>
            ) : (
              <>
                {/* By-quarter breakdown */}
                {quarterRows.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">By Quarter</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase tracking-wider">
                          <th className="text-left pb-1.5 font-medium">Quarter</th>
                          <th className="text-right pb-1.5 font-medium">Converted</th>
                          <th className="text-right pb-1.5 font-medium">Pipeline $</th>
                          <th className="text-right pb-1.5 font-medium">Won $</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {quarterRows.map(row => (
                          <tr key={row.label}>
                            <td className="py-1.5 font-medium text-gray-800">{row.label}</td>
                            <td className="py-1.5 text-right text-gray-600">{row.converted}</td>
                            <td className="py-1.5 text-right text-gray-600">{formatValue(row.sourcedValue)}</td>
                            <td className="py-1.5 text-right text-green-700">{row.wonValue > 0 ? formatValue(row.wonValue) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Opportunity list */}
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sourced Opportunities</h3>
                <div className="space-y-2">
                  {sortedOpps.map((opp) => {
                    const badge = getStageBadge(opp)
                    return (
                      <div
                        key={opp.id}
                        onClick={() => handleRowClick(opp)}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-medium text-gray-900 truncate">{opp.company_name}</span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${badge.color}`}>
                            {badge.name}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-gray-700 flex-shrink-0 ml-4">
                          {formatValue(opp.est_value)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 rounded-b-lg flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default ImpactModal
