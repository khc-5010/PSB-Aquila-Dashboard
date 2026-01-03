import { getProjectTypeLabel } from '../../constants/options'

function OpportunityCard({ opportunity, onClick, isDragging = false }) {
  const { company_name, description, owner, project_type } = opportunity

  // Get initials from owner name (e.g., "Kyle" -> "K", "John Doe" -> "JD")
  const getInitials = (name) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Owner color mapping - used for left border accent
  const ownerColors = {
    Kyle: { bg: 'bg-[#7C3AED]', border: '#7C3AED' },
    Duane: { bg: 'bg-[#0891B2]', border: '#0891B2' },
    Steve: { bg: 'bg-[#D97706]', border: '#D97706' },
  }
  const ownerColor = ownerColors[owner] || { bg: 'bg-gray-500', border: '#6B7280' }

  return (
    <div
      onClick={() => onClick?.(opportunity)}
      style={{ borderLeftColor: ownerColor.border }}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 p-4 cursor-pointer
        transition-all duration-200
        hover:shadow-md hover:-translate-y-0.5
        ${isDragging ? 'shadow-lg ring-2 ring-indigo-400 rotate-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight">
          {company_name}
        </h3>
        <span className={`flex-shrink-0 w-7 h-7 rounded-full ${ownerColor.bg} text-white text-xs font-medium flex items-center justify-center`}>
          {getInitials(owner)}
        </span>
      </div>

      {description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{description}</p>
      )}

      {project_type && (
        <span
          className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#F1F5F9] text-[#475569] border border-gray-200"
        >
          {getProjectTypeLabel(project_type)}
        </span>
      )}

      {opportunity.next_action && (
        <div className="mt-3 bg-[#F8FAFC] rounded p-2 border border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
            Next Action
          </p>
          <p className="text-sm text-gray-700 line-clamp-2">
            {opportunity.next_action}
          </p>
        </div>
      )}
    </div>
  )
}

export default OpportunityCard
