import { useState, useEffect, useCallback } from 'react'
import InfoTooltip from '../national-map/InfoTooltip'
import QueryPanel from './QueryPanel'
import GraphExplorer from './GraphExplorer'
import { ENTITY_COLORS } from './ForceGraph'

const VIEW_MODES = [
  { key: 'split', label: 'Query + Graph' },
  { key: 'graph', label: 'Full Graph' },
  { key: 'query', label: 'Query Only' },
]

export default function KnowledgeGraph() {
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('split')
  const [highlightNodeIds, setHighlightNodeIds] = useState(null)
  const [stateFilter, setStateFilter] = useState(null)

  const apiBase = import.meta.env.VITE_API_URL || ''

  const fetchGraph = useCallback(async (state) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ action: 'ontology-graph' })
      if (state) params.set('state', state)
      const res = await fetch(`${apiBase}/api/prospects?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setGraphData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchGraph(stateFilter)
  }, [fetchGraph, stateFilter])

  const handleStateFilter = useCallback((state) => {
    setStateFilter(state)
    setHighlightNodeIds(null)
  }, [])

  const handleQueryResults = useCallback((companyIds) => {
    if (!companyIds || companyIds.length === 0) {
      setHighlightNodeIds(null)
      return
    }
    setHighlightNodeIds(new Set(companyIds.map(id => `company-${id}`)))
  }, [])

  // Extract filter options from graph super-nodes
  const filterOptions = graphData ? extractFilterOptions(graphData.nodes) : {}

  // Grid style based on view mode — CSS only, no unmounting
  const gridStyle = viewMode === 'split'
    ? 'grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)]'
    : viewMode === 'graph'
    ? 'grid-cols-1'
    : 'grid-cols-1'

  return (
    <div className="p-4 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-1">
            Knowledge Graph
            <InfoTooltip text="Explore the ontology of companies, certifications, technologies, and markets. Click super-nodes to expand, use the query panel to find companies by criteria." />
          </h2>
          {graphData && (
            <p className="text-xs text-gray-500 mt-0.5">
              {graphData.nodes?.length || 0} nodes · {graphData.links?.length || 0} links
              · {graphData.meta?.totalEntities || 0} entities · {graphData.meta?.totalRelationships || 0} relationships
              {stateFilter && <span className="ml-1 text-[#041E42] font-medium">· Filtered: {stateFilter}</span>}
            </p>
          )}
        </div>

        {/* View toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {VIEW_MODES.map(mode => (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === mode.key
                  ? 'bg-white text-[#041E42] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">Failed to load ontology graph: {error}</p>
          <button
            onClick={() => fetchGraph(stateFilter)}
            className="mt-1 text-xs text-red-600 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !graphData && (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-[#041E42] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading knowledge graph…</p>
          </div>
        </div>
      )}

      {/* Main content */}
      {graphData && (
        <div className={`grid gap-4 ${gridStyle}`}>
          {/* Query Panel */}
          <div className={viewMode === 'graph' ? 'hidden' : ''}>
            <QueryPanel
              filterOptions={filterOptions}
              stateFilter={stateFilter}
              onStateFilter={handleStateFilter}
              onQueryResults={handleQueryResults}
              graphData={graphData}
            />
          </div>

          {/* Graph Explorer */}
          <div className={viewMode === 'query' ? 'hidden' : ''}>
            <GraphExplorer
              graphData={graphData}
              highlightNodeIds={highlightNodeIds}
              loading={loading}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function extractFilterOptions(nodes) {
  const options = {
    certifications: [],
    technologies: [],
    markets: [],
    equipment: [],
    ownership: [],
    qualityMethods: [],
  }

  if (!nodes) return options

  const typeMap = {
    'Certification': 'certifications',
    'Technology / Software': 'technologies',
    'Market Vertical': 'markets',
    'Equipment Brand': 'equipment',
    'Ownership Structure': 'ownership',
    'Quality Method': 'qualityMethods',
  }

  for (const node of nodes) {
    if (!node.isSuper) continue
    const bucket = typeMap[node.type]
    if (bucket) {
      options[bucket].push({
        id: node.entityId || node.id,
        label: node.label,
        count: node.count || 0,
        type: node.type,
      })
    }
  }

  // Sort each bucket by count descending
  for (const key of Object.keys(options)) {
    options[key].sort((a, b) => b.count - a.count)
  }

  return options
}
