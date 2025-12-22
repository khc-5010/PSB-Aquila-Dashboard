const STAGE_COLORS = {
  lead: '#8B5CF6',
  qualified: '#3B82F6',
  proposal: '#F59E0B',
  negotiation: '#EAB308',
  active: '#22C55E',
}

function AgingReport({ data, loading }) {
  const getUrgencyColor = (days) => {
    if (days >= 30) return 'text-red-600 bg-red-50'
    if (days >= 14) return 'text-yellow-600 bg-yellow-50'
    return 'text-blue-600 bg-blue-50'
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Stale Opportunities</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">All opportunities are active</p>
            <p className="text-xs text-gray-300">No opportunities older than 7 days without activity</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Stale Opportunities</h3>
        <span className="text-xs text-gray-500">{data.length} need attention</span>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {data.map((row) => {
          const days = Math.round(parseFloat(row.days_since_activity))
          return (
            <div
              key={row.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-1.5 h-8 rounded-full"
                  style={{ backgroundColor: STAGE_COLORS[row.stage] }}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{row.company_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{row.stage}</p>
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${getUrgencyColor(days)}`}>
                {days} days
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AgingReport
