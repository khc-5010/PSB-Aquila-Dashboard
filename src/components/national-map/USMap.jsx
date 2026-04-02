import { useState, useCallback } from 'react'
import { US_STATES } from '../../data/us-states'
import { FRESHNESS_THRESHOLDS, getFreshnessInfo } from './StateReportSection'

function getMetricValue(data, metric) {
  if (!data) return 0
  if (metric === 'priority_mix') {
    const priorities = data.priorities || {}
    const total = Object.values(priorities).reduce((s, v) => s + v, 0)
    const hp = (priorities['HIGH PRIORITY'] || 0)
    return total > 0 ? hp / total : 0
  }
  return data[metric] || 0
}

function getColor(value, min, max, hasData) {
  if (!hasData) return '#E5E7EB'
  if (max === min) return '#2563EB'
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  // Interpolate: light blue (#93C5FD) -> blue (#2563EB) -> navy (#041E42)
  if (t < 0.5) {
    const s = t * 2
    const r = Math.round(147 + (37 - 147) * s)
    const g = Math.round(197 + (99 - 197) * s)
    const b = Math.round(253 + (235 - 253) * s)
    return `rgb(${r},${g},${b})`
  } else {
    const s = (t - 0.5) * 2
    const r = Math.round(37 + (4 - 37) * s)
    const g = Math.round(99 + (30 - 99) * s)
    const b = Math.round(235 + (66 - 235) * s)
    return `rgb(${r},${g},${b})`
  }
}

const FRESHNESS_COLORS = {
  green: '#16A34A',  // Fresh (<30 days)
  yellow: '#EAB308', // Aging (30-90 days)
  red: '#DC2626',    // Stale (>90 days)
  gray: '#E5E7EB',   // No report
}

function getFreshnessColor(reportMeta) {
  if (!reportMeta?.researched_at) return FRESHNESS_COLORS.gray
  const info = getFreshnessInfo(reportMeta.researched_at)
  return FRESHNESS_COLORS[info.color] || FRESHNESS_COLORS.gray
}

function USMap({ stateData, reportMeta, activeMetric, selectedState, onStateHover, onStateClick, onMouseMove }) {
  const [hoveredState, setHoveredState] = useState(null)

  // Compute min/max for the active metric across states with data
  const statesWithData = US_STATES.filter(s => stateData[s.id]?.prospect_count > 0)
  const values = statesWithData.map(s => getMetricValue(stateData[s.id], activeMetric))
  const minVal = values.length > 0 ? Math.min(...values) : 0
  const maxVal = values.length > 0 ? Math.max(...values) : 1

  const handleMouseEnter = useCallback((stateObj) => {
    setHoveredState(stateObj.id)
    onStateHover(stateObj.id, stateObj.name, stateData[stateObj.id] || null)
  }, [stateData, onStateHover])

  const handleMouseLeave = useCallback(() => {
    setHoveredState(null)
    onStateHover(null, null, null)
  }, [onStateHover])

  return (
    <svg
      viewBox="0 0 960 600"
      className="w-full h-auto max-h-[calc(100vh-280px)]"
      style={{ minHeight: '300px' }}
      onMouseMove={onMouseMove}
    >
      {US_STATES.map((state) => {
        const data = stateData[state.id]
        const hasData = data?.prospect_count > 0
        const value = getMetricValue(data, activeMetric)
        const fill = activeMetric === 'freshness'
          ? getFreshnessColor(reportMeta?.[state.id])
          : getColor(value, minVal, maxVal, hasData)
        const isHovered = hoveredState === state.id
        const isSelected = selectedState === state.id

        return (
          <path
            key={state.id}
            d={state.path}
            fill={fill}
            stroke={isSelected ? '#F59E0B' : isHovered ? '#041E42' : '#FFFFFF'}
            strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 0.5}
            opacity={isHovered ? 0.85 : 1}
            className="cursor-pointer transition-opacity"
            onMouseEnter={() => handleMouseEnter(state)}
            onMouseLeave={handleMouseLeave}
            onClick={() => onStateClick(state.id, state.name)}
          />
        )
      })}
    </svg>
  )
}

export { getMetricValue }
export default USMap
