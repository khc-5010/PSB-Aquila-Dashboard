import { useState, useEffect, useCallback } from 'react'
import USMap from './USMap'
import MapMetricSelector from './MapMetricSelector'
import MapLegend from './MapLegend'
import StateTooltip from './StateTooltip'
import StateDetailPanel from './StateDetailPanel'
import { getMetricValue } from './USMap'
import { US_STATES } from '../../data/us-states'

const ORIENTATION_KEY = 'national-map-orientation-dismissed'

function OrientationCard() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(ORIENTATION_KEY) === 'true' } catch { return false }
  })

  function handleDismiss() {
    setDismissed(true)
    try { localStorage.setItem(ORIENTATION_KEY, 'true') } catch {}
  }

  function handleExpand() {
    setDismissed(false)
    try { localStorage.removeItem(ORIENTATION_KEY) } catch {}
  }

  if (dismissed) {
    return (
      <button
        onClick={handleExpand}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-3 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
        About this view
      </button>
    )
  }

  return (
    <div className="mb-4 bg-blue-50 border-l-4 border-[#041E42] rounded-r-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <svg className="w-4 h-4 text-[#041E42] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-[#041E42]">National Coverage Map</p>
            <p className="text-xs text-[#041E42]/70 mt-0.5 leading-relaxed">
              Track your pipeline's geographic footprint. States are colored by the metric you select —
              click any state to see its prospects, research reports, and run new research sweeps.
              As you complete state-by-state research, this map shows where you've been, where gaps remain,
              and what needs refreshing.
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-[#041E42]/40 hover:text-[#041E42]/70 flex-shrink-0 mt-0.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function buildDynamicSubtitle(activeMetric, stateData, totals, reportMeta) {
  if (!totals) return null

  const statesWithData = Object.keys(stateData).filter(k => stateData[k]?.prospect_count > 0)
  const totalStates = 51 // 50 states + DC
  const remaining = totalStates - statesWithData.length

  switch (activeMetric) {
    case 'prospect_count':
      return `${totals.total_prospects} prospects across ${totals.states_covered} states \u00b7 ${remaining} states remaining`

    case 'avg_signal': {
      const signals = statesWithData.map(s => parseFloat(stateData[s].avg_signal)).filter(v => !isNaN(v))
      if (signals.length === 0) return null
      const min = Math.min(...signals).toFixed(1)
      const max = Math.max(...signals).toFixed(1)
      return `Average signal strength ranges from ${min} to ${max} across tracked states`
    }

    case 'cwp_total': {
      const cwpEntries = statesWithData.map(s => ({ code: s, cwp: stateData[s].cwp_total || 0 }))
      const totalCwp = cwpEntries.reduce((sum, e) => sum + e.cwp, 0)
      const statesWithCwp = cwpEntries.filter(e => e.cwp > 0).length
      const strongest = cwpEntries.sort((a, b) => b.cwp - a.cwp)[0]
      if (!strongest || totalCwp === 0) return `${totals.total_prospects} prospects across ${totals.states_covered} states`
      return `${totalCwp} total CWP contacts across ${statesWithCwp} states \u00b7 Strongest: ${strongest.code} (${strongest.cwp} contacts)`
    }

    case 'priority_mix': {
      let high = 0, qualified = 0, watch = 0
      for (const s of statesWithData) {
        const p = stateData[s].priorities || {}
        high += p['HIGH PRIORITY'] || 0
        qualified += p['QUALIFIED'] || 0
        watch += p['WATCH'] || 0
      }
      return `${high} High Priority \u00b7 ${qualified} Qualified \u00b7 ${watch} Watch across all states`
    }

    case 'freshness': {
      const reportCodes = Object.keys(reportMeta)
      const now = Date.now()
      let fresh = 0, aging = 0, stale = 0
      for (const code of reportCodes) {
        const r = reportMeta[code]
        if (!r?.researched_at) continue
        const days = Math.floor((now - new Date(r.researched_at).getTime()) / (1000 * 60 * 60 * 24))
        if (days < 30) fresh++
        else if (days < 90) aging++
        else stale++
      }
      const never = totalStates - reportCodes.length
      return `${reportCodes.length} states researched \u00b7 ${fresh} fresh \u00b7 ${aging} aging \u00b7 ${stale} stale \u00b7 ${never} never researched`
    }

    default:
      return `${totals.total_prospects} prospects across ${totals.states_covered} states`
  }
}

function NationalMap() {
  const [stateData, setStateData] = useState({})
  const [totals, setTotals] = useState(null)
  const [reportMeta, setReportMeta] = useState({}) // keyed by state_code
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeMetric, setActiveMetric] = useState('prospect_count')
  const [tooltip, setTooltip] = useState({ show: false, stateId: null, stateName: null, data: null, position: { x: 0, y: 0 } })
  const [selectedState, setSelectedState] = useState(null)
  const [selectedStateName, setSelectedStateName] = useState(null)

  function fetchReportMeta() {
    fetch('/api/prospects?action=state-reports')
      .then(res => res.ok ? res.json() : [])
      .then(reports => {
        const lookup = {}
        for (const r of reports) lookup[r.state_code] = r
        setReportMeta(lookup)
      })
      .catch(() => {})
  }

  // Fetch state stats and report metadata on mount
  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/prospects?action=state-stats').then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      }),
      fetch('/api/prospects?action=state-reports').then(res => res.ok ? res.json() : []),
    ])
      .then(([statsData, reports]) => {
        const { _totals, ...states } = statsData
        setStateData(states)
        setTotals(_totals)
        const lookup = {}
        for (const r of reports) lookup[r.state_code] = r
        setReportMeta(lookup)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching map data:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const handleStateHover = useCallback((stateId, stateName, data) => {
    if (stateId) {
      setTooltip(prev => ({ ...prev, show: true, stateId, stateName, data }))
    } else {
      setTooltip(prev => ({ ...prev, show: false }))
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    setTooltip(prev => prev.show ? { ...prev, position: { x: e.clientX, y: e.clientY } } : prev)
  }, [])

  const handleStateClick = useCallback((stateId, stateName) => {
    setSelectedState(stateId)
    setSelectedStateName(stateName)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedState(null)
    setSelectedStateName(null)
  }, [])

  // Compute min/max for legend (not used for freshness metric)
  const statesWithData = US_STATES.filter(s => stateData[s.id]?.prospect_count > 0)
  const values = activeMetric !== 'freshness'
    ? statesWithData.map(s => getMetricValue(stateData[s.id], activeMetric))
    : []
  const minVal = values.length > 0 ? Math.min(...values) : 0
  const maxVal = values.length > 0 ? Math.max(...values) : 0

  const subtitle = buildDynamicSubtitle(activeMetric, stateData, totals, reportMeta)

  return (
    <div className="px-6 py-4 pb-16">
      {/* Orientation Card */}
      <OrientationCard />

      {/* Header row */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#041E42]">National Map</h2>
          {subtitle && (
            <p className="text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        <MapMetricSelector activeMetric={activeMetric} onMetricChange={setActiveMetric} />
      </div>

      {/* Map area */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-[#041E42] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading map data...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-sm text-red-700">Failed to load state data: {error}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <USMap
              stateData={stateData}
              reportMeta={reportMeta}
              activeMetric={activeMetric}
              selectedState={selectedState}
              onStateHover={handleStateHover}
              onStateClick={handleStateClick}
              onMouseMove={handleMouseMove}
            />
          </div>

          {/* Legend */}
          <div className="mt-3 flex justify-center">
            <MapLegend activeMetric={activeMetric} minValue={minVal} maxValue={maxVal} />
          </div>
        </>
      )}

      {/* Tooltip */}
      {tooltip.show && (
        <StateTooltip
          stateName={tooltip.stateName}
          stateId={tooltip.stateId}
          data={tooltip.data}
          reportMeta={reportMeta[tooltip.stateId] || null}
          activeMetric={activeMetric}
          position={tooltip.position}
        />
      )}

      {/* Detail Panel */}
      {selectedState && (
        <StateDetailPanel
          stateId={selectedState}
          stateName={selectedStateName}
          data={stateData[selectedState] || null}
          onClose={handleCloseDetail}
          onReportChanged={fetchReportMeta}
        />
      )}
    </div>
  )
}

export default NationalMap
