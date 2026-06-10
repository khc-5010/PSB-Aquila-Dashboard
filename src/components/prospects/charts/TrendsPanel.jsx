import { useState, useEffect } from 'react'
import { authFetch } from '../../../context/AuthContext'

/**
 * Activity Trends (QA audit E7) — monthly momentum counts for the quarterly
 * review: prospects added, conversions to pipeline, research briefs attached.
 * Self-fetching from ?action=trends. Deliberately global: the filter bar does
 * not apply (these are program-level numbers, not slice-and-dice analytics).
 */

const SERIES = [
  { key: 'added', label: 'Prospects Added', color: '#041E42' },
  { key: 'conversions', label: 'Conversions', color: '#7C3AED' },
  { key: 'briefs', label: 'Research Briefs', color: '#16A34A' },
]

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })
}

function MiniBarChart({ series, dataKey, color, label }) {
  const max = Math.max(1, ...series.map(r => r[dataKey]))
  const total = series.reduce((s, r) => s + r[dataKey], 0)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs text-gray-400">{total} / 12mo</span>
      </div>
      <div className="flex items-end gap-1 h-20">
        {series.map(row => (
          <div key={row.month} className="flex-1 flex flex-col items-center justify-end h-full" title={`${monthLabel(row.month)} ${row.month.slice(0, 4)}: ${row[dataKey]}`}>
            <div
              className="w-full rounded-t"
              style={{
                backgroundColor: row[dataKey] > 0 ? color : '#E5E7EB',
                height: row[dataKey] > 0 ? `${Math.max(8, (row[dataKey] / max) * 100)}%` : '3px',
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {series.map((row, i) => (
          <div key={row.month} className="flex-1 text-center text-[9px] text-gray-400">
            {i % 3 === 0 ? monthLabel(row.month) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendsPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    authFetch('/api/prospects?action=trends')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-semibold text-[#041E42]">Activity Trends</h3>
        <span className="text-[11px] text-gray-400">Last 12 months · all prospects (filters don't apply)</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Program momentum for quarterly reviews. Status-change history accrues from the day transition logging deployed.
      </p>

      {error ? (
        <p className="text-xs text-red-600">Failed to load trends: {error}</p>
      ) : !data ? (
        <div className="h-24 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-[#041E42] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SERIES.map(s => (
            <MiniBarChart key={s.key} series={data.series} dataKey={s.key} color={s.color} label={s.label} />
          ))}
        </div>
      )}
    </div>
  )
}

export default TrendsPanel
