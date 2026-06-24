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
 * MetricsBar - Displays pipeline statistics with interactive modals
 * @param {Object} props
 * @param {Array} props.opportunities - Array of opportunity objects
 * @param {Function} props.onValueClick - Handler for Est. Value metric click
 * @param {Function} props.onActionClick - Handler for Need Action metric click
 * @param {Function} props.onActiveClick - Handler for Active Projects metric click
 */
// Working stages where an open next_action means a ball is in play.
// On Deck is excluded by design (parked until you initiate outreach).
// SYNC: keep aligned with ActionSummaryModal + the MetricsBar needAction filter.
const ACTION_STAGES = ['outreach', 'channel_routing', 'client_readiness', 'project_setup']

function MetricsBar({ opportunities = [], onValueClick, onActionClick, onActiveClick, onImpactClick }) {
  // Total Pipeline: count of non-complete opportunities (now includes On Deck +
  // Outreach — they're the pipeline too; their null value contributes $0).
  const totalPipeline = opportunities.filter(opp => opp.stage !== 'complete').length

  // Est. Value: sum of est_value for non-complete opportunities.
  // parseFloat: Neon returns NUMERIC columns as strings — naive `+` would
  // string-concatenate ("0" + "50000" = "050000").
  const estValue = opportunities
    .filter(opp => opp.stage !== 'complete')
    .reduce((sum, opp) => sum + (parseFloat(opp.est_value) || 0), 0)

  // Need Action: opportunities with next_action set, in a working stage, where
  // the ball is on us (waiting_on !== 'them' suppresses legitimately-parked
  // leads like a partner sitting in their own internal process).
  // SYNC: keep this predicate identical to ActionSummaryModal's ACTION_STAGES.
  const needAction = opportunities.filter(opp =>
    opp.next_action &&
    opp.next_action.trim() !== '' &&
    ACTION_STAGES.includes(opp.stage) &&
    opp.waiting_on !== 'them'
  ).length

  // Active Projects: count where stage is 'active'
  const activeProjects = opportunities.filter(opp => opp.stage === 'active').length

  // From Prospects: pipeline $ on opportunities sourced from the prospect
  // database (source_prospect_id set via Promote to Pipeline) — the ROI number
  const sourcedValue = opportunities
    .filter(opp => opp.source_prospect_id && opp.stage !== 'complete')
    .reduce((sum, opp) => sum + (parseFloat(opp.est_value) || 0), 0)

  const metrics = [
    { key: 'total', value: totalPipeline, label: 'Total Pipeline', clickable: false },
    { key: 'value', value: formatValue(estValue), label: 'Est. Value', clickable: true, onClick: onValueClick },
    { key: 'sourced', value: formatValue(sourcedValue), label: 'From Prospects', clickable: true, onClick: onImpactClick },
    { key: 'action', value: needAction, label: 'Need Action', clickable: true, onClick: onActionClick },
    { key: 'active', value: activeProjects, label: 'Active Projects', clickable: true, onClick: onActiveClick },
  ]

  return (
    <div className="border-b border-gray-200 px-6 py-4 flex gap-8 max-sm:px-4 max-sm:py-3 max-sm:gap-4 max-sm:overflow-x-auto" style={{ backgroundColor: 'rgba(4, 30, 66, 0.05)' }}>
      {metrics.map((metric, index) => (
        <div key={metric.key} className="flex items-center gap-8 max-sm:gap-4 max-sm:flex-shrink-0">
          <div
            className={`flex flex-col gap-0.5 ${
              metric.clickable
                ? 'cursor-pointer group hover:opacity-80 transition-opacity'
                : ''
            }`}
            onClick={metric.clickable ? metric.onClick : undefined}
            role={metric.clickable ? 'button' : undefined}
            tabIndex={metric.clickable ? 0 : undefined}
            onKeyDown={metric.clickable ? (e) => e.key === 'Enter' && metric.onClick?.() : undefined}
          >
            <span className="text-2xl font-bold text-[#041E42]">{metric.value}</span>
            <span className={`text-xs uppercase tracking-wide flex items-center gap-1 ${
              metric.clickable
                ? 'text-indigo-600 group-hover:underline'
                : 'text-gray-500'
            }`}>
              {metric.label}
              {metric.clickable && (
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              )}
            </span>
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
