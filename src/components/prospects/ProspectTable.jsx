import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'

import ProspectFilters from './ProspectFilters'
import ProspectDetail from './ProspectDetail'
import ProspectAnalytics from './ProspectAnalytics'
import OutreachGroupBadge from './OutreachGroupBadge'
import StatusBadge from './StatusBadge'
import AddCompanyModal from './AddCompanyModal'
import BulkImportModal from './BulkImportModal'

const GROUP_OPTIONS = ['Group 1', 'Group 2', 'Time-Sensitive', 'Infrastructure', 'Unassigned']

const GROUP_SORT_ORDER = {
  'Group 1': 1,
  'Time-Sensitive': 2,
  'Group 2': 3,
  'Infrastructure': 4,
  'Unassigned': 5,
}

const PRIORITY_COLORS = {
  'HIGH PRIORITY': 'bg-red-100 text-red-700',
  'QUALIFIED': 'bg-blue-100 text-blue-700',
  'WATCH': 'bg-yellow-100 text-yellow-700',
  'STRATEGIC PARTNER': 'bg-purple-100 text-purple-700',
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

function exportToCSV(data, filename) {
  const columns = [
    'company', 'also_known_as', 'category', 'in_house_tooling',
    'city', 'state', 'geography_tier', 'source_report', 'priority',
    'employees_approx', 'year_founded', 'years_in_business',
    'revenue_known', 'revenue_est_m', 'press_count',
    'signal_count', 'top_signal', 'rjg_cavity_pressure', 'medical_device_mfg',
    'key_certifications', 'ownership_type', 'recent_ma', 'parent_company', 'decision_location',
    'cwp_contacts', 'psb_connection_notes',
    'engagement_type', 'suggested_next_step', 'legacy_data_potential', 'notes',
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

function ProspectTable() {
  const { user } = useAuth()
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedProspect, setSelectedProspect] = useState(null)
  const [filters, setFilters] = useState({
    group: 'All', category: 'All', priority: 'All', geo: 'All', status: 'All', search: '', preset: null,
  })
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [editingRank, setEditingRank] = useState(null)
  const [editingRankValue, setEditingRankValue] = useState('')
  const [subView, setSubView] = useState('table') // 'table' | 'charts'
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

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

  // Filter logic
  const filtered = prospects.filter(p => {
    if (filters.preset === 'medical') {
      const isMolder = p.category === 'Converter+Tooling' || p.category === 'Converter'
      if (!isMolder || p.medical_device_mfg !== 'Yes') return false
    }
    if (filters.preset === 'warm_leads') {
      if ((p.cwp_contacts ?? 0) < 5) return false
    }
    if (filters.preset === 'ready_for_research') {
      if (p.prospect_status !== 'Prioritized') return false
    }
    if (filters.group !== 'All' && p.outreach_group !== filters.group) return false
    if (filters.category !== 'All' && p.category !== filters.category) return false
    if (filters.priority !== 'All' && p.priority !== filters.priority) return false
    if (filters.geo !== 'All' && p.geography_tier !== filters.geo) return false
    if (filters.status !== 'All' && p.prospect_status !== filters.status) return false
    if (filters.search) {
      const s = filters.search.toLowerCase()
      const searchable = [p.company, p.city, p.state, p.category, p.notes, p.suggested_next_step]
        .filter(Boolean).join(' ').toLowerCase()
      if (!searchable.includes(s)) return false
    }
    return true
  })

  // Sort logic
  const sorted = [...filtered].sort((a, b) => {
    if (sortConfig.key) {
      let aVal = a[sortConfig.key]
      let bVal = b[sortConfig.key]
      if (aVal === null || aVal === undefined) aVal = ''
      if (bVal === null || bVal === undefined) bVal = ''
      // Composite sort: state sorts by "STATE, City" so states group together
      if (sortConfig.key === 'state') {
        aVal = `${a.state || ''}, ${a.city || ''}`
        bVal = `${b.state || ''}, ${b.city || ''}`
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      const cmp = String(aVal).localeCompare(String(bVal))
      return sortConfig.direction === 'asc' ? cmp : -cmp
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
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-28 cursor-pointer" onClick={() => handleSort('priority')}>
                Priority <SortIcon column="priority" />
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider w-16 cursor-pointer" onClick={() => handleSort('signal_count')}>
                Sig <SortIcon column="signal_count" />
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
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-28 cursor-pointer" onClick={() => handleSort('ownership_type')}>
                Ownership <SortIcon column="ownership_type" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                Next Step
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-6 py-12 text-center text-gray-500">
                  {prospects.length === 0
                    ? 'No prospects loaded. Run the seed script or import from Excel.'
                    : 'No prospects match the current filters.'}
                </td>
              </tr>
            ) : (
              sorted.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedProspect(p)}
                >
                  {/* Outreach Rank - inline editable */}
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {editingRank === p.id ? (
                      <input
                        type="number"
                        min="1"
                        autoFocus
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

                  {/* Group - dropdown editable */}
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={p.outreach_group || 'Unassigned'}
                      onChange={(e) => updateProspect(p.id, 'outreach_group', e.target.value)}
                      className="text-xs font-medium rounded-full px-2 py-1 border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                      style={{
                        backgroundColor: {
                          'Group 1': '#dcfce7', 'Group 2': '#dbeafe', 'Time-Sensitive': '#fef3c7',
                          'Infrastructure': '#f3e8ff', 'Unassigned': '#f3f4f6',
                        }[p.outreach_group || 'Unassigned'],
                        color: {
                          'Group 1': '#15803d', 'Group 2': '#1d4ed8', 'Time-Sensitive': '#b45309',
                          'Infrastructure': '#7e22ce', 'Unassigned': '#6b7280',
                        }[p.outreach_group || 'Unassigned'],
                        borderColor: {
                          'Group 1': '#86efac', 'Group 2': '#93c5fd', 'Time-Sensitive': '#fcd34d',
                          'Infrastructure': '#c4b5fd', 'Unassigned': '#d1d5db',
                        }[p.outreach_group || 'Unassigned'],
                      }}
                    >
                      {GROUP_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2.5">
                    <StatusBadge status={p.prospect_status} />
                  </td>

                  {/* Company */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center">
                      {(p.cwp_contacts ?? 0) >= 5 && (
                        <span className={`inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0 ${
                          (p.cwp_contacts ?? 0) >= 20 ? 'bg-red-500' :
                          (p.cwp_contacts ?? 0) >= 10 ? 'bg-orange-500' : 'bg-amber-400'
                        }`} title={`${p.cwp_contacts} CWP contacts`} />
                      )}
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900">{p.company}</span>
                        {p.also_known_as && (
                          <div className="text-xs text-gray-400 italic">fka {p.also_known_as}</div>
                        )}
                      </div>
                      {(p.conversion_count ?? 0) > 0 && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700" title={`${p.conversion_count} active opportunity${p.conversion_count > 1 ? 'ies' : ''}`}>
                          {p.conversion_count}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Category */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-gray-600">{displayValue(p.category)}</span>
                  </td>

                  {/* Location */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-gray-600">
                      {p.city && p.state ? `${p.city}, ${p.state}` : displayValue(p.city || p.state)}
                    </span>
                  </td>

                  {/* Priority */}
                  <td className="px-3 py-2.5">
                    {p.priority ? (
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${PRIORITY_COLORS[p.priority] || 'bg-gray-100 text-gray-600'}`}>
                        {p.priority}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">{'\u2014'}</span>
                    )}
                  </td>

                  {/* Signal Count */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-sm text-gray-700">{displayValue(p.signal_count)}</span>
                  </td>

                  {/* RJG */}
                  <td className="px-3 py-2.5 text-center">
                    {p.rjg_cavity_pressure === 'Yes' || p.rjg_cavity_pressure === 'Yes (confirmed)' ? (
                      <span className="inline-block w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs leading-5">&#x2713;</span>
                    ) : p.rjg_cavity_pressure === 'Likely' ? (
                      <span className="text-xs text-yellow-600">~</span>
                    ) : (
                      <span className="text-xs text-gray-400">{'\u2014'}</span>
                    )}
                  </td>

                  {/* Medical */}
                  <td className="px-3 py-2.5 text-center">
                    {p.medical_device_mfg === 'Yes' ? (
                      <span className="inline-block w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs leading-5">&#x2713;</span>
                    ) : (
                      <span className="text-xs text-gray-400">{'\u2014'}</span>
                    )}
                  </td>

                  {/* CWP Contacts */}
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm ${cwpHeatClass(p.cwp_contacts ?? 0)}`}>
                      {displayValue(p.cwp_contacts)}
                    </span>
                  </td>

                  {/* Ownership */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-gray-600">{displayValue(p.ownership_type)}</span>
                  </td>

                  {/* Suggested Next Step */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-gray-600 truncate block max-w-[200px]" title={p.suggested_next_step || ''}>
                      {displayValue(p.suggested_next_step)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Panel */}
      <ProspectDetail
        prospect={selectedProspect}
        onClose={() => setSelectedProspect(null)}
        onUpdate={updateProspect}
        onRefresh={refreshProspects}
      />
      </>
      )}

      {showAddModal && <AddCompanyModal onClose={() => setShowAddModal(false)} onSuccess={refreshProspects} />}
      {showImportModal && <BulkImportModal onClose={() => setShowImportModal(false)} onSuccess={refreshProspects} />}
    </div>
  )
}

export default ProspectTable
