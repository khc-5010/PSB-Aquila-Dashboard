import { useState, useEffect, useCallback } from 'react'
import USMap from './USMap'
import MapMetricSelector from './MapMetricSelector'
import MapLegend from './MapLegend'
import StateTooltip from './StateTooltip'
import StateDetailPanel from './StateDetailPanel'
import { getMetricValue } from './USMap'
import { US_STATES } from '../../data/us-states'

function NationalMap() {
  const [stateData, setStateData] = useState({})
  const [totals, setTotals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeMetric, setActiveMetric] = useState('prospect_count')
  const [tooltip, setTooltip] = useState({ show: false, stateId: null, stateName: null, data: null, position: { x: 0, y: 0 } })
  const [selectedState, setSelectedState] = useState(null)
  const [selectedStateName, setSelectedStateName] = useState(null)

  // Fetch state stats on mount
  useEffect(() => {
    setLoading(true)
    fetch('/api/prospects?action=state-stats')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        const { _totals, ...states } = data
        setStateData(states)
        setTotals(_totals)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching state stats:', err)
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

  // Compute min/max for legend
  const statesWithData = US_STATES.filter(s => stateData[s.id]?.prospect_count > 0)
  const values = statesWithData.map(s => getMetricValue(stateData[s.id], activeMetric))
  const minVal = values.length > 0 ? Math.min(...values) : 0
  const maxVal = values.length > 0 ? Math.max(...values) : 0

  return (
    <div className="px-6 py-4 pb-16">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#041E42]">National Map</h2>
          {totals && (
            <p className="text-sm text-gray-500">
              {totals.total_prospects} prospects across {totals.states_covered} states
            </p>
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
        />
      )}
    </div>
  )
}

export default NationalMap
