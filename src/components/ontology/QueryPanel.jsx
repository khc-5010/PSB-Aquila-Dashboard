import { useState, useCallback, useEffect } from 'react'
import { Search, X, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react'
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

// Map entity type to the query param key for ontology-query
const TYPE_TO_PARAM = {
  'Certification': 'certifications',
  'Technology / Software': 'technologies',
  'Market Vertical': 'markets',
  'Equipment Brand': 'equipment',
  'Ownership Structure': 'ownership',
  'Quality Method': 'quality_methods',
}

export default function QueryPanel({ filterOptions, stateFilter, onStateFilter, onQueryResults, graphData, browseNode, onClearBrowse }) {
  const [selected, setSelected] = useState({})
  const [expandedSections, setExpandedSections] = useState({ certifications: true, technologies: true, markets: true })
  const [results, setResults] = useState(null)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState(null)
  const [similarData, setSimilarData] = useState(null)

  // Browse mode state
  const [browseCompanies, setBrowseCompanies] = useState(null)
  const [browseSearch, setBrowseSearch] = useState('')
  const [browseLoading, setBrowseLoading] = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || ''

  // Fetch member companies when entering browse mode
  useEffect(() => {
    if (!browseNode) {
      setBrowseCompanies(null)
      setBrowseSearch('')
      return
    }

    let cancelled = false
    async function fetchBrowseCompanies() {
      setBrowseLoading(true)
      try {
        const paramKey = TYPE_TO_PARAM[browseNode.type]
        if (!paramKey) { setBrowseLoading(false); return }

        // Fetch matching companies from ontology-query AND full prospects for enrichment
        const queryParams = new URLSearchParams({
          action: 'ontology-query',
          [paramKey]: browseNode.label,
        })
        if (stateFilter) queryParams.set('state', stateFilter)

        const [queryRes, prospectsRes] = await Promise.all([
          fetch(`${apiBase}/api/prospects?${queryParams}`),
          fetch(`${apiBase}/api/prospects`),
        ])

        if (!queryRes.ok) throw new Error(`HTTP ${queryRes.status}`)
        const queryData = await queryRes.json()

        // Build prospect enrichment map (id → { signal_count, ... })
        let prospectMap = new Map()
        if (prospectsRes.ok) {
          const allProspects = await prospectsRes.json()
          const list = Array.isArray(allProspects) ? allProspects : allProspects.prospects || []
          for (const p of list) {
            prospectMap.set(p.id, p)
          }
        }

        if (!cancelled) {
          // Enrich query results with prospect data and sort by signal_count DESC
          const enriched = (queryData.results || []).map(c => {
            const p = prospectMap.get(c.id)
            return {
              ...c,
              signal_count: p?.signal_count ?? null,
              key_certifications: p?.key_certifications || null,
              rjg_cavity_pressure: p?.rjg_cavity_pressure || null,
              medical_device_mfg: p?.medical_device_mfg || null,
              ownership_type: p?.ownership_type || null,
            }
          })
          enriched.sort((a, b) => (b.signal_count ?? -1) - (a.signal_count ?? -1))
          setBrowseCompanies(enriched)
        }
      } catch (err) {
        console.error('Failed to fetch browse companies:', err)
        if (!cancelled) setBrowseCompanies([])
      } finally {
        if (!cancelled) setBrowseLoading(false)
      }
    }

    fetchBrowseCompanies()
    return () => { cancelled = true }
  }, [browseNode, stateFilter, apiBase])

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
  }

  const handleExitBrowse = () => {
    if (onClearBrowse) onClearBrowse()
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

  // ─── Browse mode ───
  if (browseNode) {
    const filtered = browseCompanies
      ? browseCompanies.filter(c => {
          if (!browseSearch.trim()) return true
          const lower = browseSearch.toLowerCase()
          return (c.company || '').toLowerCase().includes(lower) ||
                 (c.state || '').toLowerCase().includes(lower) ||
                 (c.city || '').toLowerCase().includes(lower)
        })
      : []

    // Build a map of entity name → super-node info for "also belongs to" tags
    const superNodeByName = buildSuperNodeNameMap(graphData, browseNode)

    return (
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col max-h-[calc(100vh-180px)]">
        {/* Browse header */}
        <div className="px-3 py-2.5 border-b border-gray-200 bg-gray-50">
          <button
            onClick={handleExitBrowse}
            className="flex items-center gap-1 text-xs text-[#041E42] hover:underline font-medium mb-1.5"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Query Panel
          </button>
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: ENTITY_COLORS[browseNode.type] || '#6B7280' }}
            />
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                {browseNode.label}
              </h3>
              <p className="text-xs text-gray-500">
                {browseNode.type} · {browseNode.count || 0} companies
              </p>
            </div>
          </div>
          {/* Breadcrumb indicator */}
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400">
            <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Browsing category</span>
            <span>— too large to expand on graph</span>
          </div>
        </div>

        {/* Search box */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded px-2 py-1">
            <Search className="w-3 h-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search companies…"
              value={browseSearch}
              onChange={(e) => setBrowseSearch(e.target.value)}
              className="flex-1 text-xs bg-transparent border-none outline-none placeholder-gray-400"
            />
            {browseSearch && (
              <button onClick={() => setBrowseSearch('')} className="text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {browseCompanies && (
            <p className="text-[10px] text-gray-400 mt-1">
              {filtered.length === browseCompanies.length
                ? `${browseCompanies.length} companies`
                : `${filtered.length} of ${browseCompanies.length} companies`}
            </p>
          )}
        </div>

        {/* Company list */}
        <div className="flex-1 overflow-y-auto">
          {browseLoading ? (
            <div className="px-3 py-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-[#041E42] rounded-full animate-spin" />
            </div>
          ) : filtered.length > 0 ? (
            <div className="px-3 py-2 space-y-1.5">
              {filtered.map((company, i) => {
                // Derive other super-nodes from prospect's structured data
                const otherNodes = deriveOtherSuperNodes(company, superNodeByName)
                return (
                  <BrowseCompanyCard
                    key={company.id || i}
                    company={company}
                    otherSuperNodes={otherNodes}
                    onFindSimilar={handleFindSimilar}
                  />
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-6 text-center">
              {browseSearch ? 'No matching companies' : 'No companies found'}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ─── Normal query mode ───
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
          {totalSelected > 0 && (
            <button
              onClick={clearAll}
              className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
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

// Card for a company in browse mode
function BrowseCompanyCard({ company, otherSuperNodes, onFindSimilar }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h5 className="text-xs font-semibold text-gray-900 truncate">
            {company.company}
          </h5>
          <div className="flex items-center gap-2 mt-0.5">
            {company.state && (
              <span className="text-[10px] text-gray-500">
                {company.city ? `${company.city}, ` : ''}{company.state}
              </span>
            )}
            {company.signal_count != null && (
              <span className="text-[10px] text-gray-400">
                Sig: {company.signal_count}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Other super-nodes this company belongs to */}
      {otherSuperNodes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {otherSuperNodes.slice(0, 5).map((sn, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]"
              style={{
                backgroundColor: (ENTITY_COLORS[sn.type] || '#6B7280') + '18',
                color: ENTITY_COLORS[sn.type] || '#6B7280',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: ENTITY_COLORS[sn.type] || '#6B7280' }}
              />
              {sn.label}
            </span>
          ))}
          {otherSuperNodes.length > 5 && (
            <span className="text-[10px] text-gray-400">+{otherSuperNodes.length - 5}</span>
          )}
        </div>
      )}

      {/* Find similar button */}
      {onFindSimilar && (
        <button
          onClick={() => onFindSimilar(company.id, company.company)}
          className="mt-1.5 text-[10px] text-[#041E42] hover:underline"
        >
          Find similar companies
        </button>
      )}
    </div>
  )
}

// Build a map: entity name → { label, type } for all super-nodes except the current browse node
function buildSuperNodeNameMap(graphData, currentBrowseNode) {
  const map = new Map()
  if (!graphData?.nodes) return map

  for (const node of graphData.nodes) {
    if (!node.isSuper) continue
    if (node.id === currentBrowseNode.id) continue
    map.set(node.label.toLowerCase(), { label: node.label, type: node.type })
  }

  return map
}

// Derive which other super-nodes a company belongs to from its prospect data
function deriveOtherSuperNodes(company, superNodeMap) {
  const results = []

  // Check certifications
  if (company.key_certifications) {
    const certs = company.key_certifications.split(',').map(c => c.trim())
    for (const cert of certs) {
      const match = superNodeMap.get(cert.toLowerCase())
      if (match) results.push(match)
    }
  }

  // Check RJG
  if (company.rjg_cavity_pressure) {
    const rjgLower = company.rjg_cavity_pressure.toLowerCase()
    if (rjgLower.includes('yes') || rjgLower.includes('confirmed')) {
      const match = superNodeMap.get('rjg cavity pressure monitoring')
      if (match) results.push(match)
    }
  }

  // Check medical device
  if (company.medical_device_mfg === 'Yes') {
    const match = superNodeMap.get('medical devices')
    if (match) results.push(match)
  }

  // Check ownership
  if (company.ownership_type) {
    const match = superNodeMap.get(company.ownership_type.toLowerCase())
    if (match) results.push(match)
  }

  return results
}
