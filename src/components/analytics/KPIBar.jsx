import { useState, useEffect } from 'react'

const STAGE_COLORS = {
  lead: '#8B5CF6',
  qualified: '#3B82F6',
  proposal: '#F59E0B',
  negotiation: '#EAB308',
  active: '#22C55E',
}

function KPIBar() {
  const [pipelineValue, setPipelineValue] = useState(null)
  const [cycleTime, setCycleTime] = useState(null)
  const [winRates, setWinRates] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pipelineRes, cycleRes, winRes] = await Promise.all([
          fetch('/api/analytics/pipeline-value'),
          fetch('/api/analytics/cycle-time'),
          fetch('/api/analytics/win-rates'),
        ])

        const [pipelineData, cycleData, winData] = await Promise.all([
          pipelineRes.json(),
          cycleRes.json(),
          winRes.json(),
        ])

        setPipelineValue(pipelineData)
        setCycleTime(cycleData)
        setWinRates(winData)
      } catch (error) {
        console.error('Error fetching KPI data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Calculate totals
  const totalPipelineValue = pipelineValue?.reduce((sum, row) => sum + (parseFloat(row.total_value) || 0), 0) || 0
  const activeOpps = pipelineValue?.reduce((sum, row) => sum + parseInt(row.count || 0), 0) || 0
  const avgCycleTime = cycleTime?.[0]?.avg_cycle_time || 0
  const overallWinRate = winRates?.length > 0
    ? Math.round(winRates.reduce((sum, r) => sum + parseInt(r.won || 0), 0) / winRates.reduce((sum, r) => sum + parseInt(r.total || 0), 0) * 100)
    : 0

  const formatCurrency = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }

  const kpis = [
    {
      label: 'Pipeline Value',
      value: formatCurrency(totalPipelineValue),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'text-teal-600',
      bgColor: 'bg-teal-50',
    },
    {
      label: 'Active Opportunities',
      value: activeOpps.toString(),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Avg Cycle Time',
      value: avgCycleTime > 0 ? `${avgCycleTime} days` : 'N/A',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Win Rate',
      value: winRates?.length > 0 ? `${overallWinRate}%` : 'N/A',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
  ]

  if (loading) {
    return (
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-20"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${kpi.bgColor} ${kpi.color}`}>
                {kpi.icon}
              </div>
              <div>
                <p className="text-sm text-gray-500">{kpi.label}</p>
                <p className={`text-xl font-semibold ${kpi.color}`}>{kpi.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default KPIBar
