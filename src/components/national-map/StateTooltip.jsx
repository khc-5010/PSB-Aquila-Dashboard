import { getFreshnessInfo } from './StateReportSection'

function StateTooltip({ stateName, stateId, data, reportMeta, activeMetric, position }) {
  if (!stateName || !position) return null

  const hasData = data && data.prospect_count > 0

  return (
    <div
      className="fixed z-[100] pointer-events-none bg-white rounded-lg shadow-xl border border-gray-200 px-4 py-3 min-w-[200px]"
      style={{
        left: Math.min(position.x + 12, window.innerWidth - 240),
        top: position.y - 10,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-[#041E42]">{stateName}</span>
        <span className="text-xs text-gray-400">{stateId}</span>
      </div>

      {activeMetric === 'freshness' ? (
        <div className="space-y-0.5 text-xs text-gray-600">
          {reportMeta?.researched_at ? (
            <>
              <p>Last researched: <span className="font-medium">
                {new Date(reportMeta.researched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span></p>
              <p>Status: <span className="font-medium">{getFreshnessInfo(reportMeta.researched_at).label}</span></p>
              {reportMeta.researched_by && (
                <p>By: <span className="font-medium">{reportMeta.researched_by}</span></p>
              )}
            </>
          ) : (
            <p className="text-gray-400 italic">Never researched</p>
          )}
        </div>
      ) : hasData ? (
        <div className="space-y-0.5 text-xs text-gray-600">
          <p><span className="font-medium">{data.prospect_count}</span> companies tracked</p>
          {data.categories?.[0] && (
            <p>Top: <span className="font-medium">{data.categories[0].category}</span></p>
          )}
          <p>Avg signal: <span className="font-medium">{data.avg_signal}</span></p>
          <p>CWP contacts: <span className="font-medium">{data.cwp_total}</span></p>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No prospects tracked</p>
      )}
    </div>
  )
}

export default StateTooltip
