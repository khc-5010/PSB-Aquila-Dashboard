import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bubble } from 'react-chartjs-2'

ChartJS.register(LinearScale, PointElement, Tooltip, Legend)

const GROUP_COLORS = {
  'Group 1': '#16a34a',
  'Group 2': '#2563eb',
  'Time-Sensitive': '#d97706',
  'Infrastructure': '#7c3aed',
  'Unassigned': '#9ca3af',
}

function SignalAnalysis({ signals, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  const data = (signals || []).filter(s => s.signal_count != null || s.cwp_contacts != null)

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Signal Analysis</h3>
        <div className="flex items-center justify-center h-64 text-gray-400">
          <p className="text-sm">No signal data available</p>
        </div>
      </div>
    )
  }

  // Group by outreach group for separate datasets (legend)
  const groupBuckets = {}
  for (const s of data) {
    const group = s.outreach_group || 'Unassigned'
    if (!groupBuckets[group]) groupBuckets[group] = []
    const pressCount = s.press_count || 0
    const radius = Math.max(4, Math.min(20, pressCount * 2 + 4))
    groupBuckets[group].push({
      x: s.signal_count || 0,
      y: s.cwp_contacts || 0,
      r: radius,
      company: s.company,
      press_count: pressCount,
      revenue: s.revenue_est_m,
      medical: s.medical_device_mfg,
    })
  }

  const datasets = Object.entries(groupBuckets).map(([group, points]) => ({
    label: group,
    data: points,
    backgroundColor: (GROUP_COLORS[group] || '#9ca3af') + '99',
    borderColor: GROUP_COLORS[group] || '#9ca3af',
    borderWidth: 1.5,
  }))

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const d = ctx.raw
            const lines = [
              d.company,
              `Signals: ${d.x}`,
              `CWP Contacts: ${d.y}`,
            ]
            if (d.press_count) lines.push(`Press Mentions: ${d.press_count}`)
            if (d.revenue) lines.push(`Est. Revenue: $${d.revenue}M`)
            if (d.medical?.startsWith('Yes')) lines.push('Medical Device Mfg')
            return lines
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Signal Count', font: { size: 12, weight: 'bold' } },
        grid: { color: '#f3f4f6' },
        beginAtZero: true,
      },
      y: {
        title: { display: true, text: 'CWP Contacts', font: { size: 12, weight: 'bold' } },
        grid: { color: '#f3f4f6' },
        beginAtZero: true,
      },
    },
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Signal Analysis</h3>
        <p className="text-xs text-gray-500">Bubble size = press mentions. Top-right = warmest targets.</p>
      </div>
      <div style={{ height: 350 }}>
        <Bubble data={{ datasets }} options={options} />
      </div>
    </div>
  )
}

export default SignalAnalysis
