import { STAGES } from '../constants/options'

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

function ActionSummaryModal({ opportunities, onClose, onSelectOpportunity }) {
  // Filter opportunities that need action: have next_action AND in early stages
  const actionOpps = opportunities.filter(opp =>
    opp.next_action &&
    opp.next_action.trim() !== '' &&
    (opp.stage === 'lead' || opp.stage === 'qualified' || opp.stage === 'proposal')
  )

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
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">Opportunities Needing Action</h2>
            <p className="text-sm text-gray-500 mt-1">
              {actionOpps.length} {actionOpps.length === 1 ? 'opportunity' : 'opportunities'} with pending actions
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto flex-1">
            {actionOpps.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No opportunities need action right now</p>
            ) : (
              <div className="space-y-3">
                {actionOpps.map((opp) => {
                  const stageInfo = getStageInfo(opp.stage)
                  return (
                    <div
                      key={opp.id}
                      onClick={() => handleRowClick(opp)}
                      className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors border border-gray-100"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900">
                            {opp.company_name}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${stageInfo.color}`}>
                            {stageInfo.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-sm text-gray-700">
                          {opp.next_action}
                        </span>
                      </div>
                    </div>
                  )
                })}
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

export default ActionSummaryModal
