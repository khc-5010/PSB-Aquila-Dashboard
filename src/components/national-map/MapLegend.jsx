import { METRICS } from './MapMetricSelector'

const FRESHNESS_LEGEND = [
  { color: '#16A34A', label: 'Fresh (<30d)' },
  { color: '#EAB308', label: 'Aging (30-90d)' },
  { color: '#DC2626', label: 'Stale (>90d)' },
  { color: '#E5E7EB', label: 'No Report', border: true },
]

function MapLegend({ activeMetric, minValue, maxValue }) {
  const metricInfo = METRICS.find(m => m.key === activeMetric)
  const label = metricInfo?.label || activeMetric

  if (activeMetric === 'freshness') {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">{label}:</span>
        {FRESHNESS_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className={`w-3 h-3 rounded-sm ${item.border ? 'border border-gray-300' : ''}`}
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-400">{item.label}</span>
          </div>
        ))}
      </div>
    )
  }

  // Format display values
  const formatVal = (v) => {
    if (v === null || v === undefined) return '0'
    if (activeMetric === 'avg_signal') return v.toFixed(1)
    if (activeMetric === 'ontology_density') return v.toFixed(1)
    if (activeMetric === 'priority_mix') return `${Math.round(v * 100)}%`
    return String(Math.round(v))
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 font-medium">{label}:</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">{formatVal(minValue)}</span>
        <div
          className="w-32 h-3 rounded-full"
          style={{
            background: 'linear-gradient(to right, #93C5FD, #2563EB, #041E42)',
          }}
        />
        <span className="text-xs text-gray-400">{formatVal(maxValue)}</span>
      </div>
      <div className="flex items-center gap-1.5 ml-3">
        <div className="w-3 h-3 rounded-sm bg-gray-200 border border-gray-300" />
        <span className="text-xs text-gray-400">No data</span>
      </div>
    </div>
  )
}

export default MapLegend
