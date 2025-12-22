import { useState, useEffect } from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

const TYPE_COLORS = {
  'TBD': '#9CA3AF',
  'Research Agreement': '#8B5CF6',
  'Senior Design': '#3B82F6',
  'Consulting Engagement': '#0D9488',
  'Workforce Training': '#F59E0B',
  'Alliance Membership': '#EC4899',
  'Does Not Fit': '#EF4444',
}

function ProjectTypeMix() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/analytics/project-types')
        const result = await res.json()
        setData(result)
      } catch (error) {
        console.error('Error fetching project types:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const total = data?.reduce((sum, row) => sum + parseInt(row.count), 0) || 0

  const chartData = {
    labels: data?.map((r) => r.project_type) || [],
    datasets: [
      {
        data: data?.map((r) => parseInt(r.count)) || [],
        backgroundColor: data?.map((r) => TYPE_COLORS[r.project_type] || '#9CA3AF') || [],
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.raw
            const percentage = Math.round((value / total) * 100)
            return `${context.label}: ${value} (${percentage}%)`
          },
        },
      },
    },
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-48 bg-gray-100 rounded-full mx-auto w-48"></div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Type Mix</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <p className="text-sm">No data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Type Mix</h3>
      <div className="flex gap-6">
        <div className="relative w-48 h-48">
          <Doughnut data={chartData} options={options} />
          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className="text-2xl font-bold text-gray-900">{total}</span>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="space-y-2">
            {data?.map((row) => {
              const percentage = Math.round((parseInt(row.count) / total) * 100)
              return (
                <div key={row.project_type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: TYPE_COLORS[row.project_type] || '#9CA3AF' }}
                    />
                    <span className="text-sm text-gray-600 truncate max-w-[120px]" title={row.project_type}>
                      {row.project_type}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{percentage}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectTypeMix
