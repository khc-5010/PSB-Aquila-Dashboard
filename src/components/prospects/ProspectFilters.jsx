import { useState, useRef, useEffect } from 'react'
import { Wrench, Star, HelpCircle, Clock, AlertTriangle, Users, ShieldCheck, ChevronDown } from 'lucide-react'
import { PARENT_CATEGORY_OPTIONS } from '../../utils/categoryGroups'

const LEGEND_KEY = 'prospect-table-legend-dismissed'

const GROUP_OPTIONS = ['Group 1', 'Group 2', 'Time-Sensitive', 'Infrastructure', 'Unassigned']
const PRIORITY_OPTIONS = ['HIGH PRIORITY', 'QUALIFIED', 'WATCH', 'LOW', 'STRATEGIC PARTNER']
const GEO_OPTIONS = ['Great Lakes Auto', 'Northeast Tool', 'Southeast Growth', 'Gulf / Resin Belt', 'Upper Midwest Medical', 'West Coast', 'Mountain / Central']
const STATUS_OPTIONS = ['Identified', 'Prioritized', 'Research Complete', 'Outreach Ready', 'Converted', 'Nurture']
const CATEGORY_OPTIONS = PARENT_CATEGORY_OPTIONS.filter(o => o !== 'All')

const PRESETS = [
  { label: 'Action Items', filter: { preset: 'action_items' } },
  { label: 'Stale', filter: { preset: 'stale' } },
  { label: 'Group 1', filter: { group: ['Group 1'] } },
  { label: 'Group 2', filter: { group: ['Group 2'] } },
  { label: 'Time-Sensitive', filter: { group: ['Time-Sensitive'] } },
  { label: 'Medical Molders', filter: { preset: 'medical' } },
  { label: 'Mold Maker + Converter', filter: { category: ['Mold Maker + Converter'] } },
  { label: 'Home Turf', filter: { geo: ['Northeast Tool'] } },
  { label: 'Warm Leads', filter: { preset: 'warm_leads' } },
  { label: 'Ready for Research', filter: { preset: 'ready_for_research' } },
  { label: 'Needs Review', filter: { preset: 'needs_review' } },
]

function MultiSelectFilter({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const toggle = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const displayText = selected.length === 0
    ? `All ${label}`
    : selected.length === 1
      ? selected[0]
      : `${selected.length} ${label}`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-sm border rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 focus:border-[#041E42] ${
          selected.length > 0
            ? 'border-[#041E42] bg-[#041E42]/5 text-[#041E42]'
            : 'border-gray-300 text-gray-700 hover:border-gray-400'
        }`}
      >
        <span className="truncate max-w-[160px]">{displayText}</span>
        {selected.length > 1 && (
          <span className="bg-[#041E42] text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-medium">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 min-w-[200px] max-h-[280px] overflow-auto">
          <div className="px-3 py-1.5 flex justify-between text-xs text-gray-500 border-b border-gray-100">
            <button onClick={() => onChange([...options])} className="hover:text-[#041E42] transition-colors">Select all</button>
            <button onClick={() => onChange([])} className="hover:text-[#041E42] transition-colors">Clear</button>
          </div>
          {options.map(option => (
            <label key={option} className="flex items-center px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                className="mr-2 rounded border-gray-300 text-[#041E42] focus:ring-[#041E42]/20"
              />
              {option}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function ProspectFilters({ filters, onFilterChange, totalCount, filteredCount, actionItemCount = 0 }) {
  const [searchText, setSearchText] = useState('')
  const [showLegend, setShowLegend] = useState(() => {
    try { return localStorage.getItem(LEGEND_KEY) !== 'true' } catch { return true }
  })

  const handleCloseLegend = () => {
    setShowLegend(false)
    try { localStorage.setItem(LEGEND_KEY, 'true') } catch {}
  }

  const handleOpenLegend = () => {
    setShowLegend(true)
    try { localStorage.removeItem(LEGEND_KEY) } catch {}
  }

  const emptyFilters = { group: [], category: [], priority: [], geo: [], status: [], search: '', preset: null }

  const handlePreset = (preset) => {
    setSearchText('')
    if (preset.filter.preset) {
      onFilterChange({ ...emptyFilters, preset: preset.filter.preset })
    } else {
      const newFilters = { ...emptyFilters }
      if (preset.filter.group) newFilters.group = preset.filter.group
      if (preset.filter.category) newFilters.category = preset.filter.category
      if (preset.filter.geo) newFilters.geo = preset.filter.geo
      onFilterChange(newFilters)
    }
  }

  const handleClear = () => {
    setSearchText('')
    onFilterChange({ ...emptyFilters })
  }

  const handleSearch = (value) => {
    setSearchText(value)
    onFilterChange({ ...filters, search: value })
  }

  const arraysEqual = (a, b) => a.length === b.length && a.every(v => b.includes(v))

  const isActivePreset = (preset) => {
    if (preset.filter.preset) return filters.preset === preset.filter.preset
    if (preset.filter.group) return arraysEqual(filters.group, preset.filter.group) && filters.category.length === 0 && filters.priority.length === 0 && filters.geo.length === 0 && filters.status.length === 0 && !filters.preset
    if (preset.filter.category) return arraysEqual(filters.category, preset.filter.category) && filters.group.length === 0 && filters.priority.length === 0 && filters.geo.length === 0 && filters.status.length === 0 && !filters.preset
    if (preset.filter.geo) return arraysEqual(filters.geo, preset.filter.geo) && filters.group.length === 0 && filters.category.length === 0 && filters.priority.length === 0 && filters.status.length === 0 && !filters.preset
    return false
  }

  const hasActiveFilters = filters.group.length > 0 || filters.category.length > 0 ||
    filters.priority.length > 0 || filters.geo.length > 0 || filters.status.length > 0 || filters.search || filters.preset

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

        {!showLegend && (
          <button
            onClick={handleOpenLegend}
            className="text-xs text-gray-400 hover:text-gray-500 flex items-center gap-1 transition-colors"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            Icon guide
          </button>
        )}

        <span className="ml-auto flex items-center gap-2 text-sm text-gray-500">
          {filteredCount === totalCount
            ? `${totalCount} companies`
            : `${filteredCount} of ${totalCount} companies`}
          {actionItemCount > 0 && (
            <button
              type="button"
              onClick={() => { setSearchText(''); onFilterChange({ ...emptyFilters, preset: 'action_items' }) }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 cursor-pointer hover:bg-red-200 transition-colors"
            >
              {actionItemCount} action item{actionItemCount !== 1 ? 's' : ''}
            </button>
          )}
        </span>
      </div>

      {/* Icon legend row */}
      {showLegend && (
        <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500 pt-1 pb-0.5 border-t border-gray-100">
          <span className="text-gray-400 font-medium mr-1">Icons:</span>
          <span className="inline-flex items-center gap-1"><Wrench className="w-3 h-3 text-[#041E42]" /> In-house tooling</span>
          <span className="text-gray-200">|</span>
          <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-amber-600" fill="#FBBF24" /> RJG confirmed</span>
          <span className="inline-flex items-center gap-1"><HelpCircle className="w-3 h-3 text-yellow-500" /> RJG likely</span>
          <span className="text-gray-200">|</span>
          <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-green-600" /> Medical</span>
          <span className="text-gray-200">|</span>
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-red-500" /> PE urgent</span>
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-amber-500" /> PE window</span>
          <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-orange-400" /> Succession</span>
          <span className="inline-flex items-center gap-1"><Users className="w-3 h-3 text-blue-500" /> ESOP</span>
          <button
            onClick={handleCloseLegend}
            className="text-gray-300 hover:text-gray-500 ml-auto"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Bottom row: Multi-select dropdown filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Filters:</label>

        <MultiSelectFilter
          label="Groups"
          options={GROUP_OPTIONS}
          selected={filters.group}
          onChange={(val) => onFilterChange({ ...filters, group: val, preset: null })}
        />

        <MultiSelectFilter
          label="Categories"
          options={CATEGORY_OPTIONS}
          selected={filters.category}
          onChange={(val) => onFilterChange({ ...filters, category: val, preset: null })}
        />

        <MultiSelectFilter
          label="Priorities"
          options={PRIORITY_OPTIONS}
          selected={filters.priority}
          onChange={(val) => onFilterChange({ ...filters, priority: val, preset: null })}
        />

        <MultiSelectFilter
          label="Corridors"
          options={GEO_OPTIONS}
          selected={filters.geo}
          onChange={(val) => onFilterChange({ ...filters, geo: val, preset: null })}
        />

        <MultiSelectFilter
          label="Statuses"
          options={STATUS_OPTIONS}
          selected={filters.status}
          onChange={(val) => onFilterChange({ ...filters, status: val, preset: null })}
        />
      </div>
    </div>
  )
}

export default ProspectFilters
