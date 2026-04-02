const METRICS = [
  { key: 'prospect_count', label: 'Prospect Count', description: 'Number of companies per state' },
  { key: 'avg_signal', label: 'Signal Strength', description: 'Average signal count per state' },
  { key: 'cwp_total', label: 'CWP Density', description: 'Total CWP contacts per state' },
  { key: 'priority_mix', label: 'Priority Mix', description: 'Proportion of HIGH PRIORITY prospects' },
]

function MapMetricSelector({ activeMetric, onMetricChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mr-1">Color by:</span>
      {METRICS.map((m) => (
        <button
          key={m.key}
          onClick={() => onMetricChange(m.key)}
          title={m.description}
          className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
            activeMetric === m.key
              ? 'bg-[#041E42] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

export { METRICS }
export default MapMetricSelector
