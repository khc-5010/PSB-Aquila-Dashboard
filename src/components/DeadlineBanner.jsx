import { useState, useEffect } from 'react'

function DeadlineBanner() {
  const [deadlines, setDeadlines] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEvents, setShowEvents] = useState(false)

  useEffect(() => {
    fetch('/api/key-dates')
      .then(res => res.json())
      .then(data => {
        // Only show deadlines that are yellow, red, or active urgency
        setDeadlines(data.deadlines?.filter(d => ['red', 'yellow', 'active'].includes(d.urgency)) || [])
        // Show upcoming events (blue or higher)
        setEvents(data.events?.filter(d => ['red', 'yellow', 'blue'].includes(d.urgency)) || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch key dates:', err)
        setLoading(false)
      })
  }, [])

  if (loading || (deadlines.length === 0 && events.length === 0)) {
    return null
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const urgencyStyles = {
    red: {
      banner: 'bg-red-50 border-red-300',
      text: 'text-red-800',
      badge: 'bg-red-100 text-red-700'
    },
    yellow: {
      banner: 'bg-yellow-50 border-yellow-300',
      text: 'text-yellow-800',
      badge: 'bg-yellow-100 text-yellow-700'
    },
    blue: {
      banner: 'bg-blue-50 border-blue-300',
      text: 'text-blue-800',
      badge: 'bg-blue-100 text-blue-700'
    },
    active: {
      banner: 'bg-orange-50 border-orange-300',
      text: 'text-orange-800',
      badge: 'bg-orange-100 text-orange-700'
    }
  }

  const getUrgencyIcon = (urgency) => {
    switch (urgency) {
      case 'red':
        return (
          <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" />
          </svg>
        )
      case 'yellow':
        return (
          <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" />
          </svg>
        )
      case 'active':
        return (
          <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  return (
    <div className="space-y-0">
      {/* Critical Deadlines */}
      {deadlines.map(deadline => {
        const style = urgencyStyles[deadline.urgency] || urgencyStyles.yellow
        return (
          <div
            key={deadline.id}
            className={`${style.banner} border-l-4 px-4 py-2 flex items-center gap-3`}
          >
            {getUrgencyIcon(deadline.urgency)}
            <div className="flex-1">
              <span className={`font-semibold ${style.text}`}>
                {deadline.name}:
              </span>
              <span className={`ml-2 ${style.text}`}>
                {formatDate(deadline.calculated_date)}
                {deadline.calculated_end_date && ` - ${formatDate(deadline.calculated_end_date)}`}
                {deadline.is_active
                  ? ' — Currently active'
                  : deadline.days_until > 0
                    ? ` — ${deadline.days_until} days remaining`
                    : ' — Past'
                }
              </span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${style.badge}`}>
              {deadline.priority === 1 ? 'CRITICAL' : 'IMPORTANT'}
            </span>
          </div>
        )
      })}

      {/* Upcoming Events Toggle */}
      {events.length > 0 && (
        <div className="bg-gray-50 border-l-4 border-gray-300 px-4 py-2">
          <button
            onClick={() => setShowEvents(!showEvents)}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors w-full"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-medium">
              Upcoming Events ({events.length})
            </span>
            <svg
              className={`w-4 h-4 ml-auto transition-transform ${showEvents ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showEvents && (
            <div className="mt-2 space-y-2 pt-2 border-t border-gray-200">
              {events.map(event => (
                <div key={event.id} className="flex items-start gap-3 text-sm">
                  <span className="text-gray-400 min-w-[60px]">
                    {formatDate(event.calculated_date)}
                  </span>
                  <div className="flex-1">
                    <span className="font-medium text-gray-800">{event.name}</span>
                    {event.action_suggestion && (
                      <p className="text-gray-500 text-xs mt-0.5">{event.action_suggestion}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {event.days_until}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DeadlineBanner
