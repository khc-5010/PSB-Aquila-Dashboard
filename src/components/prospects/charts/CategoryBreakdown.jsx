import { useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const CATEGORY_COLORS = {
  'Converter+Tooling': '#041E42',
  'Converter + In-House Tooling': '#0a2a52',
  'Captive Converter': '#122d4f',
  'Converter': '#1e3a5f',
  'Mold Maker': '#2563eb',
  'Hot Runner Systems': '#7c3aed',
  'Knowledge Sector': '#0d9488',
  'Catalog/Standards': '#f59e0b',
  'Strategic Partner': '#ec4899',
  'Thermoformer': '#d97706',
  'Other': '#9CA3AF',
}

const TOP_N = 8

const CATEGORY_PARENT_RULES = [
  { prefix: 'Converter+Tooling', parent: 'Converter+Tooling' },
  { prefix: 'Converter + In-House Tooling', parent: 'Converter + In-House Tooling' },
  { prefix: 'Captive Converter', parent: 'Captive Converter' },
  { prefix: 'Converter', parent: 'Converter' },
  { prefix: 'Mold Maker', parent: 'Mold Maker' },
  { prefix: 'Hot Runner Systems', parent: 'Hot Runner Systems' },
  { prefix: 'Knowledge Sector', parent: 'Knowledge Sector' },
  { prefix: 'Catalog/Standards', parent: 'Catalog/Standards' },
  { prefix: 'Strategic Partner', parent: 'Strategic Partner' },
  { prefix: 'Thermoformer', parent: 'Thermoformer' },
]

function getParentCategory(category) {
  for (const rule of CATEGORY_PARENT_RULES) {
    if (category === rule.prefix || category.startsWith(rule.prefix)) {
      return rule.parent
    }
  }
  return 'Other'
}

function groupByParent(rawData) {
  const map = {}
  for (const row of rawData) {
    const parent = getParentCategory(row.category)
    if (!map[parent]) {
      map[parent] = { parent, count: 0, children: [] }
    }
    map[parent].count += row.count
    map[parent].children.push({ category: row.category, count: row.count })
  }
  return Object.values(map).sort((a, b) => b.count - a.count)
}

function CategoryBreakdown({ categories, loading, onCategoryClick }) {
  const [expanded, setExpanded] = useState(false)

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-48 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  const rawData = (categories || []).filter(c => c.category)

  if (rawData.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <p className="text-sm">No data available</p>
        </div>
      </div>
    )
  }

  const grouped = groupByParent(rawData)

  // Build display data: top N groups, with overflow rolled into "Other"
  let displayData
  if (!expanded && grouped.length > TOP_N) {
    const top = grouped.slice(0, TOP_N)
    const rest = grouped.slice(TOP_N)
    const otherCount = rest.reduce((s, g) => s + g.count, 0)
    const otherChildren = rest.flatMap(g => g.children)
    displayData = [
      ...top,
      { parent: `Other (${rest.length} types)`, count: otherCount, children: otherChildren, isOverflow: true },
    ]
  } else {
    displayData = grouped
  }

  const chartData = {
    labels: displayData.map(g => g.parent),
    datasets: [
      {
        label: 'Companies',
        data: displayData.map(g => g.count),
        backgroundColor: displayData.map(g => {
          if (g.isOverflow) return CATEGORY_COLORS['Other']
          return CATEGORY_COLORS[g.parent] || '#9CA3AF'
        }),
        borderRadius: 4,
        barThickness: 28,
      },
    ],
  }

  const handleClick = (_, elements) => {
    if (elements.length > 0 && onCategoryClick) {
      const idx = elements[0].index
      const group = displayData[idx]
      // Filter to the largest child category within the parent
      const largestChild = group.children.reduce((a, b) => (b.count > a.count ? b : a), group.children[0])
      onCategoryClick(largestChild.category)
    }
  }

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleClick,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.raw} companies`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { stepSize: 10 },
      },
      y: {
        grid: { display: false },
        ticks: {
          font: { size: 12 },
          color: '#374151',
        },
      },
    },
  }

  const showToggle = grouped.length > TOP_N

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
      <div style={{ height: Math.max(200, displayData.length * 42) }}>
        <Bar data={chartData} options={options} />
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {displayData.filter(g => g.children.length > 1).map(g => (
            <div key={g.parent}>
              <div className="text-xs font-medium text-gray-700">{g.parent}</div>
              {g.children
                .sort((a, b) => b.count - a.count)
                .map(child => (
                  <div key={child.category} className="text-xs text-gray-500 pl-5">
                    · {child.category} — {child.count}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {showToggle && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer mt-2 flex items-center gap-1"
        >
          {expanded ? 'Show less \u25B4' : 'Show all \u25BE'}
        </button>
      )}
    </div>
  )
}

export default CategoryBreakdown
