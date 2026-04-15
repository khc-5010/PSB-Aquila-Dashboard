import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Wrench, Star, HelpCircle, Clock, AlertTriangle, Users, ShieldCheck, ClipboardCheck, ChevronRight, ChevronDown, GitMerge, Flag } from 'lucide-react'

import { getParentCategory } from '../../utils/categoryGroups'
import { calculatePriorityScore, calculateAiReadiness, getTierFromScore } from '../../utils/priorityScore'
import ProspectFilters from './ProspectFilters'
import ProspectDetail from './ProspectDetail'
import ProspectAnalytics from './ProspectAnalytics'
import OutreachGroupBadge from './OutreachGroupBadge'
import StatusBadge from './StatusBadge'
import AddCompanyModal from './AddCompanyModal'
import BulkImportModal from './BulkImportModal'
import DataAuditModal from './DataAuditModal'

const GROUP_OPTIONS = ['Group 1', 'Group 2', 'Time-Sensitive', 'Infrastructure', 'Unassigned']

// Parse a DATE-only string (YYYY-MM-DD or ISO timestamp) safely in local timezone.
// Handles: "2026-04-21", "2026-04-21T00:00:00.000Z", Date objects, null.
// SYNC: Also exists in api/prospects.js — keep both copies identical.
function parseLocalDate(val) {
  if (!val) return null
  const str = typeof val === 'string' ? val : val instanceof Date ? val.toISOString() : String(val)
  const [y, m, d] = str.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

const STATE_TO_CORRIDOR = {
  'MI': 'Great Lakes Auto', 'OH': 'Great Lakes Auto', 'IN': 'Great Lakes Auto',
  'IL': 'Great Lakes Auto', 'WI': 'Great Lakes Auto',
  'PA': 'Northeast Tool', 'NY': 'Northeast Tool', 'CT': 'Northeast Tool',
  'NJ': 'Northeast Tool', 'MA': 'Northeast Tool', 'NH': 'Northeast Tool',
  'VT': 'Northeast Tool', 'ME': 'Northeast Tool', 'RI': 'Northeast Tool', 'DC': 'Northeast Tool',
  'NC': 'Southeast Growth', 'GA': 'Southeast Growth', 'FL': 'Southeast Growth',
  'TN': 'Southeast Growth', 'SC': 'Southeast Growth', 'VA': 'Southeast Growth',
  'AL': 'Southeast Growth', 'MS': 'Southeast Growth', 'KY': 'Southeast Growth',
  'TX': 'Gulf / Resin Belt', 'LA': 'Gulf / Resin Belt', 'OK': 'Gulf / Resin Belt', 'AR': 'Gulf / Resin Belt',
  'MN': 'Upper Midwest Medical',
  'CA': 'West Coast', 'OR': 'West Coast', 'WA': 'West Coast',
  'CO': 'Mountain / Central', 'AZ': 'Mountain / Central', 'UT': 'Mountain / Central',
  'NV': 'Mountain / Central', 'NM': 'Mountain / Central', 'ID': 'Mountain / Central',
  'MT': 'Mountain / Central', 'WY': 'Mountain / Central', 'ND': 'Mountain / Central',
  'SD': 'Mountain / Central', 'NE': 'Mountain / Central', 'KS': 'Mountain / Central',
  'IA': 'Mountain / Central', 'MO': 'Mountain / Central',
  'AK': 'Non-Contiguous', 'HI': 'Non-Contiguous',
}

const GROUP_SORT_ORDER = {
  'Group 1': 1,
  'Time-Sensitive': 2,
  'Group 2': 3,
  'Infrastructure': 4,
  'Unassigned': 5,
}

// Columns treated as numeric for sort comparisons. Nulls always sort last
// regardless of direction to mirror SQL NULLS LAST behavior.
const NUMERIC_COLUMNS = new Set([
  'outreach_rank', 'signal_count', 'press_count', 'employees_approx',
  'cwp_contacts', 'site_count', 'acquisition_count', 'priority_score',
  'follow_up_date', 'revenue_est_m', 'year_founded', 'years_in_business',
])

// Compare two prospects on a single key for sorting. Numeric columns put nulls
// last (return +1/-1 accordingly); string columns coerce null → '' and use
// localeCompare. The `state` key uses a composite "STATE, City" so states group.
function compareValues(a, b, key, direction) {
  let aVal = a[key]
  let bVal = b[key]

  if (key === 'state') {
    aVal = `${a.state || ''}, ${a.city || ''}`
    bVal = `${b.state || ''}, ${b.city || ''}`
    const cmp = aVal.localeCompare(bVal)
    return direction === 'asc' ? cmp : -cmp
  }

  if (NUMERIC_COLUMNS.has(key)) {
    const aNull = aVal === null || aVal === undefined || aVal === ''
    const bNull = bVal === null || bVal === undefined || bVal === ''
    if (aNull && bNull) return 0
    if (aNull) return 1   // nulls always last
    if (bNull) return -1
    // follow_up_date is a DATE string — coerce to timestamp for numeric compare.
    if (key === 'follow_up_date') {
      aVal = parseLocalDate(aVal)?.getTime() ?? 0
      bVal = parseLocalDate(bVal)?.getTime() ?? 0
    } else {
      aVal = Number(aVal)
      bVal = Number(bVal)
    }
    return direction === 'asc' ? aVal - bVal : bVal - aVal
  }

  if (aVal === null || aVal === undefined) aVal = ''
  if (bVal === null || bVal === undefined) bVal = ''
  const cmp = String(aVal).localeCompare(String(bVal))
  return direction === 'asc' ? cmp : -cmp
}

const PRIORITY_COLORS = {
  'HIGH PRIORITY': 'bg-red-100 text-red-700',
  'QUALIFIED': 'bg-blue-100 text-blue-700',
  'WATCH': 'bg-yellow-100 text-yellow-700',
  'STRATEGIC PARTNER': 'bg-purple-100 text-purple-700',
  'LOW': 'bg-gray-100 text-gray-500',
}

const READINESS_COLORS = {
  green: { dot: 'bg-green-500', label: 'Green', title: 'AI-ready: meets 3+ criteria' },
  yellow: { dot: 'bg-yellow-400', label: 'Yellow', title: 'Partial readiness: meets 1-2 criteria' },
  red: { dot: 'bg-red-500', label: 'Red', title: 'Not ready: meets 0 criteria' },
  exempt: { dot: 'bg-gray-300', label: 'Exempt', title: 'Infrastructure/strategic — not scored' },
}

const DIMENSION_LABELS = {
  scale: { label: 'Scale', max: 25 },
  warmth: { label: 'Warmth', max: 25 },
  urgency: { label: 'Urgency', max: 15 },
  vertical: { label: 'Vertical', max: 15 },
  signals: { label: 'Signals', max: 10 },
  technology: { label: 'Technology', max: 10 },
}

function PriorityHoverCard({ prospect, children }) {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef(null)

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShow(true), 250)
  }

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current)
    setShow(false)
  }

  const p = prospect
  const scoreResult = calculatePriorityScore(p)
  const readinessResult = calculateAiReadiness(p)

  if (!scoreResult) return <>{children}</>

  const { score, breakdown } = scoreResult
  const tier = getTierFromScore(score)
  const readinessInfo = READINESS_COLORS[readinessResult?.readiness] || READINESS_COLORS.red

  return (
    <span className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {show && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-64 pointer-events-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-900">{score} / 100</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLORS[tier] || 'bg-gray-100 text-gray-600'}`}>{tier}</span>
          </div>

          <div className="space-y-1.5 mb-2.5">
            {Object.entries(DIMENSION_LABELS).map(([key, { label, max }]) => {
              const val = breakdown[key] ?? 0
              const pct = (val / max) * 100
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-16 text-right">{label}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : pct >= 25 ? 'bg-yellow-500' : 'bg-gray-300'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 w-8">{val}/{max}</span>
                </div>
              )
            })}
          </div>

          <div className="border-t border-gray-100 pt-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`inline-block w-2 h-2 rounded-full ${readinessInfo.dot}`} />
              <span className="text-[10px] font-medium text-gray-700">AI Readiness: {readinessInfo.label}</span>
            </div>
            {readinessResult?.met?.length > 0 && (
              <div className="text-[10px] text-gray-500">
                {readinessResult.met.map((m, i) => (
                  <span key={i}>{i > 0 ? ' · ' : ''}<span className="text-green-600">✓</span> {m}</span>
                ))}
              </div>
            )}
          </div>

          {p.priority_manual && p.priority_manual !== tier && (
            <div className="border-t border-gray-100 pt-1.5 mt-1.5 text-[10px] text-amber-600">
              📌 Manual override: {p.priority_manual}
            </div>
          )}
        </div>
      )}
    </span>
  )
}

function displayValue(val) {
  if (val === null || val === undefined || val === '') return '\u2014'
  return val
}

function cwpHeatClass(count) {
  if (!count || count === 0) return 'text-gray-400'
  if (count < 5) return 'text-amber-600'
  if (count < 10) return 'font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded'
  if (count < 20) return 'font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded'
  return 'font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded'
}

function getProspectUrgency(prospect) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // Tier 1: Explicit follow-up date
  if (prospect.follow_up_date) {
    const followUp = parseLocalDate(prospect.follow_up_date)
    if (!followUp || isNaN(followUp)) return null
    const diffDays = Math.floor((followUp - today) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return { level: 'overdue', label: `${Math.abs(diffDays)}d overdue`, color: 'red', priority: 1 }
    if (diffDays === 0) return { level: 'due_today', label: 'Due today', color: 'amber', priority: 2 }
    if (diffDays <= 3) return { level: 'due_soon', label: `Due in ${diffDays}d`, color: 'yellow', priority: 3 }
    if (diffDays <= 7) return { level: 'due_week', label: `Due in ${diffDays}d`, color: 'blue', priority: 4 }
    return { level: 'scheduled', label: followUp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'gray', priority: 10 }
  }

  // Tier 2: Auto-detected staleness (only for active statuses)
  const parkedStatuses = ['Converted', 'Nurture', 'Identified']
  if (parkedStatuses.includes(prospect.prospect_status)) return null

  const updatedAt = prospect.updated_at ? new Date(prospect.updated_at) : null
  const daysSinceUpdate = updatedAt ? Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24)) : null

  // "Outreach Ready" for 14+ days with no update = gone cold
  if (prospect.prospect_status === 'Outreach Ready' && daysSinceUpdate >= 14) {
    return { level: 'stale', label: `${daysSinceUpdate}d idle`, color: 'orange', priority: 5 }
  }

  // "Prioritized" for 14+ days without advancing = stalled research
  if (prospect.prospect_status === 'Prioritized' && daysSinceUpdate >= 14) {
    return { level: 'stalled', label: 'Research stalled', color: 'orange', priority: 6 }
  }

  // "Research Complete" for 7+ days without advancing = not acted on
  if (prospect.prospect_status === 'Research Complete' && daysSinceUpdate >= 7) {
    return { level: 'stalled', label: 'Needs outreach', color: 'orange', priority: 7 }
  }

  return null
}

function exportToCSV(data, filename) {
  const columns = [
    'company', 'also_known_as', 'category', 'in_house_tooling',
    'city', 'state', 'geography_tier', 'source_report', 'priority', 'priority_score', 'ai_readiness',
    'employees_approx', 'year_founded', 'years_in_business',
    'revenue_known', 'revenue_est_m', 'press_count',
    'site_count', 'acquisition_count',
    'signal_count', 'top_signal', 'rjg_cavity_pressure', 'medical_device_mfg',
    'key_certifications', 'ownership_type', 'recent_ma', 'parent_company', 'decision_location',
    'cwp_contacts', 'psb_connection_notes',
    'engagement_type', 'suggested_next_step', 'follow_up_date', 'legacy_data_potential', 'notes',
    'outreach_group', 'outreach_rank', 'group_notes', 'prospect_status', 'website'
  ]

  const headers = columns.map(c => c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
  const rows = data.map(row => columns.map(col => {
    const val = row[col]
    if (val === null || val === undefined) return ''
    const str = String(val)
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str
  }))

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const HOVER_CERT_COLORS = {
  'ISO 13485': 'bg-purple-100 text-purple-700',
  'FDA': 'bg-purple-100 text-purple-700',
  'MedAccred': 'bg-purple-100 text-purple-700',
  'IATF 16949': 'bg-blue-100 text-blue-700',
  'TS 16949': 'bg-blue-100 text-blue-700',
  'AS9100': 'bg-gray-200 text-gray-700',
  'NADCAP': 'bg-gray-200 text-gray-700',
  'ITAR': 'bg-gray-200 text-gray-700',
  'ISO 14001': 'bg-green-100 text-green-700',
  'ISO 9001': 'bg-gray-100 text-gray-600',
  'ISO Class': 'bg-cyan-100 text-cyan-700',
}

function getHoverCertColor(cert) {
  const cl = cert.toLowerCase()
  for (const [key, cls] of Object.entries(HOVER_CERT_COLORS)) {
    if (cl.includes(key.toLowerCase())) return cls
  }
  return 'bg-gray-100 text-gray-600'
}

function CompanyHoverCard({ prospect, children }) {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef(null)

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShow(true), 250)
  }

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current)
    setShow(false)
  }

  const p = prospect
  const hasData = p.employees_approx || p.press_count ||
    p.site_count || p.acquisition_count ||
    p.year_founded || p.revenue_est_m ||
    p.ownership_type || p.key_certifications ||
    p.top_signal || p.parent_company

  if (!hasData) return <>{children}</>

  const certs = p.key_certifications
    ? p.key_certifications.split(',').map(c => c.trim()).filter(Boolean)
    : []

  const row1 = (p.press_count || p.employees_approx)
  const row2 = (p.site_count || p.acquisition_count)
  const row3 = (p.year_founded || p.revenue_est_m)
  const row4 = (p.ownership_type || p.geography_tier)
  const row5 = p.parent_company

  return (
    <span
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72 pointer-events-none">
          {row1 && (
            <div className="flex gap-4 mb-1.5">
              {p.press_count != null && (
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Presses</span>
                  <div className="text-xs text-gray-700 font-medium">{p.press_count}</div>
                </div>
              )}
              {p.employees_approx != null && (
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Employees</span>
                  <div className="text-xs text-gray-700 font-medium">{p.employees_approx.toLocaleString()}</div>
                </div>
              )}
            </div>
          )}
          {row2 && (
            <div className="flex gap-4 mb-1.5">
              {p.site_count != null && (
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Sites</span>
                  <div className="text-xs text-gray-700 font-medium">{p.site_count}</div>
                </div>
              )}
              {p.acquisition_count != null && (
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Acquisitions</span>
                  <div className="text-xs text-gray-700 font-medium">{p.acquisition_count}</div>
                </div>
              )}
            </div>
          )}
          {row3 && (
            <div className="flex gap-4 mb-1.5">
              {p.year_founded != null && (
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Founded</span>
                  <div className="text-xs text-gray-700 font-medium">{p.year_founded}</div>
                </div>
              )}
              {p.revenue_est_m != null && (
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Revenue</span>
                  <div className="text-xs text-gray-700 font-medium">${p.revenue_est_m}M</div>
                </div>
              )}
            </div>
          )}
          {row4 && (
            <div className="flex gap-4 mb-1.5">
              {p.ownership_type && (
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Ownership</span>
                  <div className="text-xs text-gray-700 font-medium">{p.ownership_type}</div>
                </div>
              )}
              {p.geography_tier && (
                <div>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Geo Tier</span>
                  <div className="text-xs text-gray-700 font-medium">{p.geography_tier}</div>
                </div>
              )}
            </div>
          )}
          {row5 && (
            <div className="mb-1.5">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Parent</span>
              <div className="text-xs text-gray-700 font-medium">{p.parent_company}</div>
            </div>
          )}
          {certs.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {certs.map((cert, i) => (
                <span key={i} className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full ${getHoverCertColor(cert)}`}>
                  {cert}
                </span>
              ))}
            </div>
          )}
          {p.top_signal && (
            <div className="border-t border-gray-100 pt-1.5 mt-1">
              <span className="text-[10px] text-gray-400 italic">{p.top_signal}</span>
            </div>
          )}
        </div>
      )}
    </span>
  )
}

function ProspectTable() {
  const { user } = useAuth()
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedProspect, setSelectedProspect] = useState(null)
  const [filters, setFilters] = useState({
    group: [], category: [], priority: [], geo: [], status: [], search: '', preset: null,
  })
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [editingRank, setEditingRank] = useState(null)
  const [editingRankValue, setEditingRankValue] = useState('')
  const [subView, setSubView] = useState('table') // 'table' | 'charts'
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showAuditModal, setShowAuditModal] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  // Fetch prospects
  useEffect(() => {
    fetch('/api/prospects')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        setProspects(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching prospects:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Update a prospect field (optimistic)
  const updateProspect = useCallback(async (id, field, value, editedBy = user?.name || 'Unknown') => {
    // Optimistic update
    setProspects(prev => prev.map(p =>
      p.id === id ? { ...p, [field]: value, last_edited_by: editedBy } : p
    ))

    if (selectedProspect?.id === id) {
      setSelectedProspect(prev => ({ ...prev, [field]: value, last_edited_by: editedBy }))
    }

    try {
      const res = await fetch(`/api/prospects?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value, last_edited_by: editedBy }),
      })
      if (!res.ok) throw new Error('Failed to update')
      const updated = await res.json()
      setProspects(prev => prev.map(p => p.id === id ? updated : p))
      if (selectedProspect?.id === id) setSelectedProspect(updated)
    } catch (err) {
      console.error('Update failed:', err)
      // Revert — refetch
      fetch('/api/prospects').then(r => r.json()).then(setProspects).catch(() => {})
    }
  }, [selectedProspect, user])

  const refreshProspects = useCallback(() => {
    setLoading(true)
    fetch('/api/prospects')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => { setProspects(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  // Hash routing — auto-select prospect from URL on load
  useEffect(() => {
    if (prospects.length === 0) return
    const hash = window.location.hash
    const qIdx = hash.indexOf('?')
    if (qIdx === -1) return
    const params = new URLSearchParams(hash.slice(qIdx + 1))
    const idParam = params.get('id')
    if (idParam) {
      const found = prospects.find(p => p.id === Number(idParam))
      if (found) {
        setSelectedProspect(found)
      } else {
        window.history.replaceState(null, '', '#prospects')
      }
    }
  }, [prospects])

  // Hash routing — update URL when selection changes
  useEffect(() => {
    if (selectedProspect) {
      const newHash = `prospects?id=${selectedProspect.id}`
      if (window.location.hash !== `#${newHash}`) {
        window.history.replaceState(null, '', `#${newHash}`)
      }
    } else {
      if (window.location.hash.includes('?id=')) {
        window.history.replaceState(null, '', '#prospects')
      }
    }
  }, [selectedProspect])

  // Action items count (computed from full prospect list, independent of filters)
  const actionItemCount = prospects.filter(p => {
    const u = getProspectUrgency(p)
    return u && u.priority <= 7
  }).length

  // Filter logic
  const filtered = prospects.filter(p => {
    if (filters.preset === 'action_items') {
      const urgency = getProspectUrgency(p)
      if (!urgency || urgency.priority > 7) return false
    }
    if (filters.preset === 'stale') {
      const urgency = getProspectUrgency(p)
      if (!urgency || (urgency.level !== 'stale' && urgency.level !== 'stalled')) return false
    }
    if (filters.preset === 'medical') {
      const parentCat = getParentCategory(p.category)
      const isMolder = parentCat === 'Converter' || parentCat === 'Converter + In-House Tooling' || parentCat === 'Mold Maker + Converter'
      if (!isMolder || !p.medical_device_mfg?.startsWith('Yes')) return false
    }
    if (filters.preset === 'warm_leads') {
      if ((p.cwp_contacts ?? 0) < 5) return false
    }
    if (filters.preset === 'ready_for_research') {
      if (p.prospect_status !== 'Prioritized') return false
    }
    if (filters.preset === 'needs_review') {
      if (!p.needs_review) return false
    }
    if (filters.group.length > 0 && !filters.group.includes(p.outreach_group)) return false
    if (filters.category.length > 0 && !filters.category.includes(getParentCategory(p.category))) return false
    if (filters.priority.length > 0 && !filters.priority.includes(p.priority)) return false
    if (filters.geo.length > 0) {
      const corridor = p.state ? (STATE_TO_CORRIDOR[p.state] || 'Mountain / Central') : 'Unknown'
      if (!filters.geo.includes(corridor)) return false
    }
    if (filters.status.length > 0 && !filters.status.includes(p.prospect_status)) return false
    if (filters.search) {
      const s = filters.search.toLowerCase()
      const searchable = [p.company, p.also_known_as, p.city, p.state, p.category, p.parent_company, p.notes, p.suggested_next_step]
        .filter(Boolean).join(' ').toLowerCase()
      if (!searchable.includes(s)) return false
    }
    return true
  })

  // Sort logic — compound: primary key, then smart tiebreakers.
  //   • Numeric columns sort nulls last regardless of direction (matches SQL NULLS LAST).
  //   • When a column header is active, tiebreakers apply in order: rank → group → signal desc
  //     (skipping whichever is the primary key).
  //   • When no column header is active, the smart default is group → rank → signal desc.
  const sorted = [...filtered].sort((a, b) => {
    if (sortConfig.key) {
      const primary = compareValues(a, b, sortConfig.key, sortConfig.direction)
      if (primary !== 0) return primary

      // Smart tiebreakers — always ascending, nulls last via compareValues.
      if (sortConfig.key !== 'outreach_rank') {
        const byRank = compareValues(a, b, 'outreach_rank', 'asc')
        if (byRank !== 0) return byRank
      }
      if (sortConfig.key !== 'outreach_group') {
        const groupA = GROUP_SORT_ORDER[a.outreach_group] || 5
        const groupB = GROUP_SORT_ORDER[b.outreach_group] || 5
        if (groupA !== groupB) return groupA - groupB
      }
      // Final tiebreaker: signal_count desc
      const sigA = a.signal_count ?? 0
      const sigB = b.signal_count ?? 0
      return sigB - sigA
    }
    // Default sort: group order → rank → signal_count desc
    const groupA = GROUP_SORT_ORDER[a.outreach_group] || 5
    const groupB = GROUP_SORT_ORDER[b.outreach_group] || 5
    if (groupA !== groupB) return groupA - groupB
    const rankA = a.outreach_rank ?? 9999
    const rankB = b.outreach_rank ?? 9999
    if (rankA !== rankB) return rankA - rankB
    const sigA = a.signal_count ?? 0
    const sigB = b.signal_count ?? 0
    return sigB - sigA
  })

  // Navigation list for ProspectDetail prev/next (flat, filtered+sorted order)
  const prospectNavList = useMemo(() => sorted.map(p => p.id), [sorted])

  // Group by parent company (client-side, after filter + sort)
  const grouped = (() => {
    const companyNameToProspect = new Map()
    for (const p of sorted) companyNameToProspect.set(p.company, p)

    const childrenByParent = new Map()
    for (const p of sorted) {
      if (p.parent_company) {
        if (!childrenByParent.has(p.parent_company)) childrenByParent.set(p.parent_company, [])
        childrenByParent.get(p.parent_company).push(p)
      }
    }

    // Identify real parents — prospects whose company name is referenced as parent_company by others
    const realParentNames = new Set()
    for (const [parentName, children] of childrenByParent) {
      if (companyNameToProspect.has(parentName) && children.some(c => c.company !== parentName)) {
        realParentNames.add(parentName)
      }
    }

    // Build valid groups. Exclude real parents from being children of other groups.
    const validGroups = new Map()
    for (const [parentName, children] of childrenByParent) {
      const filteredChildren = children.filter(c => c.company !== parentName && !realParentNames.has(c.company))
      const parentProspect = companyNameToProspect.get(parentName) || null
      if (filteredChildren.length >= 2 || (parentProspect && filteredChildren.length >= 1)) {
        validGroups.set(parentName, { children: filteredChildren, parentProspect })
      }
    }

    const consumedIds = new Set()
    for (const [, g] of validGroups) {
      for (const c of g.children) consumedIds.add(c.id)
      if (g.parentProspect) consumedIds.add(g.parentProspect.id)
    }

    const result = []
    const emittedGroups = new Set()
    for (const p of sorted) {
      if (!consumedIds.has(p.id)) {
        result.push({ type: 'standalone', prospect: p })
        continue
      }
      const groupName = validGroups.has(p.company) ? p.company
        : (p.parent_company && validGroups.has(p.parent_company)) ? p.parent_company : null
      if (groupName && !emittedGroups.has(groupName)) {
        emittedGroups.add(groupName)
        const g = validGroups.get(groupName)
        const all = g.parentProspect ? [g.parentProspect, ...g.children] : g.children
        result.push({
          type: g.parentProspect ? 'parent' : 'virtual-parent',
          groupName,
          prospect: g.parentProspect,
          children: g.children,
          aggregates: {
            totalPresses: all.reduce((s, m) => s + (m.press_count || 0), 0),
            totalSites: all.reduce((s, m) => s + (m.site_count || 0), 0),
            totalAcquisitions: all.reduce((s, m) => s + (m.acquisition_count || 0), 0),
            totalEmployees: all.reduce((s, m) => s + (m.employees_approx || 0), 0),
            totalCWP: all.reduce((s, m) => s + (m.cwp_contacts || 0), 0),
            totalSignal: all.reduce((s, m) => s + (m.signal_count || 0), 0),
            states: [...new Set(all.map(m => m.state).filter(Boolean))],
            count: all.length,
            childCount: g.children.length,
          },
        })
      }
    }
    return result
  })()

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' }
        return { key: null, direction: 'asc' } // Reset to default
      }
      return { key, direction: 'asc' }
    })
  }

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <span className="text-gray-300 ml-1">&#x25B4;&#x25BE;</span>
    return sortConfig.direction === 'asc'
      ? <span className="text-[#041E42] ml-1">&#x25B4;</span>
      : <span className="text-[#041E42] ml-1">&#x25BE;</span>
  }

  const handleRankBlur = (id) => {
    const val = editingRankValue.trim()
    const numVal = val === '' ? null : parseInt(val, 10)
    if (val !== '' && isNaN(numVal)) {
      setEditingRank(null)
      return
    }
    updateProspect(id, 'outreach_rank', numVal)
    setEditingRank(null)
  }

  const handleRankKeyDown = (e, id) => {
    if (e.key === 'Enter') {
      e.target.blur()
    } else if (e.key === 'Escape') {
      setEditingRank(null)
    }
  }

  const toggleGroup = useCallback((groupName) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      return next
    })
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-full" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">Error loading prospects: {error}</p>
          <p className="text-xs text-red-500 mt-1">Make sure the prospect_companies table has been created. See scripts/create-prospect-table.sql</p>
        </div>
      </div>
    )
  }

  const renderProspectRow = (p, { isChild = false } = {}) => (
    <tr
      key={p.id}
      className={`${isChild ? 'bg-gray-50/30 hover:bg-gray-100/50 border-l-2 border-l-gray-200' : 'hover:bg-blue-50/50'} cursor-pointer transition-colors`}
      onClick={() => setSelectedProspect(p)}
    >
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {editingRank === p.id ? (
          <input
            type="number" min="1" autoFocus
            value={editingRankValue}
            onChange={(e) => setEditingRankValue(e.target.value)}
            onBlur={() => handleRankBlur(p.id)}
            onKeyDown={(e) => handleRankKeyDown(e, p.id)}
            className="w-12 px-1 py-0.5 text-sm text-center border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        ) : (
          <button
            onClick={() => { setEditingRank(p.id); setEditingRankValue(p.outreach_rank ?? '') }}
            className="w-12 px-1 py-0.5 text-sm text-center rounded hover:bg-gray-100 transition-colors font-mono"
            title="Click to edit rank"
          >
            {p.outreach_rank ?? '\u2014'}
          </button>
        )}
      </td>
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <select
          value={p.outreach_group || 'Unassigned'}
          onChange={(e) => updateProspect(p.id, 'outreach_group', e.target.value)}
          className="text-xs font-medium rounded-full px-2 py-1 border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
          style={{
            backgroundColor: { 'Group 1': '#dcfce7', 'Group 2': '#dbeafe', 'Time-Sensitive': '#fef3c7', 'Infrastructure': '#f3e8ff', 'Unassigned': '#f3f4f6' }[p.outreach_group || 'Unassigned'],
            color: { 'Group 1': '#15803d', 'Group 2': '#1d4ed8', 'Time-Sensitive': '#b45309', 'Infrastructure': '#7e22ce', 'Unassigned': '#6b7280' }[p.outreach_group || 'Unassigned'],
            borderColor: { 'Group 1': '#86efac', 'Group 2': '#93c5fd', 'Time-Sensitive': '#fcd34d', 'Infrastructure': '#c4b5fd', 'Unassigned': '#d1d5db' }[p.outreach_group || 'Unassigned'],
          }}
        >
          {GROUP_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </td>
      <td className="px-3 py-2.5"><StatusBadge status={p.prospect_status} /></td>
      <td className={`px-3 py-2.5${isChild ? ' pl-10' : ''}`}>
        <div className="flex items-center">
          {(p.cwp_contacts ?? 0) >= 5 && (
            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0 ${
              (p.cwp_contacts ?? 0) >= 20 ? 'bg-red-500' : (p.cwp_contacts ?? 0) >= 10 ? 'bg-orange-500' : 'bg-amber-400'
            }`} title={`${p.cwp_contacts} CWP contacts`} />
          )}
          <div className="min-w-0">
            <CompanyHoverCard prospect={p}>
              <span className="text-sm font-medium text-gray-900">{p.company}</span>
            </CompanyHoverCard>
            {p.also_known_as && (
              <div className="text-xs text-gray-400 italic flex items-center gap-1">
                {isChild && <GitMerge className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                fka {p.also_known_as}
              </div>
            )}
          </div>
          {(p.conversion_count ?? 0) > 0 && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700" title={`${p.conversion_count} active opportunity${p.conversion_count > 1 ? 'ies' : ''}`}>
              {p.conversion_count}
            </span>
          )}
          {p.needs_review && (
            <Flag className="ml-1.5 w-3.5 h-3.5 text-amber-500 flex-shrink-0" title={`Flagged for review: ${p.review_note || 'No note'}`} />
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-xs text-gray-600">
          {displayValue(p.category)}
          {p.in_house_tooling === 'Yes' && <Wrench className="w-3.5 h-3.5 text-[#041E42] inline ml-1" title="In-house tooling — controls their own molds" />}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-xs text-gray-600">{p.city && p.state ? `${p.city}, ${p.state}` : displayValue(p.city || p.state)}</span>
      </td>
      <td className="px-3 py-2.5">
        {p.priority ? (
          <PriorityHoverCard prospect={p}>
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full cursor-default ${PRIORITY_COLORS[p.priority] || 'bg-gray-100 text-gray-600'}`}>{p.priority}</span>
          </PriorityHoverCard>
        ) : (
          <span className="text-xs text-gray-400">{'\u2014'}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center"><span className="text-sm text-gray-700">{displayValue(p.signal_count)}</span></td>
      <td className="px-3 py-2.5 text-center"><span className="text-sm text-gray-700">{displayValue(p.press_count)}</span></td>
      <td className="px-3 py-2.5 text-center"><span className="text-sm text-gray-600">{p.site_count || '\u2014'}</span></td>
      <td className="px-3 py-2.5 text-center"><span className="text-sm text-gray-600">{p.acquisition_count || '\u2014'}</span></td>
      <td className="px-3 py-2.5 text-center">
        {p.rjg_cavity_pressure === 'Yes' || p.rjg_cavity_pressure === 'Yes (confirmed)' ? (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 border border-amber-300" title="RJG cavity pressure — confirmed. Gold readiness signal.">
            <Star className="w-3.5 h-3.5 text-amber-600" fill="#FBBF24" />
          </span>
        ) : p.rjg_cavity_pressure === 'Likely' ? (
          <HelpCircle className="w-4 h-4 text-yellow-500 inline" title="RJG cavity pressure — likely. Verify before outreach." />
        ) : (
          <span className="text-xs text-gray-400">{'\u2014'}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        {p.medical_device_mfg?.startsWith('Yes') ? (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100" title={p.medical_device_mfg === 'Yes (confirmed)' ? 'Medical device manufacturer (FDA confirmed)' : 'Medical device manufacturer'}>
            <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
          </span>
        ) : (
          <span className="text-xs text-gray-400">{'\u2014'}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`text-sm ${cwpHeatClass(p.cwp_contacts ?? 0)}`}>{displayValue(p.cwp_contacts)}</span>
      </td>
      <td className="px-2 py-2.5 text-center">
        {p.follow_up_date ? (
          <span className={`text-xs font-medium ${
            getProspectUrgency(p)?.color === 'red' ? 'text-red-600 font-bold' :
            getProspectUrgency(p)?.color === 'amber' ? 'text-amber-600 font-bold' :
            getProspectUrgency(p)?.color === 'orange' ? 'text-orange-500' :
            'text-gray-500'
          }`}>
            {parseLocalDate(p.follow_up_date)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '\u2014'}
          </span>
        ) : (
          <span className="text-xs text-gray-300">{'\u2014'}</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-xs text-gray-600 flex items-center gap-1">
          <span className="truncate max-w-[100px]" title={p.ownership_type || ''}>{displayValue(p.ownership_type)}</span>
          {p.ownership_type?.includes('PE') && p.recent_ma ? (
            <Clock className="w-3.5 h-3.5 flex-shrink-0 text-red-500" title="PE-backed with recent M&A — highest urgency engagement window (6-18 months)" />
          ) : p.ownership_type?.includes('PE') ? (
            <Clock className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" title="PE-backed — optimization mandate, 3-5 year hold period" />
          ) : (p.ownership_type === 'Family/Founder-Owned' || p.ownership_type === 'Family-Owned' || p.ownership_type?.includes('Family')) && (p.years_in_business ?? 0) >= 30 ? (
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-orange-400" title={`Family-owned, ${p.years_in_business}+ years — potential succession/transition window`} />
          ) : p.ownership_type === 'ESOP' ? (
            <Users className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" title="Employee-owned — demonstrate value to workforce, investment-oriented once convinced" />
          ) : null}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {(() => {
          const urgency = getProspectUrgency(p)
          if (!urgency) return null
          const colorMap = {
            red: 'bg-red-500',
            amber: 'bg-amber-500',
            yellow: 'bg-yellow-400',
            blue: 'bg-blue-400',
            orange: 'bg-orange-400',
            gray: 'bg-gray-300',
          }
          return (
            <span
              className={`inline-flex items-center mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white ${colorMap[urgency.color]}`}
              title={urgency.label}
            >
              {urgency.label}
            </span>
          )
        })()}
        <span className="text-xs text-gray-600 truncate inline-block max-w-[160px] align-middle" title={p.suggested_next_step || ''}>{displayValue(p.suggested_next_step)}</span>
      </td>
    </tr>
  )

  const renderGroupHeaderRow = (item) => {
    const { type, groupName, prospect: parentP, children, aggregates } = item
    const isExpanded = expandedGroups.has(groupName)
    const isVirtual = type === 'virtual-parent'
    const toggle = (
      <button
        onClick={(e) => { e.stopPropagation(); toggleGroup(groupName) }}
        className="mr-1.5 p-0.5 text-gray-400 hover:text-gray-600 rounded"
      >
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    )
    const badge = (
      <span className="ml-2 text-xs text-gray-500 bg-gray-200/80 rounded-full px-2 py-0.5 whitespace-nowrap">
        {aggregates.childCount} {aggregates.childCount === 1 ? 'subsidiary' : 'subsidiaries'}
      </span>
    )
    const dash = <span className="text-xs text-gray-400">{'\u2014'}</span>

    if (isVirtual) {
      return (
        <tr key={`group-${groupName}`} className="bg-gray-100/60 transition-colors">
          <td className="px-3 py-2.5">{dash}</td>
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5">
            <div className="flex items-center">
              {toggle}
              <span className="text-sm font-semibold text-gray-600">{groupName}</span>
              {badge}
            </div>
          </td>
          <td className="px-3 py-2.5">{dash}</td>
          <td className="px-3 py-2.5"><span className="text-xs text-gray-500">{aggregates.states.join(', ')}</span></td>
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5 text-center"><span className="text-sm text-gray-500">{aggregates.totalSignal || '\u2014'}</span></td>
          <td className="px-3 py-2.5 text-center"><span className="text-sm text-gray-500">{aggregates.totalPresses || '\u2014'}</span></td>
          <td className="px-3 py-2.5 text-center"><span className="text-sm text-gray-500">{aggregates.totalSites || '\u2014'}</span></td>
          <td className="px-3 py-2.5 text-center"><span className="text-sm text-gray-500">{aggregates.totalAcquisitions || '\u2014'}</span></td>
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5 text-center"><span className={`text-sm ${cwpHeatClass(aggregates.totalCWP)}`}>{aggregates.totalCWP || '\u2014'}</span></td>
          <td className="px-2 py-2.5" />
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5" />
        </tr>
      )
    }

    // Real parent header — shows parent's own data + aggregates in numeric cols
    return (
      <tr
        key={`group-${groupName}`}
        className="hover:bg-blue-50/50 cursor-pointer transition-colors"
        onClick={() => setSelectedProspect(parentP)}
      >
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          {editingRank === parentP.id ? (
            <input
              type="number" min="1" autoFocus
              value={editingRankValue}
              onChange={(e) => setEditingRankValue(e.target.value)}
              onBlur={() => handleRankBlur(parentP.id)}
              onKeyDown={(e) => handleRankKeyDown(e, parentP.id)}
              className="w-12 px-1 py-0.5 text-sm text-center border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          ) : (
            <button
              onClick={() => { setEditingRank(parentP.id); setEditingRankValue(parentP.outreach_rank ?? '') }}
              className="w-12 px-1 py-0.5 text-sm text-center rounded hover:bg-gray-100 transition-colors font-mono"
              title="Click to edit rank"
            >
              {parentP.outreach_rank ?? '\u2014'}
            </button>
          )}
        </td>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <select
            value={parentP.outreach_group || 'Unassigned'}
            onChange={(e) => updateProspect(parentP.id, 'outreach_group', e.target.value)}
            className="text-xs font-medium rounded-full px-2 py-1 border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
            style={{
              backgroundColor: { 'Group 1': '#dcfce7', 'Group 2': '#dbeafe', 'Time-Sensitive': '#fef3c7', 'Infrastructure': '#f3e8ff', 'Unassigned': '#f3f4f6' }[parentP.outreach_group || 'Unassigned'],
              color: { 'Group 1': '#15803d', 'Group 2': '#1d4ed8', 'Time-Sensitive': '#b45309', 'Infrastructure': '#7e22ce', 'Unassigned': '#6b7280' }[parentP.outreach_group || 'Unassigned'],
              borderColor: { 'Group 1': '#86efac', 'Group 2': '#93c5fd', 'Time-Sensitive': '#fcd34d', 'Infrastructure': '#c4b5fd', 'Unassigned': '#d1d5db' }[parentP.outreach_group || 'Unassigned'],
            }}
          >
            {GROUP_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </td>
        <td className="px-3 py-2.5"><StatusBadge status={parentP.prospect_status} /></td>
        <td className="px-3 py-2.5">
          <div className="flex items-center">
            {toggle}
            {(parentP.cwp_contacts ?? 0) >= 5 && (
              <span className={`inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0 ${
                (parentP.cwp_contacts ?? 0) >= 20 ? 'bg-red-500' : (parentP.cwp_contacts ?? 0) >= 10 ? 'bg-orange-500' : 'bg-amber-400'
              }`} title={`${parentP.cwp_contacts} CWP contacts`} />
            )}
            <div className="min-w-0">
              <CompanyHoverCard prospect={parentP}>
                <span className="text-sm font-semibold text-gray-900">{parentP.company}</span>
              </CompanyHoverCard>
              {parentP.also_known_as && <div className="text-xs text-gray-400 italic">fka {parentP.also_known_as}</div>}
            </div>
            {badge}
            {(parentP.conversion_count ?? 0) > 0 && (
              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700" title={`${parentP.conversion_count} active opportunity${parentP.conversion_count > 1 ? 'ies' : ''}`}>
                {parentP.conversion_count}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs text-gray-600">
            {displayValue(parentP.category)}
            {parentP.in_house_tooling === 'Yes' && <Wrench className="w-3.5 h-3.5 text-[#041E42] inline ml-1" title="In-house tooling — controls their own molds" />}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs text-gray-600">{parentP.city && parentP.state ? `${parentP.city}, ${parentP.state}` : displayValue(parentP.city || parentP.state)}</span>
        </td>
        <td className="px-3 py-2.5">
          {parentP.priority ? (
            <PriorityHoverCard prospect={parentP}>
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full cursor-default ${PRIORITY_COLORS[parentP.priority] || 'bg-gray-100 text-gray-600'}`}>{parentP.priority}</span>
            </PriorityHoverCard>
          ) : dash}
        </td>
        <td className="px-3 py-2.5 text-center"><span className="text-sm font-medium text-gray-700">{aggregates.totalSignal || '\u2014'}</span></td>
        <td className="px-3 py-2.5 text-center"><span className="text-sm font-medium text-gray-700">{aggregates.totalPresses || '\u2014'}</span></td>
        <td className="px-3 py-2.5 text-center"><span className="text-sm font-medium text-gray-700">{aggregates.totalSites || '\u2014'}</span></td>
        <td className="px-3 py-2.5 text-center"><span className="text-sm font-medium text-gray-700">{aggregates.totalAcquisitions || '\u2014'}</span></td>
        <td className="px-3 py-2.5 text-center">
          {parentP.rjg_cavity_pressure === 'Yes' || parentP.rjg_cavity_pressure === 'Yes (confirmed)' ? (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 border border-amber-300" title="RJG cavity pressure — confirmed. Gold readiness signal.">
              <Star className="w-3.5 h-3.5 text-amber-600" fill="#FBBF24" />
            </span>
          ) : parentP.rjg_cavity_pressure === 'Likely' ? (
            <HelpCircle className="w-4 h-4 text-yellow-500 inline" title="RJG cavity pressure — likely. Verify before outreach." />
          ) : dash}
        </td>
        <td className="px-3 py-2.5 text-center">
          {parentP.medical_device_mfg?.startsWith('Yes') ? (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100" title={parentP.medical_device_mfg === 'Yes (confirmed)' ? 'Medical device manufacturer (FDA confirmed)' : 'Medical device manufacturer'}>
              <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
            </span>
          ) : dash}
        </td>
        <td className="px-3 py-2.5 text-center">
          <span className={`text-sm font-medium ${cwpHeatClass(aggregates.totalCWP)}`}>{aggregates.totalCWP || '\u2014'}</span>
        </td>
        <td className="px-2 py-2.5 text-center">
          {parentP.follow_up_date ? (
            <span className={`text-xs font-medium ${
              getProspectUrgency(parentP)?.color === 'red' ? 'text-red-600 font-bold' :
              getProspectUrgency(parentP)?.color === 'amber' ? 'text-amber-600 font-bold' :
              getProspectUrgency(parentP)?.color === 'orange' ? 'text-orange-500' :
              'text-gray-500'
            }`}>
              {parseLocalDate(parentP.follow_up_date)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '\u2014'}
            </span>
          ) : (
            <span className="text-xs text-gray-300">{'\u2014'}</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs text-gray-600 flex items-center gap-1">
            <span className="truncate max-w-[100px]" title={parentP.ownership_type || ''}>{displayValue(parentP.ownership_type)}</span>
            {parentP.ownership_type?.includes('PE') && parentP.recent_ma ? (
              <Clock className="w-3.5 h-3.5 flex-shrink-0 text-red-500" title="PE-backed with recent M&A — highest urgency engagement window (6-18 months)" />
            ) : parentP.ownership_type?.includes('PE') ? (
              <Clock className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" title="PE-backed — optimization mandate, 3-5 year hold period" />
            ) : (parentP.ownership_type === 'Family/Founder-Owned' || parentP.ownership_type === 'Family-Owned' || parentP.ownership_type?.includes('Family')) && (parentP.years_in_business ?? 0) >= 30 ? (
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-orange-400" title={`Family-owned, ${parentP.years_in_business}+ years — potential succession/transition window`} />
            ) : parentP.ownership_type === 'ESOP' ? (
              <Users className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" title="Employee-owned — demonstrate value to workforce, investment-oriented once convinced" />
            ) : null}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs text-gray-600 truncate block max-w-[200px]" title={parentP.suggested_next_step || ''}>{displayValue(parentP.suggested_next_step)}</span>
        </td>
      </tr>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem-3rem)]">
      {/* Sub-view toggle + Filters */}
      <div className="bg-white border-b border-gray-200 px-6 pt-3 pb-0">
        <div className="flex items-center justify-between mb-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSubView('table')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
                subView === 'table'
                  ? 'bg-white text-[#041E42] border-gray-200'
                  : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 18h18M3 6h18" />
                </svg>
                Table
              </span>
            </button>
            <button
              onClick={() => setSubView('charts')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
                subView === 'charts'
                  ? 'bg-white text-[#041E42] border-gray-200'
                  : 'bg-gray-50 text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Charts
              </span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 text-xs font-medium bg-[#041E42] text-white rounded-lg hover:bg-[#041E42]/90 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Company
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-3 py-1.5 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              Import
            </button>
            <button
              onClick={() => setShowAuditModal(true)}
              className="px-3 py-1.5 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Audit
            </button>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-1.5 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 w-44">
                  <button
                    onClick={() => { exportToCSV(filtered, `prospects-filtered-${new Date().toISOString().slice(0,10)}.csv`); setShowExportMenu(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Export filtered ({filtered.length})
                  </button>
                  <button
                    onClick={() => { exportToCSV(prospects, `prospects-all-${new Date().toISOString().slice(0,10)}.csv`); setShowExportMenu(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Export all ({prospects.length})
                  </button>
                </div>
              </>
            )}
          </div>
          </div>
        </div>
      </div>

      <ProspectFilters
        filters={filters}
        onFilterChange={setFilters}
        totalCount={prospects.length}
        filteredCount={filtered.length}
        actionItemCount={actionItemCount}
      />

      {subView === 'charts' ? (
        <div className="flex-1 overflow-auto bg-gray-50">
          <ProspectAnalytics filters={filters} onFilterChange={setFilters} />
        </div>
      ) : (
      <>
      {/* Table container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1200px]">
          <thead className="bg-[#041E42] text-white sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-16 cursor-pointer" onClick={() => handleSort('outreach_rank')}>
                Rank <SortIcon column="outreach_rank" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-36 cursor-pointer" onClick={() => handleSort('outreach_group')}>
                Group <SortIcon column="outreach_group" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-28 cursor-pointer" onClick={() => handleSort('prospect_status')}>
                Status <SortIcon column="prospect_status" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer" onClick={() => handleSort('company')}>
                Company <SortIcon column="company" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-36 cursor-pointer" onClick={() => handleSort('category')}>
                Category <SortIcon column="category" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-32 cursor-pointer" onClick={() => handleSort('state')}>
                Location <SortIcon column="state" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-28 cursor-pointer" onClick={() => handleSort('priority_score')}>
                Priority <SortIcon column="priority_score" />
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16 cursor-pointer" onClick={() => handleSort('signal_count')}>
                Sig <SortIcon column="signal_count" />
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16 cursor-pointer" onClick={() => handleSort('press_count')}>
                Presses <SortIcon column="press_count" />
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16 cursor-pointer" onClick={() => handleSort('site_count')}>
                Sites <SortIcon column="site_count" />
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16 cursor-pointer" onClick={() => handleSort('acquisition_count')}>
                Acq <SortIcon column="acquisition_count" />
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16">
                RJG
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16">
                Med
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16 cursor-pointer" onClick={() => handleSort('cwp_contacts')}>
                CWP <SortIcon column="cwp_contacts" />
              </th>
              <th className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider w-20 cursor-pointer" onClick={() => handleSort('follow_up_date')}>
                Due <SortIcon column="follow_up_date" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-28 cursor-pointer" onClick={() => handleSort('ownership_type')}>
                Ownership <SortIcon column="ownership_type" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                Next Step
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grouped.length === 0 ? (
              <tr>
                <td colSpan={17} className="px-6 py-12 text-center text-gray-500">
                  {prospects.length === 0
                    ? 'No prospects loaded. Run the seed script or import from Excel.'
                    : 'No prospects match the current filters.'}
                </td>
              </tr>
            ) : (
              grouped.map((item) => {
                if (item.type === 'standalone') return renderProspectRow(item.prospect)
                const isExpanded = expandedGroups.has(item.groupName)
                return (
                  <Fragment key={`group-${item.groupName}`}>
                    {renderGroupHeaderRow(item)}
                    {isExpanded && item.children.map(c => renderProspectRow(c, { isChild: true }))}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedProspect && (
        <ProspectDetail
          prospect={selectedProspect}
          onClose={() => setSelectedProspect(null)}
          onUpdate={updateProspect}
          onRefresh={refreshProspects}
          prospectNavList={prospectNavList}
          onNavigate={(id) => {
            const found = prospects.find(p => p.id === id)
            if (found) setSelectedProspect(found)
          }}
        />
      )}
      </>
      )}

      {showAddModal && <AddCompanyModal onClose={() => setShowAddModal(false)} onSuccess={refreshProspects} />}
      {showImportModal && <BulkImportModal onClose={() => setShowImportModal(false)} onSuccess={refreshProspects} />}
      {showAuditModal && <DataAuditModal onClose={() => setShowAuditModal(false)} />}
    </div>
  )
}

export default ProspectTable
