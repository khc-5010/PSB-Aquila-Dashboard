import { STAGES } from '../constants/options'

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
 * Get stage display info
 */
const getStageInfo = (stageId) => {
  const stageColors = {
    lead: 'bg-gray-100 text-gray-700',
    qualified: 'bg-blue-100 text-blue-700',
    proposal: 'bg-yellow-100 text-yellow-800',
    negotiation: 'bg-orange-100 text-orange-700',
    active: 'bg-green-100 text-green-700',
    complete: 'bg-purple-100 text-purple-700',
  }
  const stage = STAGES.find(s => s.id === stageId)
  return {
    name: stage?.name || stageId,
    color: stageColors[stageId] || 'bg-gray-100 text-gray-700',
  }
}

function ValueBreakdownModal({ opportunities, onClose, onSelectOpportunity }) {
  // Filter non-complete opportunities and sort by value descending
  const pipelineOpps = opportunities
    .filter(opp => opp.stage !== 'complete')
    .sort((a, b) => (b.est_value || 0) - (a.est_value || 0))

  const totalValue = pipelineOpps.reduce((sum, opp) => sum + (opp.est_value || 0), 0)

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
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">Pipeline Value Breakdown</h2>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto flex-1">
            {pipelineOpps.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No opportunities in pipeline</p>
            ) : (
              <div className="space-y-2">
                {pipelineOpps.map((opp) => {
                  const stageInfo = getStageInfo(opp.stage)
                  return (
                    <div
                      key={opp.id}
                      onClick={() => handleRowClick(opp)}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-medium text-gray-900 truncate">
                          {opp.company_name}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${stageInfo.color}`}>
                          {stageInfo.name}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700 flex-shrink-0 ml-4">
                        {formatValue(opp.est_value)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer with total */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 rounded-b-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Total Pipeline Value</span>
              <span className="text-lg font-bold text-[#041E42]">
                {formatValue(totalValue) === '—' ? '$0' : formatValue(totalValue)}
              </span>
            </div>
            <div className="mt-3 flex justify-end">
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

export default ValueBreakdownModal
