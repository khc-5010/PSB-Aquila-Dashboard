import { useState, useEffect } from 'react'
import { useAuth, authFetch } from '../../context/AuthContext'
import { PROJECT_TYPES } from '../../constants/pipeline'

// Lightweight pipeline entry. A lead enters the pipeline the moment you commit
// to working it — company is the only hard requirement. Project type, value,
// and scope are deferred until they're actually knowable (Channel Routing on).
// Partners (Kistler, Beaumont) skip project type entirely; it's a client concept.
function ConvertToOpportunityModal({ prospect, onClose, onSuccess }) {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    lead_type: 'client',      // 'client' | 'partner'
    stage: 'on_deck',         // 'on_deck' (default) | 'outreach' (already contacted)
    owner: user?.name || '',  // account owner — stable, optional
    project_type: '',         // client-only, optional
    next_action: '',          // optional forward step
    first_contact: '',        // optional — logged as an activity if filled
  })

  // team-members works for any authenticated user (list-users is admin-only).
  useEffect(() => {
    authFetch('/api/auth?action=team-members')
      .then(r => r.ok ? r.json() : [])
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      // 1. Create the opportunity (company is the only required field).
      const oppRes = await authFetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: prospect.company,
          lead_type: form.lead_type,
          stage: form.stage,
          owner: form.owner || null,
          // partners never carry a molder project type
          project_type: form.lead_type === 'partner' ? null : (form.project_type || null),
          next_action: form.next_action || null,
          source_prospect_id: prospect.id,
          source: 'Prospect Pipeline',
        }),
      })

      if (!oppRes.ok) {
        const data = await oppRes.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to add to pipeline')
      }

      const opp = await oppRes.json()

      // 2. Mark the prospect Converted (best-effort — the opportunity already
      //    exists, so a failure here shouldn't roll the whole thing back, but
      //    we surface it instead of swallowing it silently).
      if (prospect.prospect_status !== 'Converted') {
        const statusRes = await authFetch(`/api/prospects?id=${prospect.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prospect_status: 'Converted',
            last_edited_by: user?.name || 'Unknown',
          }),
        })
        if (!statusRes.ok) console.warn('Prospect status update failed after promote')
      }

      // 3. Log the initial stage transition (best-effort).
      const transRes = await authFetch('/api/stage-transitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opp.id,
          from_stage: null,
          to_stage: form.stage,
          transitioned_by: user?.name || 'system',
        }),
      })
      if (!transRes.ok) console.warn('Stage transition log failed after promote')

      // 4. Optional first-contact note → activity log (best-effort).
      if (form.first_contact.trim()) {
        const actRes = await authFetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            opportunity_id: opp.id,
            description: form.first_contact.trim(),
            created_by: user?.name || 'Unknown',
          }),
        })
        if (!actRes.ok) console.warn('First-contact log failed after promote')
      }

      onSuccess?.(opp)
      onClose()
    } catch (err) {
      console.error('Add to pipeline error:', err)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const ToggleButton = ({ active, onClick, children }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
        active
          ? 'bg-[#041E42] text-white border-[#041E42]'
          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="bg-[#041E42] px-6 py-4 rounded-t-xl">
            <h2 className="text-lg font-semibold text-white">Add to Pipeline</h2>
            <p className="text-sm text-white/60 mt-0.5">
              Adding <span className="text-white font-medium">{prospect.company}</span> to the pipeline
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Lead type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Lead Type</label>
              <div className="flex gap-2">
                <ToggleButton active={form.lead_type === 'client'} onClick={() => handleChange('lead_type', 'client')}>
                  Client
                </ToggleButton>
                <ToggleButton active={form.lead_type === 'partner'} onClick={() => handleChange('lead_type', 'partner')}>
                  Partner
                </ToggleButton>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {form.lead_type === 'partner'
                  ? 'Vendor / ecosystem partner (e.g. Kistler, Beaumont) — no project type.'
                  : 'A molder/converter that could become a project.'}
              </p>
            </div>

            {/* Entry stage */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Starting Stage</label>
              <div className="flex gap-2">
                <ToggleButton active={form.stage === 'on_deck'} onClick={() => handleChange('stage', 'on_deck')}>
                  On Deck
                </ToggleButton>
                <ToggleButton active={form.stage === 'outreach'} onClick={() => handleChange('stage', 'outreach')}>
                  Outreach
                </ToggleButton>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {form.stage === 'outreach'
                  ? "Already reached out — drop straight into Outreach."
                  : 'Committed but not contacted yet. Move to Outreach when the first email goes.'}
              </p>
            </div>

            {/* Owner */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Account Owner</label>
              <select
                value={form.owner}
                onChange={(e) => handleChange('owner', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.name} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Project type (clients only) */}
            {form.lead_type === 'client' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                  Project Type <span className="text-gray-400 normal-case">(optional — decide later)</span>
                </label>
                <select
                  value={form.project_type}
                  onChange={(e) => handleChange('project_type', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                >
                  <option value="">Decide later</option>
                  {PROJECT_TYPES.map(pt => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label} ({pt.lead})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Next step (optional) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Next Step <span className="text-gray-400 normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={form.next_action}
                onChange={(e) => handleChange('next_action', e.target.value)}
                placeholder="e.g. Send re-intro on Monday"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
              />
            </div>

            {/* First contact note (optional) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Log First Contact <span className="text-gray-400 normal-case">(optional)</span>
              </label>
              <textarea
                value={form.first_contact}
                onChange={(e) => handleChange('first_contact', e.target.value)}
                rows={2}
                placeholder="e.g. Sent re-intro email cc'ing Brett"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
              />
              <p className="text-xs text-gray-400 mt-1">Saved to the activity log if filled.</p>
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
                {submitting ? 'Adding...' : 'Add to Pipeline'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default ConvertToOpportunityModal
