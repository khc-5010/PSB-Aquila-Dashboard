const GROUP_COLORS = {
  'Group 1': 'bg-green-100 text-green-700 border-green-300',
  'Group 2': 'bg-blue-100 text-blue-700 border-blue-300',
  'Time-Sensitive': 'bg-amber-100 text-amber-700 border-amber-300',
  'Infrastructure': 'bg-purple-100 text-purple-700 border-purple-300',
  'Unassigned': 'bg-gray-100 text-gray-500 border-gray-300',
}

const GROUP_DOTS = {
  'Group 1': 'bg-green-600',
  'Group 2': 'bg-blue-600',
  'Time-Sensitive': 'bg-amber-500',
  'Infrastructure': 'bg-purple-600',
  'Unassigned': 'bg-gray-400',
}

function OutreachGroupBadge({ group, size = 'sm' }) {
  const label = group || 'Unassigned'
  const colors = GROUP_COLORS[label] || GROUP_COLORS['Unassigned']
  const dot = GROUP_DOTS[label] || GROUP_DOTS['Unassigned']

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs'
    : 'px-3 py-1 text-sm'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${colors} ${sizeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

export default OutreachGroupBadge
