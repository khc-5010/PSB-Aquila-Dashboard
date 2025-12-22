const SOURCE_COLORS = [
  '#0D9488', // teal-600
  '#3B82F6', // blue-500
  '#8B5CF6', // violet-500
  '#F59E0B', // amber-500
  '#EC4899', // pink-500
  '#10B981', // emerald-500
  '#6366F1', // indigo-500
]

function LeadSources({ data, loading }) {
  const maxCount = Math.max(...(data?.map((r) => parseInt(r.count)) || [1]), 1)

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Lead Sources</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <p className="text-sm">No lead source data</p>
            <p className="text-xs text-gray-300">Add sources to opportunities to track</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Lead Sources</h3>
      <div className="space-y-3">
        {data.map((row, index) => {
          const count = parseInt(row.count)
          const widthPercent = (count / maxCount) * 100
          const color = SOURCE_COLORS[index % SOURCE_COLORS.length]

          return (
            <div key={row.source}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-700">{row.source || 'Unknown'}</span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default LeadSources
