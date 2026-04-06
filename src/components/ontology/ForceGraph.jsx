import { useRef, useEffect, useCallback } from 'react'
import * as d3 from 'd3'

// Shared color mapping by entity type
export const ENTITY_COLORS = {
  'Company': '#041E42',
  'Certification': '#1D9E75',
  'Technology / Software': '#D85A30',
  'Market Vertical': '#D4537E',
  'Ownership Structure': '#BA7517',
  'Equipment Brand': '#639922',
  'Quality Method': '#534AB7',
  'Manufacturing Process': '#2563EB',
  'Material': '#6B7280',
  'Workforce Capability': '#0891B2',
  'Data Type': '#64748B',
  'Readiness Signal': '#F59E0B',
}

function getNodeRadius(node, compact = false) {
  if (compact) {
    if (node.isCenter) return 14
    if (!node.isSuper) return 7
    return Math.max(10, Math.min(28, 7 + Math.sqrt(node.count || 1) * 2.2))
  }
  if (!node.isSuper) return 10
  return Math.max(16, Math.min(42, 10 + Math.sqrt(node.count || 1) * 3.2))
}

function getNodeColor(node) {
  return ENTITY_COLORS[node.type] || '#6B7280'
}

export default function ForceGraph({
  nodes = [],
  links = [],
  onNodeClick,
  onBackgroundClick,
  highlightNodeIds,
  width = 900,
  height = 600,
  compact = false,
  labelLimit = 0,
}) {
  const containerRef = useRef(null)
  const simulationRef = useRef(null)

  const handleNodeClick = useCallback((event, d) => {
    event.stopPropagation()
    if (onNodeClick) onNodeClick(d)
  }, [onNodeClick])

  const handleBackgroundClick = useCallback(() => {
    if (onBackgroundClick) onBackgroundClick()
  }, [onBackgroundClick])

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return

    // Clear previous
    const container = d3.select(containerRef.current)
    container.selectAll('*').remove()

    const svg = container
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', '#0F172A')
      .on('click', handleBackgroundClick)

    const g = svg.append('g')

    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent(compact ? [0.6, 2] : [0.3, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Create copies of data for D3 mutation
    const nodeData = nodes.map(n => ({ ...n }))
    const linkData = links.map(l => ({
      ...l,
      source: l.source,
      target: l.target,
    }))

    // Create simulation
    const simulation = d3.forceSimulation(nodeData)
      .force('link', d3.forceLink(linkData)
        .id(d => d.id)
        .distance(d => {
          const strength = d.strength || 0.5
          return compact ? 40 + (1 - strength) * 60 : 80 + (1 - strength) * 120
        })
        .strength(d => d.strength || 0.3)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => compact
          ? (d.isCenter ? -200 : d.isSuper ? -120 : -60)
          : (d.isSuper ? -300 : -100)
        )
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide()
        .radius(d => getNodeRadius(d, compact) + (compact ? 2 : 4))
      )

    simulationRef.current = simulation

    // Links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(linkData)
      .join('line')
      .attr('stroke', '#475569')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', d => {
        if (d.strength != null) return Math.max(1, d.strength * 4)
        return 1
      })

    // Node groups
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodeData)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', handleNodeClick)

    // Drag behavior
    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    node.call(drag)

    // Circle for each node
    node.append('circle')
      .attr('r', d => getNodeRadius(d, compact))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => compact && d.isCenter ? '#F59E0B' : '#1E293B')
      .attr('stroke-width', d => compact && d.isCenter ? 2 : 1.5)

    // Count text for super-nodes (skip in compact mode)
    if (!compact) {
      node.filter(d => d.isSuper && d.count != null)
        .append('text')
        .text(d => d.count)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', 'white')
        .attr('font-size', d => {
          const r = getNodeRadius(d)
          return Math.max(9, r * 0.55) + 'px'
        })
        .attr('font-weight', 600)
        .attr('pointer-events', 'none')
    }

    // Determine which nodes get visible labels
    // labelLimit > 0: only show labels on super-nodes + top N most-connected non-super nodes
    let labelVisibleIds = null
    if (labelLimit > 0) {
      labelVisibleIds = new Set()
      // Super-nodes and center nodes always get labels
      nodeData.forEach(n => { if (n.isSuper || n.isCenter) labelVisibleIds.add(n.id) })
      // Count links per non-super node and keep top N
      const linkCounts = new Map()
      linkData.forEach(l => {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target
        linkCounts.set(srcId, (linkCounts.get(srcId) || 0) + 1)
        linkCounts.set(tgtId, (linkCounts.get(tgtId) || 0) + 1)
      })
      const nonSuper = nodeData
        .filter(n => !n.isSuper && !n.isCenter)
        .sort((a, b) => (linkCounts.get(b.id) || 0) - (linkCounts.get(a.id) || 0))
      nonSuper.slice(0, labelLimit).forEach(n => labelVisibleIds.add(n.id))
    }

    // Label text below each node
    const labelMaxLen = compact ? 14 : 20
    node.append('text')
      .text(d => {
        if (labelVisibleIds && !labelVisibleIds.has(d.id)) return ''
        const label = d.label || ''
        return label.length > labelMaxLen ? label.slice(0, labelMaxLen - 2) + '…' : label
      })
      .attr('text-anchor', 'middle')
      .attr('dy', d => getNodeRadius(d, compact) + (compact ? 9 : 12))
      .attr('fill', '#94A3B8')
      .attr('font-size', compact ? '8px' : '10px')
      .attr('pointer-events', 'none')

    // Hover labels for unlabeled nodes
    if (labelVisibleIds) {
      node.on('mouseenter', function(event, d) {
        if (labelVisibleIds.has(d.id)) return
        d3.select(this).select('text')
          .text(() => {
            const label = d.label || ''
            return label.length > labelMaxLen ? label.slice(0, labelMaxLen - 2) + '…' : label
          })
      })
      node.on('mouseleave', function(event, d) {
        if (labelVisibleIds.has(d.id)) return
        d3.select(this).select('text').text('')
      })
    }

    // Tick handler
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Highlight support
    function applyHighlight() {
      if (highlightNodeIds && highlightNodeIds.size > 0) {
        const highlightedLinkSet = new Set()
        linkData.forEach(l => {
          const srcId = typeof l.source === 'object' ? l.source.id : l.source
          const tgtId = typeof l.target === 'object' ? l.target.id : l.target
          if (highlightNodeIds.has(srcId) || highlightNodeIds.has(tgtId)) {
            highlightedLinkSet.add(l)
          }
        })

        node.attr('opacity', d => highlightNodeIds.has(d.id) ? 1 : 0.1)
        link.attr('opacity', d => highlightedLinkSet.has(d) ? 0.6 : 0.05)
      } else {
        node.attr('opacity', 1)
        link.attr('opacity', 0.4)
      }
    }
    applyHighlight()

    // Cleanup
    return () => {
      simulation.stop()
      container.selectAll('*').remove()
    }
  }, [nodes, links, width, height, highlightNodeIds, handleNodeClick, handleBackgroundClick, compact, labelLimit])

  return (
    <div
      ref={containerRef}
      style={{ width, height }}
      className="rounded-lg overflow-hidden border border-gray-700"
    />
  )
}
