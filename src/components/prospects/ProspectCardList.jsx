import { Flag } from 'lucide-react'
import OutreachGroupBadge from './OutreachGroupBadge'
import StatusBadge from './StatusBadge'
import { buildHookLine } from '../../utils/buildHookLine'

// Mobile-only replacement for the prospect table (Couch Mode Phase 1).
// Rendered by ProspectTable below the `lg` breakpoint via useIsMobile();
// the desktop <table> path is untouched. Receives the already-filtered,
// sorted, parent-grouped rows plus the table's own helpers as props so no
// scoring/urgency/format logic is duplicated here.

// Chip classes keyed by getProspectUrgency()'s `color` field (ProspectTable).
const URGENCY_CHIP = {
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-700',
  orange: 'bg-orange-100 text-orange-700',
  gray: 'bg-gray-100 text-gray-600',
}

function flattenGroups(grouped) {
  const rows = []
  for (const item of grouped) {
    if (item.type === 'standalone') {
      rows.push({ p: item.prospect })
    } else {
      // Real parents render as a card; virtual parents (no prospect row) are
      // skipped — their children still appear, just without a header card.
      if (item.prospect) rows.push({ p: item.prospect, childCount: item.aggregates.childCount })
      for (const c of item.children) rows.push({ p: c, isChild: true })
    }
  }
  return rows
}

function ProspectCard({ p, isChild, childCount, onSelect, getUrgency, taskCounts, formatLocation, cwpHeatClass, priorityColors }) {
  const urgency = getUrgency(p)
  const tasks = taskCounts.get(p.id)
  const hook = buildHookLine(p)
  const location = formatLocation(p)

  return (
    <button
      onClick={() => onSelect(p)}
      className={`w-full text-left bg-white rounded-lg border border-gray-200 px-4 py-3 shadow-sm active:bg-gray-50 ${
        isChild ? 'ml-4 w-[calc(100%-1rem)] border-l-2 border-l-gray-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-900 truncate">{p.company}</span>
            {p.needs_review && <Flag className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />}
            {childCount > 0 && (
              <span className="flex-shrink-0 text-[10px] font-medium text-gray-500 bg-gray-200/80 rounded-full px-1.5 py-0.5">
                +{childCount} subs
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {[p.category, location].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        {p.priority && (
          <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full ${priorityColors[p.priority] || 'bg-gray-100 text-gray-600'}`}>
            {p.priority}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <StatusBadge status={p.prospect_status} />
        <OutreachGroupBadge group={p.outreach_group} />
        {p.outreach_rank && <span className="text-xs text-gray-500">#{p.outreach_rank}</span>}
        {urgency && (
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${URGENCY_CHIP[urgency.color] || URGENCY_CHIP.gray}`}>
            {urgency.label}
          </span>
        )}
        {tasks?.count > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-indigo-50 text-indigo-700">
            {tasks.count} task{tasks.count !== 1 ? 's' : ''}
          </span>
        )}
        {p.cwp_contacts > 0 && (
          <span className={`text-xs ${cwpHeatClass(p.cwp_contacts)}`}>CWP {p.cwp_contacts}</span>
        )}
      </div>

      {hook && <p className="text-xs text-gray-500 italic truncate mt-1.5">{hook}</p>}
      {p.suggested_next_step && (
        <p className="text-xs text-gray-600 truncate mt-1">→ {p.suggested_next_step}</p>
      )}
    </button>
  )
}

function ProspectCardList({ grouped, hasAnyProspects, onSelect, getUrgency, taskCounts, formatLocation, cwpHeatClass, priorityColors }) {
  const rows = flattenGroups(grouped)

  if (rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-gray-500">
        {hasAnyProspects
          ? 'No prospects match the current filters.'
          : 'No prospects loaded. Run the seed script or import from Excel.'}
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      {rows.map(({ p, isChild, childCount }) => (
        <ProspectCard
          key={p.id}
          p={p}
          isChild={isChild}
          childCount={childCount}
          onSelect={onSelect}
          getUrgency={getUrgency}
          taskCounts={taskCounts}
          formatLocation={formatLocation}
          cwpHeatClass={cwpHeatClass}
          priorityColors={priorityColors}
        />
      ))}
    </div>
  )
}

export default ProspectCardList
