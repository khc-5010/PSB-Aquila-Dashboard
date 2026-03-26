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
  'Converter': '#1e3a5f',
  'Mold Maker': '#2563eb',
  'Hot Runner Systems': '#7c3aed',
  'Knowledge Sector': '#0d9488',
  'Catalog/Standards': '#f59e0b',
  'Strategic Partner': '#ec4899',
}

function CategoryBreakdown({ categories, loading, onCategoryClick }) {
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

  const data = (categories || []).filter(c => c.category)

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <p className="text-sm">No data available</p>
        </div>
      </div>
    )
  }

  const chartData = {
    labels: data.map(r => r.category),
    datasets: [
      {
        label: 'Companies',
        data: data.map(r => r.count),
        backgroundColor: data.map(r => CATEGORY_COLORS[r.category] || '#9CA3AF'),
        borderRadius: 4,
        barThickness: 28,
      },
    ],
  }

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_, elements) => {
      if (elements.length > 0 && onCategoryClick) {
        const idx = elements[0].index
        onCategoryClick(data[idx].category)
      }
    },
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

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
      <div style={{ height: Math.max(200, data.length * 42) }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  )
}

export default CategoryBreakdown
