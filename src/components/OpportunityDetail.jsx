import { useState, useEffect } from 'react'

// Stakeholder mapping based on project type
const STAKEHOLDER_ALERTS = {
  'Research Agreement': {
    name: 'Alicyn Rhoades',
    reason: 'Research agreement structure - 4-6 week processing time. Loop in Jennifer Surrena for contracts.',
  },
  'Senior Design': {
    name: 'Dean Lewis',
    reason: 'Senior Design coordinator (dal16@psu.edu). Note: August 15 deadline for fall semester placement.',
  },
  'Consulting Engagement': {
    name: 'Amy Bridger',
    reason: 'Partnership structure review. Aquila-led engagement.',
  },
  'Alliance Membership': {
    name: 'Amy Bridger',
    reason: 'Revenue model and alliance membership discussions.',
  },
  'Workforce Training': {
    name: 'TBD',
    reason: 'Program-specific routing - stakeholder to be determined.',
  },
}

function OpportunityDetail({ opportunity, onClose }) {
  const [activities, setActivities] = useState([])
  const [loadingActivities, setLoadingActivities] = useState(false)

  // Log Activity modal state
  const [showLogModal, setShowLogModal] = useState(false)
  const [activityText, setActivityText] = useState('')
  const [createdBy, setCreatedBy] = useState('Kyle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

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

  // Get stakeholder alert based on project type
  const getStakeholderAlert = () => {
    if (!opportunity?.project_type) return null
    return STAKEHOLDER_ALERTS[opportunity.project_type] || null
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

  const stakeholderAlert = getStakeholderAlert()
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

          {/* Stakeholder Alert */}
          {stakeholderAlert && (
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900">
                      Loop in: {stakeholderAlert.name}
                    </h4>
                    <p className="mt-1 text-sm text-blue-700">
                      {stakeholderAlert.reason}
                    </p>
                  </div>
                </div>
              </div>
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
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium flex items-center justify-center">
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
          <button className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
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
    </>
  )
}

export default OpportunityDetail
