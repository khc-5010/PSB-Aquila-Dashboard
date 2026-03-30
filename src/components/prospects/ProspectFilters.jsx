import { useState } from 'react'

const GROUP_OPTIONS = ['All', 'Group 1', 'Group 2', 'Time-Sensitive', 'Infrastructure', 'Unassigned']
const CATEGORY_OPTIONS = ['All', 'Converter+Tooling', 'Converter', 'Mold Maker', 'Hot Runner Systems', 'Knowledge Sector', 'Catalog/Standards', 'Strategic Partner']
const PRIORITY_OPTIONS = ['All', 'HIGH PRIORITY', 'QUALIFIED', 'WATCH', 'STRATEGIC PARTNER']
const GEO_OPTIONS = ['All', 'Tier 1', 'Tier 2', 'Infrastructure']
const STATUS_OPTIONS = ['All', 'Identified', 'Prioritized', 'Research Complete', 'Outreach Ready', 'Converted', 'Nurture']

const PRESETS = [
  { label: 'Group 1', filter: { group: 'Group 1' } },
  { label: 'Group 2', filter: { group: 'Group 2' } },
  { label: 'Time-Sensitive', filter: { group: 'Time-Sensitive' } },
  { label: 'Medical Molders', filter: { preset: 'medical' } },
  { label: 'Converter+Tooling', filter: { category: 'Converter+Tooling' } },
  { label: 'Tier 1 Local', filter: { geo: 'Tier 1' } },
  { label: 'Warm Leads', filter: { preset: 'warm_leads' } },
  { label: 'Ready for Research', filter: { preset: 'ready_for_research' } },
]

function ProspectFilters({ filters, onFilterChange, totalCount, filteredCount }) {
  const [searchText, setSearchText] = useState('')

  const handlePreset = (preset) => {
    if (preset.filter.preset === 'medical') {
      onFilterChange({ group: 'All', category: 'All', priority: 'All', geo: 'All', status: 'All', search: '', preset: 'medical' })
    } else if (preset.filter.preset === 'warm_leads') {
      onFilterChange({ group: 'All', category: 'All', priority: 'All', geo: 'All', status: 'All', search: '', preset: 'warm_leads' })
    } else if (preset.filter.preset === 'ready_for_research') {
      onFilterChange({ group: 'All', category: 'All', priority: 'All', geo: 'All', status: 'All', search: '', preset: 'ready_for_research' })
    } else {
      const newFilters = { group: 'All', category: 'All', priority: 'All', geo: 'All', status: 'All', search: '', preset: null }
      if (preset.filter.group) newFilters.group = preset.filter.group
      if (preset.filter.category) newFilters.category = preset.filter.category
      if (preset.filter.geo) newFilters.geo = preset.filter.geo
      onFilterChange(newFilters)
    }
  }

  const handleClear = () => {
    setSearchText('')
    onFilterChange({ group: 'All', category: 'All', priority: 'All', geo: 'All', status: 'All', search: '', preset: null })
  }

  const handleSearch = (value) => {
    setSearchText(value)
    onFilterChange({ ...filters, search: value })
  }

  const isActivePreset = (preset) => {
    if (preset.filter.preset === 'medical') return filters.preset === 'medical'
    if (preset.filter.preset === 'warm_leads') return filters.preset === 'warm_leads'
    if (preset.filter.preset === 'ready_for_research') return filters.preset === 'ready_for_research'
    if (preset.filter.group) return filters.group === preset.filter.group
    if (preset.filter.category) return filters.category === preset.filter.category
    if (preset.filter.geo) return filters.geo === preset.filter.geo
    return false
  }

  const hasActiveFilters = filters.group !== 'All' || filters.category !== 'All' ||
    filters.priority !== 'All' || filters.geo !== 'All' || filters.status !== 'All' || filters.search || filters.preset

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 space-y-3">
      {/* Top row: Search + Quick presets */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <input
            type="text"
            placeholder="Search companies..."
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42] w-64"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="h-6 w-px bg-gray-300" />

        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePreset(preset)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              isActivePreset(preset)
                ? 'bg-[#041E42] text-white border-[#041E42]'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
            }`}
          >
            {preset.label}
          </button>
        ))}

        {hasActiveFilters && (
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-sm text-gray-500">
          {filteredCount === totalCount
            ? `${totalCount} companies`
            : `${filteredCount} of ${totalCount} companies`}
        </span>
      </div>

      {/* Bottom row: Dropdown filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Filters:</label>

        <select
          value={filters.group}
          onChange={(e) => onFilterChange({ ...filters, group: e.target.value, preset: null })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42]"
        >
          {GROUP_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'All Groups' : o}</option>)}
        </select>

        <select
          value={filters.category}
          onChange={(e) => onFilterChange({ ...filters, category: e.target.value, preset: null })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42]"
        >
          {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'All Categories' : o}</option>)}
        </select>

        <select
          value={filters.priority}
          onChange={(e) => onFilterChange({ ...filters, priority: e.target.value, preset: null })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42]"
        >
          {PRIORITY_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'All Priorities' : o}</option>)}
        </select>

        <select
          value={filters.geo}
          onChange={(e) => onFilterChange({ ...filters, geo: e.target.value, preset: null })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42]"
        >
          {GEO_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'All Geographies' : o}</option>)}
        </select>

        <select
          value={filters.status}
          onChange={(e) => onFilterChange({ ...filters, status: e.target.value, preset: null })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42]"
        >
          {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'All Statuses' : o}</option>)}
        </select>
      </div>
    </div>
  )
}

export default ProspectFilters
