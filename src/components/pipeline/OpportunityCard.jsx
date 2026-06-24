import { PROJECT_TYPES } from '../../constants/pipeline'

const PROJECT_TYPE_COLORS = {
  'Pilot Project': 'bg-teal-50 text-teal-700 border-teal-200',
  'Research Agreement': 'bg-blue-50 text-blue-700 border-blue-200',
  'Senior Design': 'bg-amber-50 text-amber-700 border-amber-200',
  'Strategic Membership': 'bg-purple-50 text-purple-700 border-purple-200',
}

// Stages where killing the lead ("No Fit") makes sense.
const NO_FIT_STAGES = ['on_deck', 'outreach', 'channel_routing']
// Stages where a client should have a project type by now (nudge if missing).
const PROJECT_TYPE_EXPECTED = ['channel_routing', 'client_readiness', 'project_setup', 'active']

function OpportunityCard({ opportunity, onClick, isDragging = false, users = [], onNoFit, onLogContact }) {
  const {
    company_name, description, owner, project_type, next_action, source_prospect_id,
    stage, lead_type, waiting_on, last_activity_at,
  } = opportunity

  const getInitials = (name) => {
    if (!name) return '?'
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  }

  // Find owner user for color
  const ownerUser = users.find(u => u.name === owner)
  const ownerColor = ownerUser?.color || '#6B7280'

  const daysSince = (dateStr) => {
    if (!dateStr) return null
    const diff = Date.now() - new Date(dateStr).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  const daysInStage = daysSince(opportunity.updated_at)
  const lastContactDays = daysSince(last_activity_at)

  // Project type styling
  const typeInfo = PROJECT_TYPES.find(t => t.value === project_type)
  const typeColorClass = PROJECT_TYPE_COLORS[project_type] || 'bg-gray-50 text-gray-600 border-gray-200'

  const isPartner = lead_type === 'partner'
  const needsProjectType = !isPartner && !project_type && PROJECT_TYPE_EXPECTED.includes(stage)
  const isComplete = stage === 'complete'

  return (
    <div
      onClick={() => onClick?.(opportunity)}
      style={{ borderLeftColor: ownerColor }}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 p-3.5 cursor-pointer
        transition-all duration-200
        hover:shadow-md hover:-translate-y-0.5
        ${isDragging ? 'shadow-lg ring-2 ring-indigo-400 rotate-2' : ''}`}
    >
      {/* Header: company name (+ partner tag) + owner avatar */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight">{company_name}</h3>
          {isPartner && (
            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-violet-50 text-violet-700 border border-violet-200">
              Partner
            </span>
          )}
        </div>
        <span
          className="flex-shrink-0 w-7 h-7 rounded-full text-white text-xs font-medium flex items-center justify-center"
          style={{ backgroundColor: ownerColor }}
          title={owner || 'Unassigned'}
        >
          {getInitials(owner)}
        </span>
      </div>

      {/* Project type badge / nudge + waiting-on chip */}
      {(project_type || needsProjectType || waiting_on) && (
        <div className="flex items-center flex-wrap gap-2 mb-2">
          {project_type && (
            <>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${typeColorClass}`}>
                {project_type}
              </span>
              {typeInfo?.lead && (
                <span className="text-xs text-gray-400">{typeInfo.lead}</span>
              )}
            </>
          )}
          {needsProjectType && (
            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
              Set project type
            </span>
          )}
          {!isComplete && waiting_on === 'them' && (
            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
              Waiting on them
            </span>
          )}
          {!isComplete && waiting_on === 'us' && (
            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
              Your move
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{description}</p>
      )}

      {/* Next action */}
      {next_action && (
        <div className="bg-gray-50 rounded p-2 border border-gray-100 mb-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Next Action</p>
          <p className="text-xs text-gray-700 line-clamp-2">{next_action}</p>
        </div>
      )}

      {/* Footer: time + last contact + actions */}
      <div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-1 mt-2 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {daysInStage !== null && (
            <span className={daysInStage > 30 ? 'text-amber-600 font-medium' : ''}>
              {daysInStage}d in stage
            </span>
          )}
          {lastContactDays !== null && (
            <span title="Last logged contact">
              · contacted {lastContactDays === 0 ? 'today' : `${lastContactDays}d ago`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {source_prospect_id && (
            <span className="text-xs text-purple-500">from Prospects</span>
          )}
          {!isComplete && onLogContact && (
            <button
              onClick={(e) => { e.stopPropagation(); onLogContact(opportunity) }}
              className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
              title="Log a contact / outreach touch"
            >
              Log contact
            </button>
          )}
          {NO_FIT_STAGES.includes(stage) && onNoFit && (
            <button
              onClick={(e) => { e.stopPropagation(); onNoFit(opportunity) }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Not a Fit — Return to Nurture"
            >
              No Fit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default OpportunityCard
