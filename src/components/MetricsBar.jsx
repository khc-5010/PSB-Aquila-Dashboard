/**
 * Formats a numeric value as currency with K/M suffixes
 */
const formatValue = (value) => {
  if (!value || value === 0) return '$0'
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${Math.round(value / 1000)}K`
  return `$${value}`
}

/**
 * MetricsBar - Displays pipeline statistics
 * @param {Object} props
 * @param {Array} props.opportunities - Array of opportunity objects
 */
function MetricsBar({ opportunities = [] }) {
  // Total Pipeline: count of non-complete opportunities
  const totalPipeline = opportunities.filter(opp => opp.stage !== 'complete').length

  // Est. Value: sum of est_value for non-complete opportunities
  const estValue = opportunities
    .filter(opp => opp.stage !== 'complete')
    .reduce((sum, opp) => sum + (opp.est_value || 0), 0)

  // Need Action: opportunities with next_action set AND in lead/qualified stage
  const needAction = opportunities.filter(opp =>
    opp.next_action &&
    opp.next_action.trim() !== '' &&
    (opp.stage === 'lead' || opp.stage === 'qualified')
  ).length

  // Active Projects: count where stage is 'active'
  const activeProjects = opportunities.filter(opp => opp.stage === 'active').length

  const metrics = [
    { value: totalPipeline, label: 'Total Pipeline' },
    { value: formatValue(estValue), label: 'Est. Value' },
    { value: needAction, label: 'Need Action' },
    { value: activeProjects, label: 'Active Projects' },
  ]

  return (
    <div className="border-b border-gray-200 px-6 py-4 flex gap-8" style={{ backgroundColor: 'rgba(4, 30, 66, 0.05)' }}>
      {metrics.map((metric, index) => (
        <div key={metric.label} className="flex items-center gap-8">
          <div className="flex flex-col gap-0.5">
            <span className="text-2xl font-bold text-[#041E42]">{metric.value}</span>
            <span className="text-xs text-gray-500 uppercase tracking-wide">{metric.label}</span>
          </div>
          {index < metrics.length - 1 && (
            <div className="w-px bg-gray-300 self-stretch" />
          )}
        </div>
      ))}
    </div>
  )
}

export default MetricsBar
