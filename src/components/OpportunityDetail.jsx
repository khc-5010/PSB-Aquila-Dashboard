import { useState, useEffect } from 'react'
import EditOpportunityModal from './EditOpportunityModal'

// Engagement level styling for dynamic alerts
const alertStyles = {
  A: { // Approve - most urgent
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: null, // Using SVG instead
    iconColor: 'text-red-600',
    iconBg: 'bg-red-100',
    label: 'APPROVAL REQUIRED'
  },
  C: { // Consult
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: null,
    iconColor: 'text-yellow-600',
    iconBg: 'bg-yellow-100',
    label: 'CONSULT'
  },
  I: { // Inform
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: null,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    label: 'INFORM'
  },
  O: { // Optional
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: null,
    iconColor: 'text-gray-500',
    iconBg: 'bg-gray-100',
    label: 'OPTIONAL'
  }
}

function OpportunityDetail({ opportunity, onClose, onUpdate }) {
  const [activities, setActivities] = useState([])
  const [loadingActivities, setLoadingActivities] = useState(false)

  // Dynamic alerts state
  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(false)

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)

  // Log Activity modal state
  const [showLogModal, setShowLogModal] = useState(false)
  const [activityText, setActivityText] = useState('')
  const [createdBy, setCreatedBy] = useState('Kyle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Next Action editing state
  const [isEditingNextAction, setIsEditingNextAction] = useState(false)
  const [nextActionValue, setNextActionValue] = useState('')
  const [isSavingNextAction, setIsSavingNextAction] = useState(false)

  // Key Dates state
  const [keyDates, setKeyDates] = useState([])
  const [keyDatesLoading, setKeyDatesLoading] = useState(false)
  const [hasMoreDates, setHasMoreDates] = useState(false)
  const [showAllDates, setShowAllDates] = useState(false)
  const [totalDatesCount, setTotalDatesCount] = useState(0)

  // Fetch activities function (reusable)
  const fetchActivities = async () => {
    if (!opportunity?.id) return
    setLoadingActivities(true)
    try {
      const res = await fetch(`/api/activities?opportunity_id=${opportunity.id}`)
      const data = res.ok ? await res.json() : []
      setActivities(Array.isArray(data) ? data : [])
    } catch {
      setActivities([])
    } finally {
      setLoadingActivities(false)
    }
  }

  // Fetch activities when opportunity changes
  useEffect(() => {
    fetchActivities()
  }, [opportunity?.id])

  // Fetch dynamic alerts
  const fetchAlerts = async () => {
    if (!opportunity?.id) return
    setAlertsLoading(true)
    try {
      const res = await fetch(`/api/opportunities/${opportunity.id}/alerts`)
      const data = res.ok ? await res.json() : { alerts: [] }
      setAlerts(data.alerts || [])
    } catch (err) {
      console.error('Failed to fetch alerts:', err)
      setAlerts([])
    } finally {
      setAlertsLoading(false)
    }
  }

  // Fetch alerts when opportunity or relevant fields change
  useEffect(() => {
    fetchAlerts()
  }, [opportunity?.id, opportunity?.stage, opportunity?.project_type, opportunity?.est_value])

  // Fetch key dates for this opportunity
  const fetchKeyDates = async (fetchAll = false) => {
    if (!opportunity?.id) return
    setKeyDatesLoading(true)
    try {
      const url = fetchAll
        ? `/api/key-dates/for-opportunity/${opportunity.id}?all=true`
        : `/api/key-dates/for-opportunity/${opportunity.id}`
      const res = await fetch(url)
      const data = res.ok ? await res.json() : { dates: [], hasMore: false, totalCount: 0 }
      setKeyDates(data.dates || [])
      setHasMoreDates(data.hasMore || false)
      setTotalDatesCount(data.totalCount || 0)
    } catch (err) {
      console.error('Failed to fetch key dates:', err)
      setKeyDates([])
      setHasMoreDates(false)
      setTotalDatesCount(0)
    } finally {
      setKeyDatesLoading(false)
    }
  }

  // Fetch key dates when opportunity changes
  useEffect(() => {
    setShowAllDates(false)
    fetchKeyDates()
  }, [opportunity?.id, opportunity?.project_type])

  // Handle dismiss alert
  const handleDismissAlert = async (ruleId) => {
    try {
      await fetch(`/api/opportunities/${opportunity.id}/alerts/${ruleId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed_by: 'kyle' }) // TODO: get from auth context
      })
      // Remove from local state immediately for instant feedback
      setAlerts(prev => prev.filter(a => a.id !== ruleId))
    } catch (err) {
      console.error('Failed to dismiss alert:', err)
    }
  }

  // Reset next action editing state when opportunity changes
  useEffect(() => {
    setIsEditingNextAction(false)
    setNextActionValue(opportunity?.next_action || '')
  }, [opportunity?.id, opportunity?.next_action])

  // Format currency
  const formatCurrency = (value) => {
    if (!value) return 'Not specified'
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return 'Not specified'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num)
  }

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Get icon SVG based on engagement level
  const getAlertIcon = (level) => {
    switch (level) {
      case 'A': // Approve - exclamation
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      case 'C': // Consult - chat
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )
      case 'I': // Inform - info
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default: // Optional - circle
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  // Get initials from name
  const getInitials = (name) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Owner color mapping
  const ownerColors = {
    Kyle: 'bg-[#7C3AED] text-white',
    Duane: 'bg-[#0891B2] text-white',
    Steve: 'bg-[#D97706] text-white',
  }
  const getOwnerColorClass = (name) => ownerColors[name] || 'bg-indigo-100 text-indigo-700'

  // Derive contacts from owner (MVP - simplified)
  const getContacts = () => {
    const owner = opportunity?.owner || 'Unassigned'
    return {
      aquilaLead: owner,
      industryLead: 'TBD',
      psbContact: 'TBD',
      researchLead: opportunity?.project_type === 'Research Agreement' ? 'Alicyn Rhoades' : 'TBD',
    }
  }

  const contacts = getContacts()

  // Handle Log Activity submission
  const handleLogActivity = async () => {
    if (!activityText.trim()) return

    setIsSubmitting(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opportunity.id,
          description: activityText.trim(),
          created_by: createdBy,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to save activity')
      }

      // Success - close modal and refresh timeline
      setShowLogModal(false)
      setActivityText('')
      setSubmitError('')
      fetchActivities()
    } catch (err) {
      setSubmitError(err.message || 'Failed to save activity')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Next Action save
  const handleSaveNextAction = async () => {
    const trimmedValue = nextActionValue.trim()
    const originalValue = opportunity.next_action || ''

    // No change, just exit edit mode
    if (trimmedValue === originalValue) {
      setIsEditingNextAction(false)
      return
    }

    setIsSavingNextAction(true)

    // Optimistic update
    if (onUpdate) {
      onUpdate({ ...opportunity, next_action: trimmedValue || null })
    }
    setIsEditingNextAction(false)

    try {
      const res = await fetch(`/api/opportunities/${opportunity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_action: trimmedValue || null }),
      })

      if (!res.ok) throw new Error('Failed to update')
    } catch (error) {
      console.error('Failed to update next action:', error)
      // Revert on failure
      if (onUpdate) {
        onUpdate({ ...opportunity, next_action: originalValue || null })
      }
      setNextActionValue(originalValue)
    } finally {
      setIsSavingNextAction(false)
    }
  }

  // Handle key press in next action input
  const handleNextActionKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveNextAction()
    } else if (e.key === 'Escape') {
      setIsEditingNextAction(false)
      setNextActionValue(opportunity?.next_action || '')
    }
  }

  // Don't render if no opportunity
  if (!opportunity) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className="fixed right-0 top-0 h-full w-[400px] bg-white shadow-xl z-50 flex flex-col transform transition-transform duration-300 ease-out">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">
                {opportunity.company_name}
              </h2>
              {opportunity.description && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                  {opportunity.description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1 -mr-1 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close panel"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Details Grid */}
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Project Type</dt>
                <dd className="mt-1 text-sm text-gray-900">{opportunity.project_type || 'Not specified'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Owner</dt>
                <dd className="mt-1 text-sm text-gray-900">{opportunity.owner || 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Est. Value</dt>
                <dd className="mt-1 text-sm text-gray-900 font-medium">{formatCurrency(opportunity.est_value)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Source</dt>
                <dd className="mt-1 text-sm text-gray-900">{opportunity.source || 'Not specified'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">PSB Relationship</dt>
                <dd className="mt-1 text-sm text-gray-900">{opportunity.psb_relationship || 'Not specified'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Stage</dt>
                <dd className="mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 capitalize">
                    {opportunity.stage || 'Unknown'}
                  </span>
                </dd>
              </div>
            </div>
          </div>

          {/* Next Action */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Next Action
              </h3>
              {!isEditingNextAction && (
                <button
                  onClick={() => {
                    setNextActionValue(opportunity.next_action || '')
                    setIsEditingNextAction(true)
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>
            {isEditingNextAction ? (
              <div>
                <textarea
                  value={nextActionValue}
                  onChange={(e) => setNextActionValue(e.target.value)}
                  onBlur={handleSaveNextAction}
                  onKeyDown={handleNextActionKeyDown}
                  placeholder="What's the next step for this opportunity?"
                  rows={2}
                  autoFocus
                  disabled={isSavingNextAction}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Press Enter to save, Escape to cancel
                </p>
              </div>
            ) : (
              <p className={`text-sm ${opportunity.next_action ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                {opportunity.next_action || 'No next action set'}
              </p>
            )}
          </div>

          {/* Description */}
          {opportunity.description && (
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Description
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {opportunity.description}
              </p>
            </div>
          )}

          {/* Dynamic Stakeholder Alerts */}
          {(alerts.length > 0 || alertsLoading) && (
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Stakeholder Alerts {alerts.length > 0 && `(${alerts.length})`}
              </h3>
              {alertsLoading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-16 bg-gray-100 rounded-lg"></div>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map(alert => {
                    const style = alertStyles[alert.engagement_level] || alertStyles.I
                    return (
                      <div
                        key={alert.id}
                        className={`${style.bg} ${style.border} border rounded-lg p-3 relative`}
                      >
                        <button
                          onClick={() => handleDismissAlert(alert.id)}
                          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-sm p-1 rounded hover:bg-white/50 transition-colors"
                          title="Dismiss alert"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <div className="flex items-start gap-2">
                          <span className={`flex-shrink-0 w-6 h-6 rounded-full ${style.iconBg} ${style.iconColor} flex items-center justify-center`}>
                            {getAlertIcon(alert.engagement_level)}
                          </span>
                          <div className="flex-1 pr-6">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-semibold uppercase tracking-wide ${style.iconColor}`}>
                                {style.label}
                              </span>
                              {alert.category && (
                                <>
                                  <span className="text-xs text-gray-400">•</span>
                                  <span className="text-xs text-gray-500 capitalize">{alert.category}</span>
                                </>
                              )}
                            </div>
                            <div className="font-medium text-gray-900">
                              {alert.stakeholder_name}
                              {alert.stakeholder_role && (
                                <span className="font-normal text-gray-500"> — {alert.stakeholder_role}</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">
                              {alert.alert_message}
                            </div>
                            {alert.stakeholder_email && (
                              <a
                                href={`mailto:${alert.stakeholder_email}`}
                                className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                              >
                                {alert.stakeholder_email}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Key Dates */}
          {(keyDates.length > 0 || keyDatesLoading) && (
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Key Dates {totalDatesCount > 0 && `(${totalDatesCount})`}
              </h3>
              {keyDatesLoading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-16 bg-gray-100 rounded-lg"></div>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {keyDates.map(date => {
                      const isDeadline = date.date_type === 'deadline' || date.date_type === 'shutdown'
                      const urgencyColors = {
                        red: { bg: 'bg-red-50', text: 'text-red-600' },
                        yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
                        blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
                        active: { bg: 'bg-orange-50', text: 'text-orange-600' },
                        none: { bg: 'bg-gray-50', text: 'text-gray-500' }
                      }
                      const color = urgencyColors[date.urgency] || urgencyColors.none

                      return (
                        <div key={date.id} className={`rounded-lg p-3 ${color.bg}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${color.text}`}>
                                  {new Date(date.calculated_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                  {date.calculated_end_date && (
                                    <> - {new Date(date.calculated_end_date).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric'
                                    })}</>
                                  )}
                                </span>
                                {isDeadline && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/50 text-gray-600">
                                    {date.date_type === 'shutdown' ? 'SHUTDOWN' : 'DEADLINE'}
                                  </span>
                                )}
                              </div>
                              <p className={`text-sm font-medium mt-0.5 ${color.text}`}>
                                {date.name}
                              </p>
                              {date.warning_message && date.urgency !== 'none' && (
                                <p className="text-xs mt-1 text-gray-600">
                                  {date.warning_message}
                                </p>
                              )}
                              {date.is_opportunity && date.action_suggestion && (
                                <p className="text-xs mt-1 text-gray-600 italic">
                                  {date.action_suggestion}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <span className={`text-sm font-bold ${color.text}`}>
                                {date.is_active ? 'NOW' : date.days_until > 0 ? `${date.days_until}d` : 'Past'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {hasMoreDates && !showAllDates && (
                    <button
                      onClick={() => {
                        setShowAllDates(true)
                        fetchKeyDates(true)
                      }}
                      className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                    >
                      View all upcoming dates
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Activity Timeline */}
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Activity Timeline
            </h3>
            {loadingActivities ? (
              <div className="space-y-3">
                <div className="animate-pulse flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-gray-200 mt-1.5"></div>
                  <div className="flex-1">
                    <div className="h-3 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </div>
              </div>
            ) : activities.length > 0 ? (
              <div className="space-y-4">
                {activities.map((activity, index) => (
                  <div key={activity.id || index} className="flex gap-3">
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400">
                        {formatDate(activity.activity_date)}
                      </p>
                      <p className="text-sm text-gray-700 mt-0.5">
                        {activity.description || activity.event}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No activity recorded yet</p>
            )}
          </div>

          {/* Key Contacts */}
          <div className="px-6 py-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Key Contacts
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 text-green-700 text-xs font-medium flex items-center justify-center">
                  {getInitials(contacts.industryLead)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Industry Lead</p>
                  <p className="text-sm text-gray-900 truncate">{contacts.industryLead}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`flex-shrink-0 w-8 h-8 rounded-full ${getOwnerColorClass(contacts.aquilaLead)} text-xs font-medium flex items-center justify-center`}>
                  {getInitials(contacts.aquilaLead)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Aquila Lead</p>
                  <p className="text-sm text-gray-900 truncate">{contacts.aquilaLead}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center">
                  {getInitials(contacts.psbContact)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">PSB Contact</p>
                  <p className="text-sm text-gray-900 truncate">{contacts.psbContact}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-xs font-medium flex items-center justify-center">
                  {getInitials(contacts.researchLead)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Research Lead</p>
                  <p className="text-sm text-gray-900 truncate">{contacts.researchLead}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3">
          <button
            onClick={() => setShowEditModal(true)}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => setShowLogModal(true)}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Log Activity
          </button>
        </div>
      </div>

      {/* Log Activity Modal */}
      {showLogModal && (
        <>
          {/* Modal Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={() => {
              if (!isSubmitting) {
                setShowLogModal(false)
                setActivityText('')
                setSubmitError('')
              }
            }}
          />

          {/* Modal Content */}
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Log Activity</h3>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-4 space-y-4">
                {/* Activity Description */}
                <div>
                  <label htmlFor="activity-text" className="block text-sm font-medium text-gray-700 mb-1">
                    Activity Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="activity-text"
                    rows={4}
                    value={activityText}
                    onChange={(e) => setActivityText(e.target.value)}
                    placeholder="Describe the activity..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Created By */}
                <div>
                  <label htmlFor="created-by" className="block text-sm font-medium text-gray-700 mb-1">
                    Created by
                  </label>
                  <select
                    id="created-by"
                    value={createdBy}
                    onChange={(e) => setCreatedBy(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={isSubmitting}
                  >
                    <option value="Kyle">Kyle</option>
                    <option value="Duane">Duane</option>
                    <option value="Steve">Steve</option>
                  </select>
                </div>

                {/* Error Message */}
                {submitError && (
                  <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    {submitError}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowLogModal(false)
                    setActivityText('')
                    setSubmitError('')
                  }}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogActivity}
                  disabled={isSubmitting || !activityText.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Opportunity Modal */}
      {showEditModal && (
        <EditOpportunityModal
          opportunity={opportunity}
          onClose={() => setShowEditModal(false)}
          onUpdate={(updated) => {
            onUpdate(updated)
            setShowEditModal(false)
          }}
        />
      )}
    </>
  )
}

export default OpportunityDetail
