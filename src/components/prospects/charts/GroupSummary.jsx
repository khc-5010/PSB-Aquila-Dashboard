const GROUP_CONFIG = {
  'Group 1': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', accent: 'bg-green-500' },
  'Group 2': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', accent: 'bg-blue-500' },
  'Time-Sensitive': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', accent: 'bg-amber-500' },
  'Infrastructure': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', accent: 'bg-purple-500' },
  'Unassigned': { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500', accent: 'bg-gray-400' },
}

const GROUP_ORDER = ['Group 1', 'Group 2', 'Time-Sensitive', 'Infrastructure', 'Unassigned']

function GroupSummary({ groups, groupTopCompanies, loading, onGroupClick }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
            <div className="h-8 bg-gray-100 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-full" />
          </div>
        ))}
      </div>
    )
  }

  // Build lookup maps
  const countMap = {}
  for (const row of (groups || [])) {
    countMap[row.outreach_group || 'Unassigned'] = row.count
  }
  const topMap = {}
  for (const row of (groupTopCompanies || [])) {
    topMap[row.outreach_group || 'Unassigned'] = row
  }

  const total = Object.values(countMap).reduce((s, c) => s + c, 0)

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {GROUP_ORDER.map(group => {
        const count = countMap[group] || 0
        const top = topMap[group]
        const config = GROUP_CONFIG[group]
        const pct = total > 0 ? Math.round((count / total) * 100) : 0

        return (
          <button
            key={group}
            onClick={() => onGroupClick?.(group)}
            className={`${config.bg} ${config.border} border rounded-xl p-5 text-left hover:shadow-md transition-all cursor-pointer group`}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className={`text-sm font-semibold ${config.text}`}>{group}</h4>
              <div className={`w-2 h-2 rounded-full ${config.accent}`} />
            </div>
            <div className={`text-3xl font-bold ${config.text} mb-1`}>{count}</div>
            <div className="text-xs text-gray-500 mb-2">{pct}% of pipeline</div>
            {top && (
              <div className="text-xs text-gray-600 truncate group-hover:text-gray-800" title={top.company}>
                Top: {top.company}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default GroupSummary
