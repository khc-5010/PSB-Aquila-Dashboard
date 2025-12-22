const TYPE_COLORS = {
  'TBD': '#9CA3AF',
  'Research Agreement': '#8B5CF6',
  'Senior Design': '#3B82F6',
  'Consulting Engagement': '#0D9488',
  'Workforce Training': '#F59E0B',
  'Alliance Membership': '#EC4899',
  'Does Not Fit': '#EF4444',
}

function WinRateChart({ data, loading }) {
  const getWinRateColor = (rate) => {
    if (rate >= 70) return 'text-green-600'
    if (rate >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Win Rate by Type</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">No closed deals yet</p>
            <p className="text-xs text-gray-300">Win rates appear after opportunities are closed</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Win Rate by Type</h3>
      <div className="space-y-3">
        {data.map((row) => {
          const winRate = parseInt(row.win_rate) || 0
          const color = TYPE_COLORS[row.project_type] || '#9CA3AF'

          return (
            <div key={row.project_type}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-700 truncate max-w-[140px]" title={row.project_type}>
                  {row.project_type}
                </span>
                <span className={`text-sm font-semibold ${getWinRateColor(winRate)}`}>
                  {winRate}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${winRate}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {row.won} won / {row.total} total
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default WinRateChart
