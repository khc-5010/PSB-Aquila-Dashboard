import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const CATEGORY_OPTIONS = ['', 'Converter+Tooling', 'Converter', 'Mold Maker', 'Hot Runner Systems', 'Knowledge Sector', 'Catalog/Standards', 'Strategic Partner']
const PRIORITY_OPTIONS = ['', 'HIGH PRIORITY', 'QUALIFIED', 'WATCH', 'STRATEGIC PARTNER']
const GEO_OPTIONS = ['', 'Tier 1', 'Tier 2', 'Infrastructure']
const GROUP_OPTIONS = ['Unassigned', 'Group 1', 'Group 2', 'Time-Sensitive', 'Infrastructure']
const TOOLING_OPTIONS = ['', 'Yes', 'No', 'N/A']

function AddCompanyModal({ onClose, onSuccess }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    company: '', category: '', city: '', state: '', priority: '',
    geography_tier: '', website: '', notes: '', outreach_group: 'Unassigned',
    also_known_as: '', in_house_tooling: '', employees_approx: '', year_founded: '',
    revenue_est_m: '', ownership_type: '', parent_company: '', decision_location: '',
    source_report: '', engagement_type: '',
    suggested_next_step: '', cwp_contacts: '', psb_connection_notes: '',
  })
  const [showMore, setShowMore] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [nameError, setNameError] = useState(false)

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'company') setNameError(false)
  }

  const handleSubmit = async () => {
    if (!form.company.trim()) {
      setNameError(true)
      return
    }
    setSubmitting(true)
    setError(null)

    const payload = { last_edited_by: user?.name || 'Unknown', added_by: user?.name || 'Unknown' }
    for (const [key, val] of Object.entries(form)) {
      if (val !== '' && val !== null) {
        if (key === 'employees_approx' || key === 'year_founded' || key === 'cwp_contacts') {
          payload[key] = val ? parseInt(val, 10) || null : null
        } else if (key === 'revenue_est_m') {
          payload[key] = val ? parseFloat(val) || null : null
        } else {
          payload[key] = val
        }
      }
    }

    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42]'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0" style={{ backgroundColor: '#041E42' }}>
            <h2 className="text-lg font-semibold text-white">Add Company</h2>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Company Name - required */}
            <div>
              <label className={labelClass}>Company Name *</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => handleChange('company', e.target.value)}
                className={`${inputClass} ${nameError ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                placeholder="Enter company name"
                autoFocus
              />
              {nameError && <p className="text-xs text-red-500 mt-1">Company name is required</p>}
            </div>

            {/* Primary fields - 2-column grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Category</label>
                <select value={form.category} onChange={(e) => handleChange('category', e.target.value)} className={inputClass}>
                  {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Priority</label>
                <select value={form.priority} onChange={(e) => handleChange('priority', e.target.value)} className={inputClass}>
                  {PRIORITY_OPTIONS.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input type="text" value={form.city} onChange={(e) => handleChange('city', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input type="text" value={form.state} onChange={(e) => handleChange('state', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Geography Tier</label>
                <select value={form.geography_tier} onChange={(e) => handleChange('geography_tier', e.target.value)} className={inputClass}>
                  {GEO_OPTIONS.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Outreach Group</label>
                <select value={form.outreach_group} onChange={(e) => handleChange('outreach_group', e.target.value)} className={inputClass}>
                  {GROUP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Website</label>
              <input type="text" value={form.website} onChange={(e) => handleChange('website', e.target.value)} className={inputClass} placeholder="https://..." />
            </div>

            <div>
              <label className={labelClass}>Notes</label>
              <textarea value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} className={`${inputClass} resize-none`} rows={2} />
            </div>

            {/* Collapsible More Details */}
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="flex items-center gap-1 text-xs font-medium text-[#041E42] hover:underline"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showMore ? 'Less Details' : 'More Details'}
            </button>

            {showMore && (
              <div className="space-y-3 border-t border-gray-100 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Also Known As</label>
                    <input type="text" value={form.also_known_as} onChange={(e) => handleChange('also_known_as', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>In-House Tooling</label>
                    <select value={form.in_house_tooling} onChange={(e) => handleChange('in_house_tooling', e.target.value)} className={inputClass}>
                      {TOOLING_OPTIONS.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Employees (Approx)</label>
                    <input type="number" value={form.employees_approx} onChange={(e) => handleChange('employees_approx', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Year Founded</label>
                    <input type="number" value={form.year_founded} onChange={(e) => handleChange('year_founded', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Revenue Est $M</label>
                    <input type="number" step="0.1" value={form.revenue_est_m} onChange={(e) => handleChange('revenue_est_m', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Ownership Type</label>
                    <input type="text" value={form.ownership_type} onChange={(e) => handleChange('ownership_type', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Parent Company</label>
                    <input type="text" value={form.parent_company} onChange={(e) => handleChange('parent_company', e.target.value)} className={inputClass} placeholder="Holding/acquiring entity" />
                  </div>
                  <div>
                    <label className={labelClass}>Decision Location</label>
                    <input type="text" value={form.decision_location} onChange={(e) => handleChange('decision_location', e.target.value)} className={inputClass} placeholder="City, ST" />
                  </div>
                  <div>
                    <label className={labelClass}>Source Report</label>
                    <input type="text" value={form.source_report} onChange={(e) => handleChange('source_report', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Engagement Type</label>
                    <input type="text" value={form.engagement_type} onChange={(e) => handleChange('engagement_type', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>CWP Contacts</label>
                    <input type="number" value={form.cwp_contacts} onChange={(e) => handleChange('cwp_contacts', e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Suggested Next Step</label>
                  <input type="text" value={form.suggested_next_step} onChange={(e) => handleChange('suggested_next_step', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>PSB Connection Notes</label>
                  <textarea value={form.psb_connection_notes} onChange={(e) => handleChange('psb_connection_notes', e.target.value)} className={`${inputClass} resize-none`} rows={2} />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 rounded-b-lg flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#041E42' }}
            >
              {submitting ? 'Adding...' : 'Add Company'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default AddCompanyModal
