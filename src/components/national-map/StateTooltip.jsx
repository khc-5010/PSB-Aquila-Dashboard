import { getFreshnessInfo } from './StateReportSection'

function StateTooltip({ stateName, stateId, data, reportMeta, activeMetric, position, showCorridor, corridorName }) {
  if (!stateName || !position) return null

  const hasData = data && data.prospect_count > 0

  // Research status line (shared across default + freshness views)
  const researchLine = reportMeta?.researched_at
    ? new Date(reportMeta.researched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div
      className="fixed z-[100] pointer-events-none bg-white rounded-lg shadow-xl border border-gray-200 px-3 py-2.5 min-w-[200px] max-w-[280px]"
      style={{
        left: Math.min(position.x + 12, window.innerWidth - 300),
        top: position.y - 10,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-[#041E42]">{stateName}</span>
        <span className="text-xs text-gray-400">{stateId}</span>
      </div>
      {showCorridor && corridorName && (
        <p className="text-[10px] text-gray-400 -mt-0.5 mb-1">{corridorName}</p>
      )}

      {activeMetric === 'ontology_density' ? (
        <div className="space-y-0.5 text-xs text-gray-600">
          {hasData && data.ontology_relationship_count > 0 ? (
            <>
              <p>Density: <span className="font-medium">{(data.ontology_density || 0).toFixed(1)} per prospect</span></p>
              <p><span className="font-medium">{data.ontology_entity_count}</span> entities · <span className="font-medium">{data.ontology_relationship_count}</span> relationships</p>
              <p><span className="font-medium">{data.prospect_count}</span> prospects tracked</p>
            </>
          ) : hasData ? (
            <p className="text-gray-400 italic">No ontology data yet</p>
          ) : (
            <p className="text-gray-400 italic">No prospects tracked</p>
          )}
        </div>
      ) : activeMetric === 'freshness' ? (
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
        <div className="text-xs text-gray-600">
          {/* Counts row */}
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{data.prospect_count}</span> companies
            {(data.priorities?.['HIGH PRIORITY'] || 0) > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="font-medium text-amber-600">{data.priorities['HIGH PRIORITY']} High Priority</span>
              </>
            )}
          </div>

          {/* Signal + CWP row */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span>Avg signal: <span className="font-medium">{data.avg_signal}</span></span>
            <span className="text-gray-300">·</span>
            <span>CWP: <span className="font-medium">{data.cwp_total}</span></span>
          </div>

          {/* Top companies */}
          {data.top_companies?.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 mb-0.5">Top companies</p>
              {data.top_companies.slice(0, 3).map((c, i) => (
                <div key={i} className="flex items-baseline gap-1 leading-tight">
                  <span className="font-medium text-gray-700 truncate max-w-[140px]">{c.company}</span>
                  {c.category && (
                    <span className="text-[10px] text-gray-400 truncate max-w-[80px]">({c.category})</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Research status */}
          <div className="mt-1.5 pt-1 border-t border-gray-100 text-[10px] text-gray-400">
            {researchLine ? (
              <span>Researched: {researchLine}</span>
            ) : (
              <span className="italic">Not yet researched</span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No prospects tracked</p>
      )}
    </div>
  )
}

export default StateTooltip
