import { useState, useEffect } from 'react'

const STAGE_CONFIG = {
  lead: { label: 'Lead', color: '#8B5CF6' },
  qualified: { label: 'Qualified', color: '#3B82F6' },
  proposal: { label: 'Proposal', color: '#F59E0B' },
  negotiation: { label: 'Negotiation', color: '#EAB308' },
  active: { label: 'Active', color: '#22C55E' },
  complete: { label: 'Complete', color: '#10B981' },
}

const STAGE_ORDER = ['lead', 'qualified', 'proposal', 'negotiation', 'active', 'complete']

function ConversionFunnel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/analytics/funnel')
        const result = await res.json()
        setData(result)
      } catch (error) {
        console.error('Error fetching funnel data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Build funnel data
  const funnelData = STAGE_ORDER.map((stage) => {
    const row = data?.find((r) => r.to_stage === stage)
    return {
      stage,
      ...STAGE_CONFIG[stage],
      count: row ? parseInt(row.count) : 0,
    }
  })

  const maxCount = Math.max(...funnelData.map((f) => f.count), 1)

  // Calculate conversion rates
  const withConversion = funnelData.map((item, index) => {
    if (index === 0) return { ...item, conversion: 100 }
    const prevCount = funnelData[index - 1].count
    const conversion = prevCount > 0 ? Math.round((item.count / prevCount) * 100) : 0
    return { ...item, conversion }
  })

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" style={{ width: `${100 - i * 15}%` }}></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
        <div className="flex items-center justify-center h-48 text-gray-400">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">No stage transitions yet</p>
            <p className="text-xs text-gray-300">Move opportunities through stages to see funnel data</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
      <div className="space-y-2">
        {withConversion.map((item, index) => {
          const widthPercent = (item.count / maxCount) * 100
          return (
            <div key={item.stage} className="flex items-center gap-3">
              <div className="w-20 text-right">
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
              </div>
              <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                <div
                  className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                  style={{
                    width: `${Math.max(widthPercent, 5)}%`,
                    backgroundColor: item.color,
                  }}
                >
                  <span className="text-xs font-medium text-white">{item.count}</span>
                </div>
              </div>
              <div className="w-12 text-right">
                {index > 0 && (
                  <span className={`text-xs font-medium ${item.conversion >= 50 ? 'text-green-600' : item.conversion >= 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {item.conversion}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ConversionFunnel
