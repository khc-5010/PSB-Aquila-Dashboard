import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { PROJECT_TYPES } from '../../constants/pipeline'

function ConvertToOpportunityModal({ prospect, onClose, onSuccess }) {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    project_type: '',
    owner: user?.name || '',
    description: '',
    est_value: '',
    next_action: '',
    notes: '',
  })

  // Fetch users for owner dropdown
  useEffect(() => {
    fetch('/api/auth?action=list-users')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const active = (Array.isArray(data) ? data : []).filter(u => u.is_active)
        setUsers(active)
      })
      .catch(() => {})
  }, [])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.project_type) {
      setError('Project type is required')
      return
    }
    if (!form.owner) {
      setError('Owner is required')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // 1. Create opportunity
      const oppRes = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: prospect.company,
          project_type: form.project_type,
          owner: form.owner,
          description: form.description || null,
          est_value: form.est_value ? parseFloat(form.est_value) : null,
          next_action: form.next_action || null,
          stage: 'channel_routing',
          source_prospect_id: prospect.id,
          source: 'Prospect Pipeline',
        }),
      })

      if (!oppRes.ok) {
        const data = await oppRes.json()
        throw new Error(data.error || 'Failed to create opportunity')
      }

      // 2. Update prospect status to Converted (only if not already)
      if (prospect.prospect_status !== 'Converted') {
        await fetch(`/api/prospects?id=${prospect.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prospect_status: 'Converted',
            last_edited_by: user?.name || 'Unknown',
          }),
        })
      }

      // 3. Log initial stage transition
      const opp = await oppRes.json()
      await fetch('/api/stage-transitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opp.id,
          from_stage: null,
          to_stage: 'channel_routing',
          transitioned_by: user?.name || 'system',
        }),
      })

      onSuccess?.(opp)
      onClose()
    } catch (err) {
      console.error('Conversion error:', err)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="bg-[#041E42] px-6 py-4 rounded-t-xl">
            <h2 className="text-lg font-semibold text-white">Promote to Pipeline</h2>
            <p className="text-sm text-white/60 mt-0.5">
              Creating opportunity for <span className="text-white font-medium">{prospect.company}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Company name (read-only) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Company</label>
              <div className="text-sm font-medium text-gray-900 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                {prospect.company}
              </div>
            </div>

            {/* Project Type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Project Type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.project_type}
                onChange={(e) => handleChange('project_type', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                required
              >
                <option value="">Select project type...</option>
                {PROJECT_TYPES.map(pt => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label} ({pt.lead})
                  </option>
                ))}
              </select>
            </div>

            {/* Owner */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Owner <span className="text-red-500">*</span>
              </label>
              <select
                value={form.owner}
                onChange={(e) => handleChange('owner', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                required
              >
                <option value="">Select owner...</option>
                {users.map(u => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Description / Scope
              </label>
              <textarea
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
                placeholder="Describe the opportunity scope..."
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
              />
            </div>

            {/* Estimated Value */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Estimated Value ($)
              </label>
              <input
                type="number"
                value={form.est_value}
                onChange={(e) => handleChange('est_value', e.target.value)}
                placeholder="e.g. 50000"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
              />
            </div>

            {/* Next Action */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Next Action
              </label>
              <input
                type="text"
                value={form.next_action}
                onChange={(e) => handleChange('next_action', e.target.value)}
                placeholder="What's the immediate next step?"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Opportunity'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default ConvertToOpportunityModal
