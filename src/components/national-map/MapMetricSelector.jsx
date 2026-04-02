import InfoTooltip from './InfoTooltip'

const METRICS = [
  { key: 'prospect_count', label: 'Prospect Count', description: 'Number of companies per state', tooltip: 'Number of companies tracked in our prospect database for each state' },
  { key: 'avg_signal', label: 'Signal Strength', description: 'Average signal count per state', tooltip: 'Average AI readiness signal score — higher means more indicators of data maturity and technology adoption' },
  { key: 'cwp_total', label: 'CWP Density', description: 'Total CWP contacts per state', tooltip: 'Total contacts in Penn State Behrend\'s Continuing Workforce Programs database — indicates existing PSB training relationships' },
  { key: 'priority_mix', label: 'Priority Mix', description: 'Proportion of HIGH PRIORITY prospects', tooltip: 'Proportion of High Priority vs Qualified vs Watch prospects — darker states have more high-priority targets' },
  { key: 'freshness', label: 'Research Freshness', description: 'How recently each state was researched', tooltip: 'How recently each state was researched — green means current, red means the research may be outdated' },
  { key: 'ontology_density', label: 'Ontology Density', description: 'Knowledge graph depth per state', tooltip: 'Ontology relationships per prospect — higher means deeper knowledge graph coverage from structured data and research extraction. Run Layer 2 extractions to increase density.' },
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
          className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
            activeMetric === m.key
              ? 'bg-[#041E42] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {m.label}
          <InfoTooltip text={m.tooltip} />
        </button>
      ))}
    </div>
  )
}

export { METRICS }
export default MapMetricSelector
