import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

const OWNERSHIP_COLORS = [
  '#041E42', '#1e3a5f', '#2563eb', '#7c3aed',
  '#0d9488', '#f59e0b', '#ec4899', '#9ca3af',
]

function OwnershipProfile({ ownership, recentMA, loading }) {
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

  const data = (ownership || []).filter(o => o.ownership_type)
  const total = data.reduce((s, r) => s + r.count, 0)
  const maList = recentMA || []

  if (data.length === 0 && maList.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Ownership & Investment</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <p className="text-sm">No data available</p>
        </div>
      </div>
    )
  }

  const chartData = {
    labels: data.map(r => r.ownership_type),
    datasets: [
      {
        data: data.map(r => r.count),
        backgroundColor: data.map((_, i) => OWNERSHIP_COLORS[i % OWNERSHIP_COLORS.length]),
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0
            return `${ctx.label}: ${ctx.raw} (${pct}%)`
          },
        },
      },
    },
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Ownership & Investment</h3>
      <div className="flex gap-6">
        {data.length > 0 && (
          <>
            <div className="relative w-40 h-40 flex-shrink-0">
              <Doughnut data={chartData} options={options} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-xl font-bold text-gray-900">{total}</span>
                  <p className="text-[10px] text-gray-500">Known</p>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <div className="space-y-1.5">
                {data.map((row, i) => (
                  <div key={row.ownership_type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: OWNERSHIP_COLORS[i % OWNERSHIP_COLORS.length] }}
                      />
                      <span className="text-xs text-gray-600">{row.ownership_type}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-900">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {maList.length > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1.5">
            <svg className="w-3.5 h-3.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-xs font-semibold text-red-800">Recent M&A Activity</span>
          </div>
          <div className="space-y-1">
            {maList.map(company => (
              <div key={company.id} className="text-xs text-red-700">
                <span className="font-medium">{company.company}</span>
                <span className="text-red-500 ml-1">— {company.recent_ma}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default OwnershipProfile
