import { useState, useEffect, useCallback } from 'react'

import OutreachGroupBadge from './OutreachGroupBadge'
import StatusBadge from './StatusBadge'
import ResearchPromptModal from './ResearchPromptModal'
import AttachResearchModal from './AttachResearchModal'
import ResearchBriefPanel from './ResearchBriefPanel'
import ConvertToOpportunityModal from './ConvertToOpportunityModal'

const GROUP_OPTIONS = ['Group 1', 'Group 2', 'Time-Sensitive', 'Infrastructure', 'Unassigned']
const STATUS_OPTIONS = ['Identified', 'Prioritized', 'Research Complete', 'Outreach Ready', 'Converted', 'Nurture']

function displayValue(val) {
  if (val === null || val === undefined || val === '') return '\u2014'
  return String(val)
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-[#041E42]">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

function Field({ label, value, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{displayValue(value)}</dd>
    </div>
  )
}

function EditableField({ label, value, onSave, multiline = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  useEffect(() => {
    setDraft(value || '')
  }, [value])

  const handleSave = () => {
    setEditing(false)
    if (draft !== (value || '')) {
      onSave(draft || null)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) handleSave()
    if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
  }

  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
        {label}
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-blue-500 hover:text-blue-700 text-xs font-normal">
            edit
          </button>
        )}
      </dt>
      <dd className="mt-0.5">
        {editing ? (
          multiline ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              rows={3}
              className="w-full text-sm border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          ) : (
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-full text-sm border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          )
        ) : (
          <span className="text-sm text-gray-900">{displayValue(value)}</span>
        )}
      </dd>
    </div>
  )
}

function ProspectDetail({ prospect, onClose, onUpdate, onRefresh }) {
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [showAttachModal, setShowAttachModal] = useState(false)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [attachments, setAttachments] = useState([])

  const fetchAttachments = useCallback(async () => {
    if (!prospect?.id) return
    try {
      const res = await fetch(`/api/prospects?action=attachments&id=${prospect.id}`)
      if (res.ok) {
        const data = await res.json()
        setAttachments(data)
      }
    } catch (err) {
      console.error('Error fetching attachments:', err)
    }
  }, [prospect?.id])

  useEffect(() => {
    fetchAttachments()
  }, [fetchAttachments])

  if (!prospect) return null

  const p = prospect
  const researchBrief = attachments.find(a => a.attachment_type === 'research_brief')

  function handleBriefSaved() {
    fetchAttachments()
    if (onRefresh) onRefresh()
  }

  function handleDeleteBrief() {
    fetchAttachments()
    if (onRefresh) onRefresh()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[480px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-200 ease-out">
        {/* Header */}
        <div className="flex-shrink-0 bg-[#041E42] px-5 py-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white truncate">{p.company}</h2>
                <StatusBadge status={p.prospect_status} />
              </div>
              {p.also_known_as && (
                <p className="text-sm text-white/60 mt-0.5">aka {p.also_known_as}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <OutreachGroupBadge group={p.outreach_group} />
                {p.outreach_rank && (
                  <span className="text-white/70 text-sm">Rank #{p.outreach_rank}</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white ml-3 mt-1 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Promote to Pipeline button */}
        {(p.prospect_status === 'Outreach Ready' || p.prospect_status === 'Converted') && (
          <div className="flex-shrink-0 px-5 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100">
            <button
              onClick={() => setShowConvertModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#041E42] rounded-lg hover:bg-[#041E42]/90 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              Promote to Pipeline
              {p.prospect_status === 'Converted' && (
                <span className="text-xs text-white/60 ml-1">(add another)</span>
              )}
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Engagement Planning - editable section at top */}
          <Section title="Engagement Planning" defaultOpen={true}>
            <div className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Outreach Group</dt>
                <dd className="mt-0.5">
                  <select
                    value={p.outreach_group || 'Unassigned'}
                    onChange={(e) => onUpdate(p.id, 'outreach_group', e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                  >
                    {GROUP_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</dt>
                <dd className="mt-0.5">
                  <select
                    value={p.prospect_status || 'Identified'}
                    onChange={(e) => onUpdate(p.id, 'prospect_status', e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Outreach Rank</dt>
                <dd className="mt-0.5">
                  <input
                    type="number"
                    min="1"
                    value={p.outreach_rank ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
                      onUpdate(p.id, 'outreach_rank', val)
                    }}
                    placeholder="Set rank..."
                    className="w-24 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                  />
                </dd>
              </div>

              <EditableField
                label="Suggested Next Step"
                value={p.suggested_next_step}
                onSave={(val) => onUpdate(p.id, 'suggested_next_step', val)}
                multiline
              />

              <EditableField
                label="Group Notes"
                value={p.group_notes}
                onSave={(val) => onUpdate(p.id, 'group_notes', val)}
                multiline
              />

              <EditableField
                label="Notes"
                value={p.notes}
                onSave={(val) => onUpdate(p.id, 'notes', val)}
                multiline
              />

              <Field label="Engagement Type" value={p.engagement_type} />
              <Field label="Legacy Data Potential" value={p.legacy_data_potential} />
            </div>
          </Section>

          {/* Company Info */}
          <Section title="Company Info" defaultOpen={true}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Category" value={p.category} />
              <Field label="In-House Tooling" value={p.in_house_tooling} />
              <Field label="City" value={p.city} />
              <Field label="State" value={p.state} />
              <Field label="Geography Tier" value={p.geography_tier} />
              <Field label="Website" value={p.website} className="col-span-2" />
              <Field label="Source Report" value={p.source_report} className="col-span-2" />
              <Field label="Priority" value={p.priority} />
              <Field label="Ownership Type" value={p.ownership_type} />
              <Field label="Recent M&A" value={p.recent_ma} className="col-span-2" />
            </dl>
          </Section>

          {/* Company Metrics */}
          <Section title="Company Metrics" defaultOpen={false}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Employees (Approx)" value={p.employees_approx} />
              <Field label="Year Founded" value={p.year_founded} />
              <Field label="Years in Business" value={p.years_in_business} />
              <Field label="Revenue Known" value={p.revenue_known} />
              <Field label="Revenue Est ($M)" value={p.revenue_est_m} />
              <Field label="Press Count" value={p.press_count} />
            </dl>
          </Section>

          {/* Signals & Readiness */}
          <Section title="Signals & Readiness" defaultOpen={true}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Signal Count" value={p.signal_count} />
              <Field label="Top Signal" value={p.top_signal} />
              <Field label="RJG Cavity Pressure" value={p.rjg_cavity_pressure} />
              <Field label="Medical Device Mfg" value={p.medical_device_mfg} />
              <Field label="Key Certifications" value={p.key_certifications} className="col-span-2" />
            </dl>
          </Section>

          {/* PSB Relationship */}
          <Section title="PSB Relationship" defaultOpen={(p.cwp_contacts ?? 0) >= 5}>
            {(p.cwp_contacts ?? 0) > 0 && (
              <div className={`mb-3 px-3 py-2 rounded-lg text-sm ${
                (p.cwp_contacts ?? 0) >= 20 ? 'bg-red-50 text-red-800 border border-red-200' :
                (p.cwp_contacts ?? 0) >= 10 ? 'bg-orange-50 text-orange-800 border border-orange-200' :
                (p.cwp_contacts ?? 0) >= 5  ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                'bg-gray-50 text-gray-600 border border-gray-200'
              }`}>
                <span className="font-semibold">{p.cwp_contacts} CWP contacts</span>
                {' — '}
                {(p.cwp_contacts ?? 0) >= 20 ? 'Very strong existing relationship' :
                 (p.cwp_contacts ?? 0) >= 10 ? 'Strong existing relationship' :
                 (p.cwp_contacts ?? 0) >= 5  ? 'Warm lead — existing relationship' :
                 'Some PSB connection'}
              </div>
            )}
            <dl className="space-y-3">
              <Field label="CWP Contacts" value={p.cwp_contacts} />
              <Field label="PSB Connection Notes" value={p.psb_connection_notes} />
            </dl>
          </Section>

          {/* Research Brief */}
          <div className="border-t border-gray-200">
            {researchBrief ? (
              <Section title="Research Brief" defaultOpen={true}>
                <ResearchBriefPanel
                  attachment={researchBrief}
                  onDelete={handleDeleteBrief}
                />
              </Section>
            ) : (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">Research Brief</h3>
                  <span className="text-xs text-gray-400">No research attached</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPromptModal(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-[#041E42] text-white rounded-lg hover:bg-[#041E42]/90"
                  >
                    Generate Research Prompt
                  </button>
                  <button
                    onClick={() => setShowAttachModal(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Attach Research Brief
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="px-5 py-3 bg-gray-50 text-xs text-gray-400 border-t border-gray-100">
            <div className="flex justify-between">
              <span>Last edited by: {p.last_edited_by || 'N/A'}</span>
              <span>Updated: {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Modals */}
        {showPromptModal && (
          <ResearchPromptModal
            prospect={p}
            onClose={() => setShowPromptModal(false)}
          />
        )}
        {showAttachModal && (
          <AttachResearchModal
            prospect={p}
            onClose={() => setShowAttachModal(false)}
            onSaved={handleBriefSaved}
          />
        )}
        {showConvertModal && (
          <ConvertToOpportunityModal
            prospect={p}
            onClose={() => setShowConvertModal(false)}
            onSuccess={() => {
              if (onRefresh) onRefresh()
            }}
          />
        )}
      </div>
    </>
  )
}

export default ProspectDetail
