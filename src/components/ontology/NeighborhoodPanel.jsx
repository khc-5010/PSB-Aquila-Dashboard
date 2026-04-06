import { useState, useEffect, useRef, useCallback } from 'react'
import { ExternalLink } from 'lucide-react'
import ForceGraph, { ENTITY_COLORS } from './ForceGraph'
import InfoTooltip from '../national-map/InfoTooltip'

const MAX_VISIBLE_NODES = 15

export default function NeighborhoodPanel({ prospect }) {
  const [graphData, setGraphData] = useState(null)
  const [entityId, setEntityId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [overflow, setOverflow] = useState(0)
  const containerRef = useRef(null)
  const [width, setWidth] = useState(400)

  const apiBase = import.meta.env.VITE_API_URL || ''
  const prospectId = prospect?.id

  // Resolve prospect → entity_id → neighborhood in one effect
  // Strategy: use ontology-similar to check existence, then find entity_id
  // by fetching a connected super-node's neighborhood and locating our company
  useEffect(() => {
    if (!prospectId) return
    let cancelled = false

    async function loadNeighborhood() {
      setLoading(true)
      setError(null)
      setGraphData(null)
      setEntityId(null)
      setOverflow(0)

      try {
        // Step 1: Check if company has ontology data via similar endpoint
        const similarRes = await fetch(
          `${apiBase}/api/prospects?action=ontology-similar&prospect_id=${prospectId}&limit=1`
        )
        if (!similarRes.ok) {
          if (similarRes.status === 404) {
            if (!cancelled) { setError('no-entity'); setLoading(false) }
            return
          }
          throw new Error(`HTTP ${similarRes.status}`)
        }

        // Step 2: Get the graph to find a super-node connected to our company
        const graphRes = await fetch(`${apiBase}/api/prospects?action=ontology-graph`)
        if (!graphRes.ok) throw new Error(`Graph HTTP ${graphRes.status}`)
        const graph = await graphRes.json()

        // Find super-nodes matching prospect's known data to locate entity_id
        const certNames = prospect.key_certifications
          ? prospect.key_certifications.split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
          : []

        // Try to find a super-node that likely connects to our company
        let probeNode = null
        for (const node of graph.nodes || []) {
          if (!node.isSuper) continue
          // Check certifications first
          if (node.type === 'Certification' && certNames.some(c => node.label.toLowerCase().includes(c))) {
            probeNode = node
            break
          }
        }
        // Fallback: try technology (RJG), market (medical), ownership
        if (!probeNode) {
          const isRjg = prospect.rjg_cavity_pressure?.toLowerCase().includes('yes') ||
            prospect.rjg_cavity_pressure?.toLowerCase().includes('confirmed')
          if (isRjg) {
            probeNode = (graph.nodes || []).find(n => n.isSuper && n.type === 'Technology / Software' && n.label.toLowerCase().includes('rjg'))
          }
        }
        if (!probeNode) {
          if (prospect.medical_device_mfg === 'Yes') {
            probeNode = (graph.nodes || []).find(n => n.isSuper && n.type === 'Market Vertical' && n.label.toLowerCase().includes('medical'))
          }
        }
        if (!probeNode && prospect.ownership_type) {
          const ownerLower = prospect.ownership_type.toLowerCase()
          probeNode = (graph.nodes || []).find(n => n.isSuper && n.type === 'Ownership Structure' && n.label.toLowerCase().includes(ownerLower))
        }
        // Last resort: any super-node
        if (!probeNode && graph.nodes?.length > 0) {
          probeNode = graph.nodes.find(n => n.isSuper)
        }

        if (!probeNode) {
          if (!cancelled) { setError('no-entity'); setLoading(false) }
          return
        }

        // Step 3: Fetch probe node's neighborhood to find our company's entity_id
        const probeRes = await fetch(
          `${apiBase}/api/prospects?action=ontology-neighborhood&entity_id=${probeNode.entityId}`
        )
        if (!probeRes.ok) throw new Error(`Probe HTTP ${probeRes.status}`)
        const probeData = await probeRes.json()

        const companyNode = (probeData.nodes || []).find(n => n.prospectId === prospectId)

        if (!companyNode) {
          // Company not found in this neighborhood — show empty state
          // This can happen if the company only connects to entities not in this super-node
          if (!cancelled) { setError('no-entity'); setLoading(false) }
          return
        }

        const companyEntityId = companyNode.id

        // Step 4: Fetch the actual company neighborhood
        const hoodRes = await fetch(
          `${apiBase}/api/prospects?action=ontology-neighborhood&entity_id=${companyEntityId}`
        )
        if (!hoodRes.ok) throw new Error(`Neighborhood HTTP ${hoodRes.status}`)
        const hoodData = await hoodRes.json()

        if (cancelled) return

        // Process and cap nodes
        let nodes = hoodData.nodes || []
        let links = hoodData.links || []
        let overflowCount = 0

        if (nodes.length > MAX_VISIBLE_NODES + 1) {
          const centerNode = nodes.find(n => n.id === companyEntityId)
          const otherNodes = nodes.filter(n => n !== centerNode)
          const visibleOthers = otherNodes.slice(0, MAX_VISIBLE_NODES)
          const visibleIds = new Set(visibleOthers.map(n => n.id))
          if (centerNode) visibleIds.add(centerNode.id)

          overflowCount = otherNodes.length - visibleOthers.length
          nodes = centerNode ? [centerNode, ...visibleOthers] : visibleOthers
          links = links.filter(l => {
            const srcId = typeof l.source === 'object' ? l.source.id : l.source
            const tgtId = typeof l.target === 'object' ? l.target.id : l.target
            return visibleIds.has(srcId) && visibleIds.has(tgtId)
          })
        }

        // Mark center node
        nodes = nodes.map(n => ({
          ...n,
          isCenter: n.id === companyEntityId,
        }))

        setEntityId(companyEntityId)
        setOverflow(overflowCount)
        setGraphData({ nodes, links })
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadNeighborhood()
    return () => { cancelled = true }
  }, [prospectId, apiBase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(Math.max(280, Math.floor(entry.contentRect.width)))
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const handleNodeClick = useCallback((node) => {
    if (node.isCenter) return
    setSelectedNode(node)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const navigateToKnowledgeGraph = useCallback(() => {
    window.location.hash = entityId
      ? `knowledge-graph?company=${entityId}`
      : `knowledge-graph`
  }, [entityId])

  // Section header used in all states
  const header = (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-[#041E42]">Connections</span>
        <InfoTooltip text="Visual map of this company's ontology connections — certifications, technologies, markets, and relationships extracted from data and research." />
      </div>
      {entityId && (
        <button
          onClick={navigateToKnowledgeGraph}
          className="flex items-center gap-1 text-[10px] text-[#2563EB] hover:underline font-medium"
        >
          View in Knowledge Graph
          <ExternalLink className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  )

  // Loading
  if (loading) {
    return (
      <div>
        {header}
        <div className="bg-slate-900 rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center" style={{ height: 200 }}>
          <div className="text-center">
            <div className="w-5 h-5 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-gray-400">Loading connections…</p>
          </div>
        </div>
      </div>
    )
  }

  // Empty / no-entity
  if (error === 'no-entity' || (!graphData && !error)) {
    return (
      <div>
        {header}
        <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-5 text-center">
          <p className="text-xs text-gray-500">No ontology connections found.</p>
          <p className="text-xs text-gray-400 mt-1">Run Layer 1 rebuild or add data via Extract Ontology.</p>
        </div>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div>
        {header}
        <div className="bg-red-50 rounded-lg border border-red-200 px-4 py-3 text-center">
          <p className="text-xs text-red-600">Failed to load connections: {error}</p>
        </div>
      </div>
    )
  }

  // No connections (entity exists but zero relationships)
  if (graphData && graphData.nodes.length <= 1) {
    return (
      <div>
        {header}
        <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-5 text-center">
          <p className="text-xs text-gray-500">No connections found for this company.</p>
          <p className="text-xs text-gray-400 mt-1">Connections are created via Layer 1 rebuild or ontology extraction.</p>
        </div>
      </div>
    )
  }

  // Relationship label for selected node
  const selectedRelLabel = selectedNode
    ? getRelationshipLabel(selectedNode, graphData.links, entityId)
    : null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-[#041E42]">Connections</span>
          <InfoTooltip text="Visual map of this company's ontology connections — certifications, technologies, markets, and relationships extracted from data and research." />
          <span className="text-[10px] text-gray-400 ml-1">{graphData.nodes.length} nodes</span>
        </div>
        <button
          onClick={navigateToKnowledgeGraph}
          className="flex items-center gap-1 text-[10px] text-[#2563EB] hover:underline font-medium"
        >
          View in Knowledge Graph
          <ExternalLink className="w-2.5 h-2.5" />
        </button>
      </div>

      <div ref={containerRef} className="rounded-lg overflow-hidden border border-gray-700">
        <ForceGraph
          nodes={graphData.nodes}
          links={graphData.links}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          width={width}
          height={280}
          compact
        />
      </div>

      {overflow > 0 && (
        <p className="text-[10px] text-gray-400 mt-1 text-center">+{overflow} more connections not shown</p>
      )}

      {selectedNode && (
        <div className="mt-2 px-3 py-1.5 bg-gray-50 rounded border border-gray-200 text-xs flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: ENTITY_COLORS[selectedNode.type] || '#6B7280' }}
          />
          <span className="text-gray-500">{selectedNode.type}:</span>
          <span className="text-gray-800 font-medium truncate">{selectedNode.label}</span>
          {selectedRelLabel && (
            <span className="text-gray-400 ml-auto text-[10px] italic flex-shrink-0">{selectedRelLabel}</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        {getUsedTypes(graphData.nodes).map(type => (
          <div key={type} className="flex items-center gap-1 text-[9px] text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ENTITY_COLORS[type] || '#6B7280' }} />
            {type}
          </div>
        ))}
      </div>
    </div>
  )
}

function getUsedTypes(nodes) {
  const types = new Set()
  for (const n of nodes) {
    if (n.type) types.add(n.type)
  }
  return Array.from(types).sort()
}

function getRelationshipLabel(node, links, centerEntityId) {
  for (const l of links) {
    const srcId = typeof l.source === 'object' ? l.source.id : l.source
    const tgtId = typeof l.target === 'object' ? l.target.id : l.target
    if ((srcId === centerEntityId && tgtId === node.id) || (tgtId === centerEntityId && srcId === node.id)) {
      return l.relType || null
    }
  }
  return null
}
