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

const RJG_ORDER = ['Confirmed', 'Likely', 'Unknown']

function ReadinessScorecard({ readiness, readinessGoldCompanies, loading }) {
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

  if (!readiness || Object.keys(readiness).length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Readiness Scorecard</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <p className="text-sm">No data available</p>
        </div>
      </div>
    )
  }

  const labels = RJG_ORDER.filter(k => readiness[k])
  const medicalData = labels.map(k => readiness[k]?.medical || 0)
  const nonMedicalData = labels.map(k => readiness[k]?.nonMedical || 0)

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Medical Device',
        data: medicalData,
        backgroundColor: '#041E42',
        borderRadius: 4,
      },
      {
        label: 'Non-Medical',
        data: nonMedicalData,
        backgroundColor: '#93c5fd',
        borderRadius: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, pointStyle: 'rectRounded', font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} companies`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
      },
      y: {
        stacked: true,
        grid: { color: '#f3f4f6' },
        beginAtZero: true,
      },
    },
  }

  const goldCompanies = readinessGoldCompanies || []

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Readiness Scorecard</h3>
      <p className="text-xs text-gray-500 mb-4">RJG Cavity Pressure status x Medical Device classification</p>
      <div style={{ height: 220 }}>
        <Bar data={chartData} options={options} />
      </div>
      {goldCompanies.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold text-amber-800">Gold Targets (RJG Confirmed + Medical)</span>
          </div>
          <p className="text-xs text-amber-700">
            {goldCompanies.join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

export default ReadinessScorecard
