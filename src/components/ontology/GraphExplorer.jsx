import { useState, useCallback, useRef, useEffect } from 'react'
import { ArrowLeft, Search, X, AlertTriangle } from 'lucide-react'
import ForceGraph, { ENTITY_COLORS } from './ForceGraph'

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Certification', label: 'Certs' },
  { key: 'Technology / Software', label: 'Tech' },
  { key: 'Market Vertical', label: 'Markets' },
  { key: 'Ownership Structure', label: 'Ownership' },
  { key: 'Equipment Brand', label: 'Equipment' },
  { key: 'Quality Method', label: 'Quality' },
]

const SPARSE_THRESHOLD = 5

export default function GraphExplorer({ graphData, highlightNodeIds, loading, initialCompanyId, onLargeNodeClick, stateFilter }) {
  const [expandedEntity, setExpandedEntity] = useState(null)
  const [neighborhoodData, setNeighborhoodData] = useState(null)
  const [neighborLoading, setNeighborLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [showSparseNodes, setShowSparseNodes] = useState(false)
  const containerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 900, height: 600 })
  const [thresholdMessage, setThresholdMessage] = useState(null)
  const initialExpandDone = useRef(false)

  const apiBase = import.meta.env.VITE_API_URL || ''

  // Auto-expand company neighborhood when navigated from ProspectDetail
  useEffect(() => {
    if (!initialCompanyId || initialExpandDone.current) return
    initialExpandDone.current = true

    async function expandCompany() {
      setNeighborLoading(true)
      try {
        const params = new URLSearchParams({
          action: 'ontology-neighborhood',
          entity_id: initialCompanyId,
        })
        if (stateFilter) params.set('state', stateFilter)
        const res = await fetch(`${apiBase}/api/prospects?${params}`)
        if (!res.ok) return
        const data = await res.json()
        const rootNode = data.nodes?.find(n => n.id === initialCompanyId)
        if (rootNode) {
          setNeighborhoodData(data)
          setExpandedEntity({ ...rootNode, entityId: initialCompanyId })
        }
      } catch (err) {
        console.error('Failed to expand company:', err)
      } finally {
        setNeighborLoading(false)
      }
    }

    expandCompany()
  }, [initialCompanyId, apiBase])

  // Measure container size
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({
          width: Math.max(400, Math.floor(width)),
          height: Math.max(400, Math.floor(height)),
        })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const handleNodeClick = useCallback(async (node) => {
    if (!node.isSuper) return

    // Large super-nodes: show feedback and route to query panel (skip gate when state filter narrows results)
    if ((node.count || 0) > 25 && !stateFilter) {
      setThresholdMessage(`${node.label} has ${node.count} companies — use Query Panel to explore`)
      setTimeout(() => setThresholdMessage(null), 4000)
      if (onLargeNodeClick) {
        onLargeNodeClick(node.type, node.label)
      }
      return
    }

    setNeighborLoading(true)
    try {
      const params = new URLSearchParams({
        action: 'ontology-neighborhood',
        entity_id: node.entityId || node.id,
      })
      if (stateFilter) params.set('state', stateFilter)
      const res = await fetch(`${apiBase}/api/prospects?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setNeighborhoodData(data)
      setExpandedEntity(node)
    } catch (err) {
      console.error('Failed to expand node:', err)
    } finally {
      setNeighborLoading(false)
    }
  }, [apiBase, onLargeNodeClick, stateFilter])

  const handleBackToOverview = useCallback(() => {
    setExpandedEntity(null)
    setNeighborhoodData(null)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    // Don't collapse on background click — use the explicit back button
  }, [])

  // Compute visible nodes/links
  let displayNodes, displayLinks
  if (neighborhoodData && expandedEntity) {
    displayNodes = neighborhoodData.nodes || []
    displayLinks = neighborhoodData.links || []
  } else {
    displayNodes = graphData?.nodes || []
    displayLinks = graphData?.links || []
  }

  // Apply type filter
  if (typeFilter !== 'all' && !expandedEntity) {
    const visibleIds = new Set()
    displayNodes = displayNodes.filter(n => {
      if (n.type === typeFilter) {
        visibleIds.add(n.id)
        return true
      }
      return false
    })
    displayLinks = displayLinks.filter(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target
      return visibleIds.has(srcId) && visibleIds.has(tgtId)
    })
  }

  // Sparse node filtering (overview only, not expanded neighborhoods)
  const totalBeforeFilter = displayNodes.length
  let hiddenCount = 0
  if (!expandedEntity && !showSparseNodes) {
    const filtered = displayNodes.filter(n => !n.isSuper || (n.count || 0) >= SPARSE_THRESHOLD)
    hiddenCount = displayNodes.length - filtered.length
    if (hiddenCount > 0) {
      const filteredIds = new Set(filtered.map(n => n.id))
      displayNodes = filtered
      displayLinks = displayLinks.filter(l => {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target
        return filteredIds.has(srcId) && filteredIds.has(tgtId)
      })
    }
  }

  // Apply search highlight
  let effectiveHighlight = highlightNodeIds
  if (searchText.trim()) {
    const lower = searchText.toLowerCase()
    const matchIds = new Set()
    displayNodes.forEach(n => {
      if (n.label && n.label.toLowerCase().includes(lower)) {
        matchIds.add(n.id)
      }
    })
    if (matchIds.size > 0) effectiveHighlight = matchIds
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-gray-200 flex flex-wrap items-center gap-2">
        {expandedEntity ? (
          <button
            onClick={handleBackToOverview}
            className="flex items-center gap-1 text-xs text-[#041E42] hover:underline font-medium"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to overview
          </button>
        ) : (
          <>
            {/* Type filter chips */}
            <div className="flex gap-1 flex-wrap">
              {TYPE_FILTERS.map(tf => (
                <button
                  key={tf.key}
                  onClick={() => setTypeFilter(tf.key)}
                  className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
                    typeFilter === tf.key
                      ? 'bg-[#041E42] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tf.key !== 'all' && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                      style={{ backgroundColor: ENTITY_COLORS[tf.key] }}
                    />
                  )}
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Sparse node toggle */}
            {hiddenCount > 0 && (
              <button
                onClick={() => setShowSparseNodes(s => !s)}
                className="px-2 py-0.5 text-[11px] rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Show all ({hiddenCount} hidden)
              </button>
            )}
            {showSparseNodes && !expandedEntity && (
              <button
                onClick={() => setShowSparseNodes(false)}
                className="px-2 py-0.5 text-[11px] rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
              >
                Hide sparse
              </button>
            )}
          </>
        )}

        {/* Search */}
        <div className="flex items-center gap-1 ml-auto bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
          <Search className="w-3 h-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="text-xs bg-transparent border-none outline-none w-28 placeholder-gray-400"
          />
          {searchText && (
            <button onClick={() => setSearchText('')} className="text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded entity info */}
      {expandedEntity && (
        <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
          Showing neighborhood of <span className="font-semibold text-gray-800">{expandedEntity.label}</span>
          {' '}({expandedEntity.type})
          {neighborhoodData && (
            <span className="text-gray-400 ml-1">
              · {neighborhoodData.nodes?.length || 0} nodes
            </span>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {(neighborLoading || loading) && (
        <div className="px-3 py-1 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-blue-600">Loading...</span>
        </div>
      )}

      {/* Threshold gate message */}
      {thresholdMessage && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>{thresholdMessage}</span>
        </div>
      )}

      {/* Graph container */}
      <div ref={containerRef} className="flex-1 min-h-[400px] md:min-h-[500px]">
        {displayNodes.length > 0 ? (
          <ForceGraph
            nodes={displayNodes}
            links={displayLinks}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            highlightNodeIds={effectiveHighlight}
            width={dimensions.width}
            height={dimensions.height}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">
            No nodes to display
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 py-1.5 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-3">
        {Object.entries(ENTITY_COLORS).slice(0, 7).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {type}
          </div>
        ))}
      </div>
    </div>
  )
}
