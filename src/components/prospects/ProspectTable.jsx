import { useState, useEffect, useCallback } from 'react'

import ProspectFilters from './ProspectFilters'
import ProspectDetail from './ProspectDetail'
import WaveBadge from './WaveBadge'

const WAVE_OPTIONS = ['Wave 1', 'Wave 2', 'Time-Sensitive', 'Infrastructure', 'Unassigned']

const WAVE_SORT_ORDER = {
  'Wave 1': 1,
  'Time-Sensitive': 2,
  'Wave 2': 3,
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

function ProspectTable() {
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedProspect, setSelectedProspect] = useState(null)
  const [filters, setFilters] = useState({
    wave: 'All', category: 'All', priority: 'All', geo: 'All', search: '', preset: null,
  })
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [editingRank, setEditingRank] = useState(null)
  const [editingRankValue, setEditingRankValue] = useState('')

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
  const updateProspect = useCallback(async (id, field, value, editedBy = 'Brett') => {
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
  }, [selectedProspect])

  // Filter logic
  const filtered = prospects.filter(p => {
    if (filters.preset === 'medical') {
      const isMolder = p.category === 'Converter+Tooling' || p.category === 'Converter'
      if (!isMolder || p.medical_device_mfg !== 'Yes') return false
    }
    if (filters.wave !== 'All' && p.engagement_wave !== filters.wave) return false
    if (filters.category !== 'All' && p.category !== filters.category) return false
    if (filters.priority !== 'All' && p.priority !== filters.priority) return false
    if (filters.geo !== 'All' && p.geography_tier !== filters.geo) return false
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
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      const cmp = String(aVal).localeCompare(String(bVal))
      return sortConfig.direction === 'asc' ? cmp : -cmp
    }
    // Default sort: wave order → rank → signal_count desc
    const waveA = WAVE_SORT_ORDER[a.engagement_wave] || 5
    const waveB = WAVE_SORT_ORDER[b.engagement_wave] || 5
    if (waveA !== waveB) return waveA - waveB
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
      <ProspectFilters
        filters={filters}
        onFilterChange={setFilters}
        totalCount={prospects.length}
        filteredCount={filtered.length}
      />

      {/* Table container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1200px]">
          <thead className="bg-[#041E42] text-white sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-16 cursor-pointer" onClick={() => handleSort('outreach_rank')}>
                Rank <SortIcon column="outreach_rank" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-36 cursor-pointer" onClick={() => handleSort('engagement_wave')}>
                Wave <SortIcon column="engagement_wave" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer" onClick={() => handleSort('company')}>
                Company <SortIcon column="company" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-36 cursor-pointer" onClick={() => handleSort('category')}>
                Category <SortIcon column="category" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider w-32 cursor-pointer" onClick={() => handleSort('city')}>
                Location <SortIcon column="city" />
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
                <td colSpan={12} className="px-6 py-12 text-center text-gray-500">
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

                  {/* Wave - dropdown editable */}
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={p.engagement_wave || 'Unassigned'}
                      onChange={(e) => updateProspect(p.id, 'engagement_wave', e.target.value)}
                      className="text-xs font-medium rounded-full px-2 py-1 border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#041E42]/20"
                      style={{
                        backgroundColor: {
                          'Wave 1': '#dcfce7', 'Wave 2': '#dbeafe', 'Time-Sensitive': '#fef3c7',
                          'Infrastructure': '#f3e8ff', 'Unassigned': '#f3f4f6',
                        }[p.engagement_wave || 'Unassigned'],
                        color: {
                          'Wave 1': '#15803d', 'Wave 2': '#1d4ed8', 'Time-Sensitive': '#b45309',
                          'Infrastructure': '#7e22ce', 'Unassigned': '#6b7280',
                        }[p.engagement_wave || 'Unassigned'],
                        borderColor: {
                          'Wave 1': '#86efac', 'Wave 2': '#93c5fd', 'Time-Sensitive': '#fcd34d',
                          'Infrastructure': '#c4b5fd', 'Unassigned': '#d1d5db',
                        }[p.engagement_wave || 'Unassigned'],
                      }}
                    >
                      {WAVE_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </td>

                  {/* Company */}
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-medium text-gray-900">{p.company}</span>
                    {p.also_known_as && (
                      <span className="text-xs text-gray-400 ml-1">({p.also_known_as})</span>
                    )}
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
                    <span className={`text-sm ${(p.cwp_contacts ?? 0) >= 5 ? 'font-semibold text-green-700' : 'text-gray-700'}`}>
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
      />
    </div>
  )
}

export default ProspectTable
