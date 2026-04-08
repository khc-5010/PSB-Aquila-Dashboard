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

// Value-chain horizontal zone targets (fraction of width)
// Left: design & tooling inputs, Center: companies, Right: outputs & compliance
const ZONE_X = {
  'Equipment Brand': 0.20,
  'Manufacturing Process': 0.18,
  'Material': 0.22,
  'Workforce Capability': 0.25,
  'Company': 0.50,
  'Technology / Software': 0.62,
  'Ownership Structure': 0.58,
  'Certification': 0.80,
  'Market Vertical': 0.82,
  'Quality Method': 0.78,
  'Data Type': 0.65,
  'Readiness Signal': 0.70,
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
      .style('background', 'transparent')
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

    // Create simulation with mode-specific parameters
    const simulation = d3.forceSimulation(nodeData)
      .force('link', d3.forceLink(linkData)
        .id(d => d.id)
        .distance(d => {
          const strength = d.strength || 0.5
          if (compact) return 40 + (1 - strength) * 60
          return 60 + (1 - strength) * 80
        })
        .strength(d => d.strength || 0.3)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => {
          if (compact) return d.isCenter ? -200 : d.isSuper ? -120 : -60
          return d.isSuper ? -200 : -60
        })
      )
      .force('collision', d3.forceCollide()
        .radius(d => getNodeRadius(d, compact) + (compact ? 2 : 4))
      )

    // Zone layout for non-compact mode; center force for compact
    if (!compact) {
      simulation
        .force('center', null)
        .force('x', d3.forceX(d => {
          const zone = ZONE_X[d.type] || 0.5
          return width * zone
        }).strength(0.10))
        .force('y', d3.forceY(d => {
          const count = d.count || 0
          const zone = count > 20 ? 0.35 : count > 5 ? 0.45 : 0.55
          return height * zone
        }).strength(0.04))
    } else {
      simulation.force('center', d3.forceCenter(width / 2, height / 2))
    }

    simulationRef.current = simulation

    // Links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(linkData)
      .join('line')
      .attr('stroke', '#CBD5E1')
      .attr('stroke-opacity', 0.3)
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

    // Hover-to-highlight (before click handler)
    node
      .on('mouseover', (event, d) => {
        // Skip if query highlights are active
        if (highlightNodeIds && highlightNodeIds.size > 0) return

        // Find directly connected node IDs
        const connectedIds = new Set([d.id])
        linkData.forEach(l => {
          const srcId = typeof l.source === 'object' ? l.source.id : l.source
          const tgtId = typeof l.target === 'object' ? l.target.id : l.target
          if (srcId === d.id) connectedIds.add(tgtId)
          if (tgtId === d.id) connectedIds.add(srcId)
        })

        node.attr('opacity', n => connectedIds.has(n.id) ? 1 : 0.12)
        link.attr('opacity', l => {
          const srcId = typeof l.source === 'object' ? l.source.id : l.source
          const tgtId = typeof l.target === 'object' ? l.target.id : l.target
          return (srcId === d.id || tgtId === d.id) ? 0.6 : 0.03
        })
      })
      .on('mouseout', () => {
        if (highlightNodeIds && highlightNodeIds.size > 0) return
        node.attr('opacity', 1)
        link.attr('opacity', 0.3)
      })
      .on('click', handleNodeClick)

    // Circle for each node
    node.append('circle')
      .attr('r', d => getNodeRadius(d, compact))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => compact && d.isCenter ? '#F59E0B' : '#D1D5DB')
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

    // Label text below each node
    const labelMaxLen = compact ? 14 : 20
    node.append('text')
      .text(d => {
        const label = d.label || ''
        return label.length > labelMaxLen ? label.slice(0, labelMaxLen - 2) + '...' : label
      })
      .attr('text-anchor', 'middle')
      .attr('dy', d => getNodeRadius(d, compact) + (compact ? 9 : 12))
      .attr('fill', '#6B7280')
      .attr('font-size', compact ? '8px' : '10px')
      .attr('pointer-events', 'none')

    // Tick handler
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Fit-to-view after simulation settles
    simulation.on('end', () => {
      const xs = nodeData.map(d => d.x)
      const ys = nodeData.map(d => d.y)
      if (xs.length === 0) return
      const padding = 40
      const x0 = Math.min(...xs) - padding
      const y0 = Math.min(...ys) - padding
      const x1 = Math.max(...xs) + padding
      const y1 = Math.max(...ys) + padding
      const bw = x1 - x0
      const bh = y1 - y0
      if (bw <= 0 || bh <= 0) return
      const scale = Math.min(width / bw, height / bh, 1.5)
      const tx = (width - bw * scale) / 2 - x0 * scale
      const ty = (height - bh * scale) / 2 - y0 * scale
      svg.transition().duration(500).call(
        zoom.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      )
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
        link.attr('opacity', 0.3)
      }
    }
    applyHighlight()

    // Cleanup
    return () => {
      simulation.stop()
      container.selectAll('*').remove()
    }
  }, [nodes, links, width, height, highlightNodeIds, handleNodeClick, handleBackgroundClick, compact])

  return (
    <div
      ref={containerRef}
      style={{ width, height }}
      className="rounded-lg overflow-hidden border border-gray-200"
    />
  )
}
