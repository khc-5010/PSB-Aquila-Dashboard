import { useState, useEffect } from 'react'
import ForceGraph, { ENTITY_COLORS } from './ForceGraph'

export default function ForceGraphTestPage() {
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [highlightIds, setHighlightIds] = useState(null)

  useEffect(() => {
    async function fetchGraph() {
      try {
        const apiBase = import.meta.env.VITE_API_URL || ''
        const res = await fetch(`${apiBase}/api/prospects?action=ontology-graph`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setGraphData(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchGraph()
  }, [])

  function handleNodeClick(node) {
    setSelectedNode(node)
    // Highlight this node and its direct link neighbors
    if (graphData) {
      const ids = new Set([node.id])
      graphData.links.forEach(l => {
        const src = typeof l.source === 'object' ? l.source.id : l.source
        const tgt = typeof l.target === 'object' ? l.target.id : l.target
        if (src === node.id) ids.add(tgt)
        if (tgt === node.id) ids.add(src)
      })
      setHighlightIds(ids)
    }
    console.log('Node clicked:', node)
  }

  function handleBackgroundClick() {
    setSelectedNode(null)
    setHighlightIds(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        Loading ontology graph…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-red-400">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">Knowledge Graph — Test Page</h1>
        <p className="text-gray-400 text-sm mb-4">
          {graphData?.nodes?.length || 0} super-nodes · {graphData?.links?.length || 0} links
          · {graphData?.meta?.totalEntities || 0} entities · {graphData?.meta?.totalRelationships || 0} relationships
        </p>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4">
          {Object.entries(ENTITY_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-gray-400">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: color }}
              />
              {type}
            </div>
          ))}
        </div>

        <ForceGraph
          nodes={graphData?.nodes || []}
          links={graphData?.links || []}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          highlightNodeIds={highlightIds}
          width={1100}
          height={650}
        />

        {selectedNode && (
          <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700 text-sm">
            <h3 className="text-white font-semibold mb-1">{selectedNode.label}</h3>
            <p className="text-gray-400">
              Type: <span className="text-gray-200">{selectedNode.type}</span>
              {selectedNode.count != null && (
                <> · Companies: <span className="text-gray-200">{selectedNode.count}</span></>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
