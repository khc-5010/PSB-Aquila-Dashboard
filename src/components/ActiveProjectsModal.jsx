import { getProjectTypeLabel } from '../constants/options'

/**
 * Formats a numeric value as currency with K/M suffixes
 */
const formatValue = (value) => {
  if (!value || value === 0) return '—'
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${Math.round(value / 1000)}K`
  return `$${value.toLocaleString()}`
}

/**
 * Get owner badge color
 */
const getOwnerColor = (owner) => {
  const colors = {
    Kyle: 'bg-purple-100 text-purple-700 border-purple-200',
    Duane: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    Steve: 'bg-amber-100 text-amber-700 border-amber-200',
  }
  return colors[owner] || 'bg-gray-100 text-gray-700 border-gray-200'
}

function ActiveProjectsModal({ opportunities, onClose, onSelectOpportunity }) {
  // Filter opportunities where stage is 'active'
  const activeOpps = opportunities.filter(opp => opp.stage === 'active')

  const handleRowClick = (opp) => {
    if (onSelectOpportunity) {
      onSelectOpportunity(opp)
      onClose()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">Active Projects</h2>
            <p className="text-sm text-gray-500 mt-1">
              {activeOpps.length} {activeOpps.length === 1 ? 'project' : 'projects'} currently in progress
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto flex-1">
            {activeOpps.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No active projects</p>
            ) : (
              <div className="space-y-3">
                {activeOpps.map((opp) => (
                  <div
                    key={opp.id}
                    onClick={() => handleRowClick(opp)}
                    className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors border border-gray-100"
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 text-base">
                        {opp.company_name}
                      </span>
                      <span className="text-sm font-semibold text-[#041E42]">
                        {formatValue(opp.est_value)}
                      </span>
                    </div>

                    {/* Details row */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {opp.project_type && opp.project_type !== 'tbd' && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
                          {getProjectTypeLabel(opp.project_type)}
                        </span>
                      )}
                      {opp.owner && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getOwnerColor(opp.owner)}`}>
                          {opp.owner}
                        </span>
                      )}
                    </div>

                    {/* Next Action */}
                    {opp.next_action && opp.next_action.trim() !== '' && (
                      <div className="mt-3 flex items-start gap-2 pt-2 border-t border-gray-200">
                        <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-sm text-gray-600">
                          {opp.next_action}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 rounded-b-lg">
            <div className="flex justify-end">
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
      </div>
    </>
  )
}

export default ActiveProjectsModal
