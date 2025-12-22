import { useState, useEffect } from 'react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ActivityHeatmap() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/analytics/activity-heatmap')
        const result = await res.json()
        setData(result)
      } catch (error) {
        console.error('Error fetching activity heatmap:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Build 12-week grid
  const getWeeksData = () => {
    const weeks = []
    const today = new Date()

    // Start from 12 weeks ago
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - 84) // 12 weeks
    startDate.setDate(startDate.getDate() - startDate.getDay()) // Start from Sunday

    for (let week = 0; week < 12; week++) {
      const weekData = []
      for (let day = 0; day < 7; day++) {
        const currentDate = new Date(startDate)
        currentDate.setDate(startDate.getDate() + week * 7 + day)

        const dateStr = currentDate.toISOString().split('T')[0]
        const activity = data?.find((d) => d.date === dateStr)
        const count = activity ? parseInt(activity.count) : 0

        weekData.push({
          date: currentDate,
          count,
          dateStr,
        })
      }
      weeks.push(weekData)
    }

    return weeks
  }

  const getIntensityColor = (count) => {
    if (count === 0) return 'bg-gray-100'
    if (count <= 1) return 'bg-teal-200'
    if (count <= 3) return 'bg-teal-400'
    if (count <= 5) return 'bg-teal-500'
    return 'bg-teal-600'
  }

  const weeks = data ? getWeeksData() : []
  const totalActivities = data?.reduce((sum, d) => sum + parseInt(d.count), 0) || 0

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-32 bg-gray-100 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Activity Heatmap</h3>
        <span className="text-sm text-gray-500">{totalActivities} activities in 12 weeks</span>
      </div>

      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-1 pr-2">
          {DAYS.map((day, i) => (
            <div key={day} className="h-3 text-xs text-gray-400 flex items-center">
              {i % 2 === 1 ? day : ''}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="flex gap-1 flex-1">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-1">
              {week.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  className={`w-3 h-3 rounded-sm ${getIntensityColor(day.count)} transition-colors cursor-pointer`}
                  title={`${day.dateStr}: ${day.count} activities`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
        <span className="text-xs text-gray-400">Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm bg-gray-100"></div>
          <div className="w-3 h-3 rounded-sm bg-teal-200"></div>
          <div className="w-3 h-3 rounded-sm bg-teal-400"></div>
          <div className="w-3 h-3 rounded-sm bg-teal-500"></div>
          <div className="w-3 h-3 rounded-sm bg-teal-600"></div>
        </div>
        <span className="text-xs text-gray-400">More</span>
      </div>
    </div>
  )
}

export default ActivityHeatmap
