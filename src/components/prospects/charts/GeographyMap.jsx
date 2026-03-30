import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

const GEO_COLORS = {
  'Tier 1': '#041E42',
  'Tier 2': '#2563eb',
  'Tier 3': '#f59e0b',
  'Infrastructure': '#7c3aed',
}

function GeographyMap({ geography, loading, onGeoClick }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-48 bg-gray-100 rounded-full mx-auto w-48" />
        </div>
      </div>
    )
  }

  const data = (geography || []).filter(g => g.geography_tier)
  const total = data.reduce((s, r) => s + r.count, 0)

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Geography Distribution</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <p className="text-sm">No data available</p>
        </div>
      </div>
    )
  }

  const chartData = {
    labels: data.map(r => r.geography_tier),
    datasets: [
      {
        data: data.map(r => r.count),
        backgroundColor: data.map(r => GEO_COLORS[r.geography_tier] || '#9CA3AF'),
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    onClick: (_, elements) => {
      if (elements.length > 0 && onGeoClick) {
        const idx = elements[0].index
        onGeoClick(data[idx].geography_tier)
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const pct = Math.round((ctx.raw / total) * 100)
            return `${ctx.label}: ${ctx.raw} (${pct}%)`
          },
        },
      },
    },
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Geography Distribution</h3>
      <div className="flex gap-6">
        <div className="relative w-48 h-48 flex-shrink-0">
          <Doughnut data={chartData} options={options} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className="text-2xl font-bold text-gray-900">{total}</span>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <div className="space-y-3">
            {data.map(row => {
              const pct = Math.round((row.count / total) * 100)
              return (
                <button
                  key={row.geography_tier}
                  onClick={() => onGeoClick?.(row.geography_tier)}
                  className="flex items-center justify-between w-full text-left hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: GEO_COLORS[row.geography_tier] || '#9CA3AF' }}
                    />
                    <span className="text-sm text-gray-700">{row.geography_tier}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{row.count}</span>
                    <span className="text-xs text-gray-500">({pct}%)</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default GeographyMap
