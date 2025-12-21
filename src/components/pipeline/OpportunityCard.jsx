function OpportunityCard({ opportunity, onClick }) {
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

  // Color mapping for project types
  const typeColors = {
    'Research Agreement': 'bg-purple-100 text-purple-700',
    'Senior Design': 'bg-blue-100 text-blue-700',
    'Consulting Engagement': 'bg-green-100 text-green-700',
    'Workforce Training': 'bg-orange-100 text-orange-700',
    'Alliance Membership': 'bg-pink-100 text-pink-700',
    'Does Not Fit': 'bg-gray-100 text-gray-500',
  }

  const typeColor = typeColors[project_type] || 'bg-gray-100 text-gray-600'

  return (
    <div
      onClick={() => onClick?.(opportunity)}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-gray-900 text-sm leading-tight">
          {company_name}
        </h3>
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-500 text-white text-xs font-medium flex items-center justify-center">
          {getInitials(owner)}
        </span>
      </div>

      {description && (
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{description}</p>
      )}

      {project_type && (
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeColor}`}
        >
          {project_type}
        </span>
      )}
    </div>
  )
}

export default OpportunityCard
