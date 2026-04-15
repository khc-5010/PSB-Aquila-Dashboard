import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X, Flag } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

import { calculatePriorityScore, calculateAiReadiness, getTierFromScore } from '../../utils/priorityScore'
import OutreachGroupBadge from './OutreachGroupBadge'
import StatusBadge from './StatusBadge'
import ResearchPromptModal from './ResearchPromptModal'
import AttachResearchModal from './AttachResearchModal'
import ResearchBriefPanel from './ResearchBriefPanel'
import ConvertToOpportunityModal from './ConvertToOpportunityModal'
import ExtractionPromptModal from './ExtractionPromptModal'
import ImportOntologyModal from './ImportOntologyModal'
import NeighborhoodPanel from '../ontology/NeighborhoodPanel'
import FdaEnrichment from './FdaEnrichment'

const GROUP_OPTIONS = ['Group 1', 'Group 2', 'Time-Sensitive', 'Infrastructure', 'Unassigned']
const STATUS_OPTIONS = ['Identified', 'Prioritized', 'Research Complete', 'Outreach Ready', 'Converted', 'Nurture']

// US state abbreviations (50 + DC) for the State dropdown in Company Info.
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]

// Controlled values for the In-House Tooling dropdown.
const IN_HOUSE_TOOLING_OPTIONS = ['Yes', 'No', 'N/A']

// Controlled values for the Ownership Type dropdown. Must preserve the strings
// that downstream indicator logic keys off of: `.includes('PE')`,
// `.includes('Family')`, `=== 'ESOP'` (see ProspectTable urgency icons).
const OWNERSHIP_TYPES = [
  'Public',
  'Private',
  'PE-Backed',
  'Family/Founder-Owned',
  'ESOP',
  'Foreign-Owned',
  'Cooperative',
  'Non-Profit',
]

const CERT_COLORS = {
  'ISO 13485':    { bg: 'bg-purple-100', text: 'text-purple-700' },
  'FDA':          { bg: 'bg-purple-100', text: 'text-purple-700' },
  'MedAccred':    { bg: 'bg-purple-100', text: 'text-purple-700' },
  'IATF 16949':   { bg: 'bg-blue-100', text: 'text-blue-700' },
  'TS 16949':     { bg: 'bg-blue-100', text: 'text-blue-700' },
  'AS9100':       { bg: 'bg-gray-200', text: 'text-gray-700' },
  'NADCAP':       { bg: 'bg-gray-200', text: 'text-gray-700' },
  'ITAR':         { bg: 'bg-gray-200', text: 'text-gray-700' },
  'ISO 14001':    { bg: 'bg-green-100', text: 'text-green-700' },
  'ISO 9001':     { bg: 'bg-gray-100', text: 'text-gray-600' },
  'ISO Class':    { bg: 'bg-cyan-100', text: 'text-cyan-700' },
}

function getCertColor(cert) {
  const certLower = cert.toLowerCase()
  for (const [key, colors] of Object.entries(CERT_COLORS)) {
    if (certLower.includes(key.toLowerCase())) return colors
  }
  return { bg: 'bg-gray-100', text: 'text-gray-600' }
}

function buildHookLine(p) {
  const hooks = []

  if (p.rjg_cavity_pressure?.includes('Yes') || p.rjg_cavity_pressure?.includes('confirmed')) {
    hooks.push('RJG cavity pressure user')
  }

  if (p.in_house_tooling === 'Yes' && p.category?.includes('Converter')) {
    hooks.push('vertically integrated (converter + tooling)')
  }

  if (p.press_count) hooks.push(`${p.press_count}-press operation`)
  else if ((p.employees_approx ?? 0) >= 500) hooks.push(`${p.employees_approx}+ employees`)

  if ((p.site_count ?? 0) >= 10) hooks.push(`${p.site_count} sites`)
  if ((p.acquisition_count ?? 0) >= 5) hooks.push(`${p.acquisition_count} acquisitions`)

  if ((p.years_in_business ?? 0) >= 30) hooks.push(`${p.years_in_business}-year legacy`)

  if (p.ownership_type?.includes('PE') && p.recent_ma) {
    hooks.push('PE-backed, recent M&A')
  } else if (p.ownership_type?.includes('PE')) {
    hooks.push('PE-backed')
  }

  if (p.medical_device_mfg?.startsWith('Yes')) hooks.push('medical device mfg')

  if ((p.cwp_contacts ?? 0) >= 20) hooks.push('deep PSB relationship')
  else if ((p.cwp_contacts ?? 0) >= 5) hooks.push('warm PSB lead')

  if (hooks.length < 2 && p.top_signal) hooks.push(p.top_signal)

  return hooks.slice(0, 4).join(' \u00B7 ')
}

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

function ProspectDetail({ prospect, onClose, onUpdate, onRefresh, prospectNavList, onNavigate }) {
  const { user } = useAuth()
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [showAttachModal, setShowAttachModal] = useState(false)
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [showExtractionModal, setShowExtractionModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingBrief, setEditingBrief] = useState(null)
  const [attachments, setAttachments] = useState([])

  // Activity log state
  const [activityLog, setActivityLog] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [newEntry, setNewEntry] = useState('')
  const [submittingEntry, setSubmittingEntry] = useState(false)
  // Flag for review state
  const [showFlagInput, setShowFlagInput] = useState(false)
  const [flagNote, setFlagNote] = useState('')

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

  const fetchActivityLog = useCallback(async () => {
    if (!prospect?.id) return
    setActivityLoading(true)
    try {
      const res = await fetch(`/api/prospects?action=get-activity-log&id=${prospect.id}`)
      if (res.ok) {
        const data = await res.json()
        setActivityLog(data)
      }
    } catch (err) {
      console.error('Error fetching activity log:', err)
    } finally {
      setActivityLoading(false)
    }
  }, [prospect?.id])

  useEffect(() => {
    fetchAttachments()
    fetchActivityLog()
  }, [fetchAttachments, fetchActivityLog])

  // Escape key — close modal only if no sub-modal is open
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        const anySubModalOpen = showPromptModal || showAttachModal || showConvertModal || showExtractionModal || showImportModal || editingBrief || showFlagInput
        if (!anySubModalOpen) {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, showPromptModal, showAttachModal, showConvertModal, showExtractionModal, showImportModal, editingBrief, showFlagInput])

  // Prev/next navigation
  const currentIndex = prospectNavList ? prospectNavList.indexOf(prospect?.id) : -1
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < (prospectNavList?.length ?? 0) - 1
  const navigatePrev = () => { if (hasPrev && onNavigate) onNavigate(prospectNavList[currentIndex - 1]) }
  const navigateNext = () => { if (hasNext && onNavigate) onNavigate(prospectNavList[currentIndex + 1]) }

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

  async function handleAddActivity() {
    if (!newEntry.trim() || submittingEntry) return
    const entryText = newEntry.trim()
    const authorName = user?.name || 'Unknown'
    setSubmittingEntry(true)

    // Optimistic: add to top of log immediately
    const optimisticEntry = {
      id: Date.now(),
      prospect_id: p.id,
      entry_text: entryText,
      created_by: authorName,
      created_at: new Date().toISOString(),
    }
    setActivityLog(prev => [optimisticEntry, ...prev])
    setNewEntry('')

    try {
      const res = await fetch('/api/prospects?action=add-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: p.id, entry_text: entryText, created_by: authorName }),
      })
      if (!res.ok) throw new Error('Failed to add activity')
      // Refresh both activity log and prospect data (for suggested_next_step sync)
      fetchActivityLog()
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error('Error adding activity:', err)
      // Revert optimistic update
      setActivityLog(prev => prev.filter(e => e.id !== optimisticEntry.id))
      setNewEntry(entryText)
    } finally {
      setSubmittingEntry(false)
    }
  }

  async function handleFlagForReview() {
    if (!flagNote.trim()) return
    const authorName = user?.name || 'Unknown'
    try {
      const res = await fetch('/api/prospects?action=flag-for-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: p.id, review_note: flagNote.trim(), flagged_by: authorName }),
      })
      if (!res.ok) throw new Error('Failed to flag')
      setFlagNote('')
      setShowFlagInput(false)
      fetchActivityLog()
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error('Error flagging:', err)
    }
  }

  async function handleResolveReview() {
    const authorName = user?.name || 'Unknown'
    try {
      const res = await fetch('/api/prospects?action=resolve-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: p.id, resolved_by: authorName }),
      })
      if (!res.ok) throw new Error('Failed to resolve')
      fetchActivityLog()
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error('Error resolving:', err)
    }
  }

  function formatActivityDate(dateStr) {
    const d = new Date(dateStr)
    const now = new Date()
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    const day = d.getDate()
    if (d.getFullYear() !== now.getFullYear()) {
      return `${month} ${day}, ${d.getFullYear()}`
    }
    return `${month} ${day}`
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Modal positioning wrapper */}
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 lg:p-10 pointer-events-none">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 bg-[#041E42] px-6 py-4 rounded-t-xl">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white truncate">{p.company}</h2>
                  <StatusBadge status={p.prospect_status} />
                </div>
                {p.also_known_as && (
                  <p className="text-sm text-white/60 mt-0.5">aka {p.also_known_as}</p>
                )}
                {buildHookLine(p) && (
                  <p className="text-sm text-white/60 mt-1 italic">{buildHookLine(p)}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <OutreachGroupBadge group={p.outreach_group} />
                  {p.outreach_rank && (
                    <span className="text-white/70 text-sm">Rank #{p.outreach_rank}</span>
                  )}
                </div>
              </div>

              {/* Navigation + Close */}
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                {prospectNavList && prospectNavList.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={navigatePrev}
                      disabled={!hasPrev}
                      className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Previous prospect"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-xs text-white/50 tabular-nums min-w-[3rem] text-center">
                      {currentIndex + 1} / {prospectNavList.length}
                    </span>
                    <button
                      onClick={navigateNext}
                      disabled={!hasNext}
                      className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Next prospect"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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

          {/* Two-column body */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-x divide-gray-100">

              {/* LEFT COLUMN — Action sections */}
              <div className="divide-y divide-gray-100">
                {/* Engagement Planning */}
                <Section title="Engagement Planning" defaultOpen={true}>
                  <div className="space-y-3">
                    {/* Flag for Review banner */}
                    {p.needs_review && (
                      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <Flag className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-800">
                              <span className="font-medium">Flagged by {p.review_flagged_by || 'Unknown'}</span>
                              {p.review_flagged_at && (
                                <span className="text-amber-600"> on {formatActivityDate(p.review_flagged_at)}</span>
                              )}
                              <div className="text-amber-700 mt-0.5">{p.review_note}</div>
                            </div>
                          </div>
                          <button
                            onClick={handleResolveReview}
                            className="flex-shrink-0 text-xs px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-700 font-medium"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <div className="flex-1">
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
                      {/* Flag for Review button */}
                      {!p.needs_review && !showFlagInput && (
                        <button
                          onClick={() => setShowFlagInput(true)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-500 mt-4"
                          title="Flag for review"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Flag note input (inline) */}
                    {showFlagInput && (
                      <div className="rounded-md bg-amber-50 border border-amber-200 p-2 space-y-2">
                        <div className="text-xs font-medium text-amber-700">Flag for review — what needs attention?</div>
                        <textarea
                          autoFocus
                          rows={2}
                          value={flagNote}
                          onChange={(e) => setFlagNote(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') { setShowFlagInput(false); setFlagNote('') }
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFlagForReview() }
                          }}
                          placeholder="Describe the issue..."
                          className="w-full text-sm border border-amber-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleFlagForReview}
                            disabled={!flagNote.trim()}
                            className="text-xs px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-medium disabled:opacity-50"
                          >
                            Flag
                          </button>
                          <button
                            onClick={() => { setShowFlagInput(false); setFlagNote('') }}
                            className="text-xs px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

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

                    {/* Activity Log (replaces old single Suggested Next Step field) */}
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        Activity Log
                        {activityLog.length > 0 && (
                          <span className="text-[10px] font-normal text-gray-400">({activityLog.length})</span>
                        )}
                      </dt>
                      <dd className="mt-1.5">
                        {/* New entry input */}
                        <div className="space-y-1.5">
                          <textarea
                            rows={2}
                            value={newEntry}
                            onChange={(e) => setNewEntry(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddActivity() }
                            }}
                            placeholder="Add an update..."
                            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 resize-none"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400">{user?.name || 'Unknown'}</span>
                            <button
                              onClick={handleAddActivity}
                              disabled={!newEntry.trim() || submittingEntry}
                              className="text-xs px-2.5 py-1 rounded bg-[#041E42] hover:bg-[#0a2d5e] text-white font-medium disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        {/* Activity entries */}
                        {activityLoading && activityLog.length === 0 ? (
                          <div className="text-xs text-gray-400 mt-2">Loading...</div>
                        ) : activityLog.length > 0 ? (
                          <div className="mt-2 space-y-0 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                            {activityLog.map((entry) => {
                              const isFlag = entry.entry_text?.startsWith('\u2691')
                              const isResolve = entry.entry_text?.startsWith('\u2713')
                              return (
                                <div
                                  key={entry.id}
                                  className={`py-1.5 text-sm ${isFlag ? 'border-l-2 border-l-amber-300 pl-2' : isResolve ? 'border-l-2 border-l-green-300 pl-2' : 'pl-0'}`}
                                >
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-[10px] text-gray-400 flex-shrink-0">{formatActivityDate(entry.created_at)}</span>
                                    <span className="text-[10px] text-gray-500 font-medium flex-shrink-0">{entry.created_by}</span>
                                  </div>
                                  <div className="text-sm text-gray-700 mt-0.5">{entry.entry_text}</div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 mt-2 italic">No activity yet</div>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Follow-Up Date</dt>
                      <dd className="mt-0.5">
                        <div className="flex items-center">
                          <input
                            type="date"
                            value={p.follow_up_date ? p.follow_up_date.split('T')[0] : ''}
                            onChange={(e) => onUpdate(p.id, 'follow_up_date', e.target.value || null)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                          />
                          {p.follow_up_date && (
                            <button
                              onClick={() => onUpdate(p.id, 'follow_up_date', null)}
                              className="ml-2 text-xs text-gray-400 hover:text-red-500"
                              title="Clear follow-up date"
                            >
                              clear
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {[
                            { label: 'Tomorrow', days: 1 },
                            { label: '+3 days', days: 3 },
                            { label: '+1 week', days: 7 },
                            { label: '+2 weeks', days: 14 },
                            { label: '+1 month', days: 30 },
                          ].map(({ label, days }) => (
                            <button
                              key={label}
                              onClick={() => {
                                const d = new Date()
                                d.setDate(d.getDate() + days)
                                const yyyy = d.getFullYear()
                                const mm = String(d.getMonth() + 1).padStart(2, '0')
                                const dd = String(d.getDate()).padStart(2, '0')
                                onUpdate(p.id, 'follow_up_date', `${yyyy}-${mm}-${dd}`)
                              }}
                              className="text-xs px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </dd>
                    </div>

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

                {/* Research Brief */}
                <div>
                  {researchBrief ? (
                    <Section title="Research Brief" defaultOpen={true}>
                      <ResearchBriefPanel
                        attachment={researchBrief}
                        onDelete={handleDeleteBrief}
                        onEdit={() => setEditingBrief(researchBrief)}
                        onExtractOntology={() => setShowExtractionModal(true)}
                        onImportOntology={() => setShowImportModal(true)}
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

                {/* Ontology Neighborhood */}
                <div className="px-5 py-4">
                  <NeighborhoodPanel prospect={p} />
                </div>
              </div>

              {/* RIGHT COLUMN — Reference sections */}
              <div className="divide-y divide-gray-100">
                {/* Company Info */}
                <Section title="Company Info" defaultOpen={true}>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <EditableField
                      label="Category"
                      value={p.category}
                      onSave={(val) => onUpdate(p.id, 'category', val)}
                    />
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">In-House Tooling</dt>
                      <dd className="mt-0.5">
                        <select
                          value={p.in_house_tooling || ''}
                          onChange={(e) => onUpdate(p.id, 'in_house_tooling', e.target.value || null)}
                          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                        >
                          <option value="">—</option>
                          {IN_HOUSE_TOOLING_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </dd>
                    </div>
                    <EditableField
                      label="City"
                      value={p.city}
                      onSave={(val) => onUpdate(p.id, 'city', val)}
                    />
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">State</dt>
                      <dd className="mt-0.5">
                        <select
                          value={p.state || ''}
                          onChange={(e) => onUpdate(p.id, 'state', e.target.value || null)}
                          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                        >
                          <option value="">—</option>
                          {US_STATES.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </dd>
                    </div>
                    <Field label="Geography Tier" value={p.geography_tier} />
                    <div className="col-span-2">
                      <EditableField
                        label="Website"
                        value={p.website}
                        onSave={(val) => onUpdate(p.id, 'website', val)}
                      />
                      {p.website && (
                        <a
                          href={p.website.startsWith('http') ? p.website : `https://${p.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-0.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          Open &#8599;
                        </a>
                      )}
                    </div>
                    <div className="col-span-2">
                      <EditableField
                        label="Source Report"
                        value={p.source_report}
                        onSave={(val) => onUpdate(p.id, 'source_report', val)}
                        multiline
                      />
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</dt>
                      <dd className="mt-0.5">
                        <select
                          value={p.priority || ''}
                          onChange={(e) => onUpdate(p.id, 'priority', e.target.value || null)}
                          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                        >
                          <option value="">—</option>
                          <option value="HIGH PRIORITY">HIGH PRIORITY</option>
                          <option value="QUALIFIED">QUALIFIED</option>
                          <option value="WATCH">WATCH</option>
                          <option value="LOW">LOW</option>
                          <option value="STRATEGIC PARTNER">STRATEGIC PARTNER</option>
                        </select>
                        {p.priority_manual && (
                          <span className="ml-1.5 text-[10px] text-amber-600">(Manual override)</span>
                        )}
                        {(() => {
                          const scoreResult = calculatePriorityScore(p)
                          if (!scoreResult) return null
                          return (
                            <span className="ml-1.5 text-xs text-gray-500">Score: {scoreResult.score}</span>
                          )
                        })()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">AI Readiness</dt>
                      <dd className="mt-0.5 flex items-center gap-1.5">
                        {(() => {
                          const readinessResult = calculateAiReadiness(p)
                          const r = readinessResult?.readiness || readinessResult
                          const colors = {
                            green: { dot: 'bg-green-500', text: 'Green' },
                            yellow: { dot: 'bg-yellow-400', text: 'Yellow' },
                            red: { dot: 'bg-red-500', text: 'Red' },
                            exempt: { dot: 'bg-gray-300', text: 'Exempt' },
                          }
                          const info = colors[r] || colors.red
                          return (
                            <>
                              <span className={`inline-block w-2.5 h-2.5 rounded-full ${info.dot}`} />
                              <span className="text-sm text-gray-900">{info.text}</span>
                              {readinessResult?.met?.length > 0 && (
                                <span className="text-xs text-gray-400 ml-1">({readinessResult.met.join(', ')})</span>
                              )}
                            </>
                          )
                        })()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Ownership Type</dt>
                      <dd className="mt-0.5">
                        <select
                          value={p.ownership_type || ''}
                          onChange={(e) => onUpdate(p.id, 'ownership_type', e.target.value || null)}
                          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                        >
                          <option value="">—</option>
                          {/* Show any pre-existing value not in the preset list (e.g. legacy variants) */}
                          {p.ownership_type && !OWNERSHIP_TYPES.includes(p.ownership_type) && (
                            <option value={p.ownership_type}>{p.ownership_type}</option>
                          )}
                          {OWNERSHIP_TYPES.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <EditableField
                        label="Recent M&A"
                        value={p.recent_ma}
                        onSave={(val) => onUpdate(p.id, 'recent_ma', val)}
                        multiline
                      />
                    </div>
                    <EditableField
                      label="Parent Company"
                      value={p.parent_company}
                      onSave={(val) => onUpdate(p.id, 'parent_company', val)}
                    />
                    <EditableField
                      label="Decision Location"
                      value={p.decision_location}
                      onSave={(val) => onUpdate(p.id, 'decision_location', val)}
                    />
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
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Sites</dt>
                      <dd className="mt-0.5">
                        <input
                          type="number"
                          min="0"
                          value={p.site_count ?? ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
                            onUpdate(p.id, 'site_count', val)
                          }}
                          placeholder="—"
                          className="w-24 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Acquisitions</dt>
                      <dd className="mt-0.5">
                        <input
                          type="number"
                          min="0"
                          value={p.acquisition_count ?? ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
                            onUpdate(p.id, 'acquisition_count', val)
                          }}
                          placeholder="—"
                          className="w-24 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                        />
                      </dd>
                    </div>
                  </dl>
                </Section>

                {/* Signals & Readiness */}
                <Section title="Signals & Readiness" defaultOpen={true}>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Field label="Signal Count" value={p.signal_count} />
                    <Field label="Top Signal" value={p.top_signal} />
                    <Field label="RJG Cavity Pressure" value={p.rjg_cavity_pressure} />
                    <Field label="Medical Device Mfg" value={p.medical_device_mfg} />
                    <div className="col-span-2">
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Key Certifications</dt>
                      <dd className="mt-1 flex flex-wrap">
                        {p.key_certifications ? (
                          p.key_certifications.split(',').map(cert => cert.trim()).filter(Boolean).map((cert, i) => {
                            const colors = getCertColor(cert)
                            return (
                              <span key={i} className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full mr-1.5 mb-1.5 ${colors.bg} ${colors.text}`}>
                                {cert}
                              </span>
                            )
                          })
                        ) : (
                          <span className="text-sm text-gray-900">{'\u2014'}</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </Section>

                {/* FDA Intelligence */}
                <Section title="FDA Intelligence" defaultOpen={false}>
                  <FdaEnrichment prospect={p} onUpdate={onUpdate} attachments={attachments} onSnapshotSaved={handleBriefSaved} />
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
              </div>

            </div>
          </div>

          {/* Meta footer */}
          <div className="flex-shrink-0 px-6 py-3 bg-gray-50 text-xs text-gray-400 border-t border-gray-100 rounded-b-xl space-y-1">
            <div className="flex justify-between">
              <span>Added by: {p.added_by || 'Unknown'}{p.created_at ? ` · ${new Date(p.created_at).toLocaleDateString()}` : ''}</span>
              <span>Updated: {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span>Last edited by: {p.last_edited_by || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-modals (render outside modal container for correct z-stacking) */}
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
      {editingBrief && (
        <AttachResearchModal
          prospect={p}
          existingAttachment={editingBrief}
          onClose={() => setEditingBrief(null)}
          onSaved={() => {
            setEditingBrief(null)
            handleBriefSaved()
          }}
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
      {showExtractionModal && researchBrief && (
        <ExtractionPromptModal
          prospect={p}
          attachment={researchBrief}
          onClose={() => setShowExtractionModal(false)}
        />
      )}
      {showImportModal && (
        <ImportOntologyModal
          prospect={p}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            if (onRefresh) onRefresh()
          }}
        />
      )}
    </>
  )
}

export default ProspectDetail
