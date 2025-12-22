import { useState, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

const STAGE_CONFIG = {
  lead: { label: 'Lead', color: '#8B5CF6' },
  qualified: { label: 'Qualified', color: '#3B82F6' },
  proposal: { label: 'Proposal', color: '#F59E0B' },
  negotiation: { label: 'Negotiation', color: '#EAB308' },
  active: { label: 'Active', color: '#22C55E' },
}

const STAGE_ORDER = ['lead', 'qualified', 'proposal', 'negotiation', 'active']

function PipelineValueChart() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/analytics/pipeline-value')
        const result = await res.json()
        setData(result)
      } catch (error) {
        console.error('Error fetching pipeline value:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const formatCurrency = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value}`
  }

  const chartData = {
    labels: STAGE_ORDER.map((s) => STAGE_CONFIG[s].label),
    datasets: [
      {
        label: 'Pipeline Value',
        data: STAGE_ORDER.map((stage) => {
          const row = data?.find((r) => r.stage === stage)
          return row ? parseFloat(row.total_value) || 0 : 0
        }),
        backgroundColor: STAGE_ORDER.map((s) => STAGE_CONFIG[s].color),
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => formatCurrency(context.raw),
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => formatCurrency(value),
        },
        grid: {
          color: '#f3f4f6',
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 h-80">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </div>
    )
  }

  const totalValue = data?.reduce((sum, row) => sum + (parseFloat(row.total_value) || 0), 0) || 0

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Pipeline Value by Stage</h3>
        <span className="text-sm text-gray-500">Total: {formatCurrency(totalValue)}</span>
      </div>
      <div className="h-64">
        <Bar data={chartData} options={options} />
      </div>
    </div>
  )
}

export default PipelineValueChart
