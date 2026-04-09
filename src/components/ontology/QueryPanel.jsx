import { useState, useCallback } from 'react'
import { Search, X, ChevronDown, ChevronRight } from 'lucide-react'
import { ENTITY_COLORS } from './ForceGraph'
import QueryResults from './QueryResults'

const FILTER_SECTIONS = [
  { key: 'certifications', label: 'Certifications', type: 'Certification', param: 'certifications' },
  { key: 'technologies', label: 'Technologies', type: 'Technology / Software', param: 'technologies' },
  { key: 'markets', label: 'Markets', type: 'Market Vertical', param: 'markets' },
  { key: 'equipment', label: 'Equipment', type: 'Equipment Brand', param: 'equipment' },
  { key: 'ownership', label: 'Ownership', type: 'Ownership Structure', param: 'ownership' },
  { key: 'qualityMethods', label: 'Quality Methods', type: 'Quality Method', param: 'quality_methods' },
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
]

export default function QueryPanel({ filterOptions, stateFilter, onStateFilter, onQueryResults, graphData }) {
  const [selected, setSelected] = useState({})
  const [expandedSections, setExpandedSections] = useState({ certifications: true, technologies: true, markets: true })
  const [results, setResults] = useState(null)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState(null)
  const [similarData, setSimilarData] = useState(null)

  const apiBase = import.meta.env.VITE_API_URL || ''

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleChip = (sectionKey, value) => {
    setSelected(prev => {
      const current = prev[sectionKey] || []
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      return { ...prev, [sectionKey]: next }
    })
  }

  const totalSelected = Object.values(selected).reduce((sum, arr) => sum + arr.length, 0)

  const clearAll = () => {
    setSelected({})
    setResults(null)
    setSimilarData(null)
    onQueryResults(null)
    onStateFilter(null)
  }

  const runQuery = useCallback(async () => {
    setQueryLoading(true)
    setQueryError(null)
    setSimilarData(null)
    try {
      const params = new URLSearchParams({ action: 'ontology-query' })
      for (const section of FILTER_SECTIONS) {
        const vals = selected[section.key]
        if (vals && vals.length > 0) {
          params.set(section.param, vals.join(','))
        }
      }
      if (stateFilter) params.set('state', stateFilter)

      const res = await fetch(`${apiBase}/api/prospects?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setResults(data)

      // Pass matched company IDs to parent for graph highlighting
      if (data.results) {
        const companyIds = data.results.map(r => r.prospect_id || r.id)
        onQueryResults(companyIds)
      }
    } catch (err) {
      setQueryError(err.message)
    } finally {
      setQueryLoading(false)
    }
  }, [selected, stateFilter, apiBase, onQueryResults])

  const handleFindSimilar = useCallback(async (prospectId, companyName) => {
    setQueryLoading(true)
    setQueryError(null)
    try {
      const params = new URLSearchParams({
        action: 'ontology-similar',
        prospect_id: prospectId,
      })
      const res = await fetch(`${apiBase}/api/prospects?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSimilarData({ ...data, sourceCompany: companyName })

      // Highlight similar companies on graph
      if (data.similar) {
        const ids = [prospectId, ...data.similar.map(s => s.prospect_id || s.id)]
        onQueryResults(ids)
      }
    } catch (err) {
      setQueryError(err.message)
    } finally {
      setQueryLoading(false)
    }
  }, [apiBase, onQueryResults])

  const handleBackFromSimilar = () => {
    setSimilarData(null)
    if (results?.results) {
      const companyIds = results.results.map(r => r.prospect_id || r.id)
      onQueryResults(companyIds)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col max-h-[calc(100vh-180px)]">
      {/* Panel header */}
      <div className="px-3 py-2.5 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">Query Panel</h3>
        <p className="text-xs text-gray-500 mt-0.5">Find companies by ontology criteria</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* State filter */}
        <div className="px-3 py-2 border-b border-gray-100">
          <label className="text-xs font-medium text-gray-600 mb-1 block">State Filter</label>
          <div className="flex items-center gap-2">
            <select
              value={stateFilter || ''}
              onChange={(e) => onStateFilter(e.target.value || null)}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              <option value="">All states</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {stateFilter && (
              <button
                onClick={() => onStateFilter(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter sections */}
        {FILTER_SECTIONS.map(section => {
          const items = filterOptions[section.key] || []
          if (items.length === 0) return null
          const expanded = expandedSections[section.key]
          const sectionSelected = selected[section.key] || []

          return (
            <div key={section.key} className="border-b border-gray-100">
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: ENTITY_COLORS[section.type] || '#6B7280' }}
                  />
                  {section.label}
                  {sectionSelected.length > 0 && (
                    <span className="bg-[#041E42] text-white text-[10px] px-1.5 rounded-full">
                      {sectionSelected.length}
                    </span>
                  )}
                </span>
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {expanded && (
                <div className="px-3 pb-2 flex flex-wrap gap-1">
                  {items.map(item => {
                    const isActive = sectionSelected.includes(item.label)
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleChip(section.key, item.label)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                          isActive
                            ? 'bg-[#041E42] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {item.label}
                        <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                          {item.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Action buttons */}
        <div className="px-3 py-2.5 border-b border-gray-200 flex items-center gap-2">
          <button
            onClick={runQuery}
            disabled={totalSelected === 0 || queryLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#041E42] text-white text-xs font-medium rounded-md hover:bg-[#0a2d5e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Search className="w-3 h-3" />
            {queryLoading ? 'Searching…' : `Find Companies${totalSelected > 0 ? ` (${totalSelected} filters)` : ''}`}
          </button>
          {(totalSelected > 0 || stateFilter) && (
            <button
              onClick={clearAll}
              className="px-2.5 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors font-medium"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Query error */}
        {queryError && (
          <div className="px-3 py-2 bg-red-50 text-xs text-red-600">
            Query failed: {queryError}
          </div>
        )}

        {/* Results */}
        <QueryResults
          results={similarData ? null : results}
          similarData={similarData}
          onFindSimilar={handleFindSimilar}
          onBackFromSimilar={handleBackFromSimilar}
          loading={queryLoading}
        />
      </div>
    </div>
  )
}
