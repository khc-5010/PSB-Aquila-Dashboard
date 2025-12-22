function DeadlineCalendar({ data, loading }) {
  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getDaysUntil = (dateStr) => {
    const date = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = Math.ceil((date - today) / (1000 * 60 * 60 * 24))
    return diff
  }

  const getUrgencyStyle = (daysUntil) => {
    if (daysUntil < 0) return { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' }
    if (daysUntil <= 7) return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' }
    if (daysUntil <= 30) return { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' }
    if (daysUntil <= 60) return { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' }
    return { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-24 bg-gray-100 rounded"></div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Deadlines</h3>
        <div className="flex items-center justify-center h-24 text-gray-400">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">No upcoming deadlines</p>
          </div>
        </div>
      </div>
    )
  }

  // Filter to only future deadlines and sort
  const futureDeadlines = data
    .filter((d) => getDaysUntil(d.deadline_date) >= -7)
    .sort((a, b) => new Date(a.deadline_date) - new Date(b.deadline_date))

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Deadlines</h3>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {futureDeadlines.map((deadline) => {
            const daysUntil = getDaysUntil(deadline.deadline_date)
            const style = getUrgencyStyle(daysUntil)

            return (
              <div key={deadline.id} className="relative pl-10">
                {/* Dot on timeline */}
                <div className={`absolute left-2.5 w-3 h-3 rounded-full ${style.dot}`} />

                <div className={`p-3 rounded-lg ${style.bg}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`text-sm font-medium ${style.text}`}>{deadline.name}</p>
                      {deadline.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{deadline.description}</p>
                      )}
                      {deadline.applies_to && deadline.applies_to.length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {deadline.applies_to.map((type) => (
                            <span key={type} className="text-xs bg-white/60 px-1.5 py-0.5 rounded text-gray-600">
                              {type.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatDate(deadline.deadline_date)}</p>
                      <p className={`text-xs ${style.text}`}>
                        {daysUntil < 0
                          ? `${Math.abs(daysUntil)} days ago`
                          : daysUntil === 0
                          ? 'Today'
                          : daysUntil === 1
                          ? 'Tomorrow'
                          : `in ${daysUntil} days`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default DeadlineCalendar
