import { useState, useEffect, useRef } from 'react'
import { X, AlertTriangle, XCircle, Info, CheckCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

const SEVERITY_CONFIG = {
  critical: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Critical', dot: 'bg-red-500' },
  high: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'High', dot: 'bg-amber-500' },
  warning: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', label: 'Warning', dot: 'bg-yellow-500' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Info', dot: 'bg-blue-500' },
}

const CATEGORY_LABELS = {
  completeness: 'Field Completeness',
  consistency: 'Logical Consistency',
  coverage: 'Coverage Gaps',
}

export default function DataAuditModal({ onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedRules, setExpandedRules] = useState({})
  const cacheRef = useRef(null)

  const fetchAudit = async (force = false) => {
    if (!force && cacheRef.current) {
      setData(cacheRef.current)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/prospects?action=data-audit')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      cacheRef.current = result
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAudit() }, [])

  const toggleRule = (id) => {
    setExpandedRules(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const activeRules = data?.rules?.filter(r => r.count > 0) || []
  const cleanCount = data?.rules?.filter(r => r.count === 0).length || 0

  // Group active rules by category
  const grouped = {}
  for (const rule of activeRules) {
    if (!grouped[rule.category]) grouped[rule.category] = []
    grouped[rule.category].push(rule)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Data Quality Audit</h2>
            {data && (
              <p className="text-xs text-gray-500 mt-0.5">
                {data.total_prospects} prospects scanned · {new Date(data.timestamp).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button
                onClick={() => fetchAudit(true)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                title="Re-run audit"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <RefreshCw className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">Running diagnostics...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              Failed to run audit: {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { key: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700 border-red-200' },
                  { key: 'high', label: 'High', color: 'bg-amber-100 text-amber-700 border-amber-200' },
                  { key: 'warning', label: 'Warning', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
                  { key: 'clean', label: 'Clean', color: 'bg-green-100 text-green-700 border-green-200' },
                ].map(s => (
                  <div key={s.key} className={`rounded-lg border px-3 py-2 text-center ${s.color}`}>
                    <div className="text-2xl font-bold">{data.summary[s.key]}</div>
                    <div className="text-xs font-medium">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Rules by category */}
              {['completeness', 'consistency', 'coverage'].map(cat => {
                const catRules = grouped[cat]
                if (!catRules || catRules.length === 0) return null
                return (
                  <div key={cat} className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      {CATEGORY_LABELS[cat]}
                    </h3>
                    <div className="space-y-2">
                      {catRules
                        .sort((a, b) => {
                          const order = { critical: 0, high: 1, warning: 2, info: 3 }
                          return (order[a.severity] ?? 4) - (order[b.severity] ?? 4)
                        })
                        .map(rule => {
                          const cfg = SEVERITY_CONFIG[rule.severity]
                          const Icon = cfg.icon
                          const expanded = expandedRules[rule.id]
                          return (
                            <div key={rule.id} className={`rounded-lg border ${cfg.border} ${cfg.bg}`}>
                              <button
                                onClick={() => toggleRule(rule.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                              >
                                <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                                <div className="flex-1 min-w-0">
                                  <span className={`text-sm font-medium ${cfg.color}`}>{rule.name}</span>
                                </div>
                                <span className={`text-sm font-bold ${cfg.color}`}>{rule.count}</span>
                                {expanded
                                  ? <ChevronDown className="w-4 h-4 text-gray-400" />
                                  : <ChevronRight className="w-4 h-4 text-gray-400" />
                                }
                              </button>
                              {expanded && (
                                <div className="px-4 pb-3 ml-7">
                                  <p className="text-xs text-gray-600 mb-1">{rule.description}</p>
                                  <p className="text-xs text-gray-500 italic mb-2">💡 {rule.suggestion}</p>
                                  {rule.examples.length > 0 && (
                                    <div className="mt-2">
                                      <p className="text-xs font-medium text-gray-500 mb-1">Examples:</p>
                                      <ul className="space-y-0.5">
                                        {rule.examples.map((ex, i) => (
                                          <li key={i} className="text-xs text-gray-600 font-mono">
                                            • {ex.company}{ex.detail ? ` — ${ex.detail}` : ''}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )
              })}

              {/* Clean rules summary */}
              {cleanCount > 0 && (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-lg px-4 py-3 mb-6 border border-green-200">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">{cleanCount} rule{cleanCount !== 1 ? 's' : ''} passed with no issues</span>
                </div>
              )}

              {/* State Signal Health */}
              {data.state_signal_health && data.state_signal_health.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    State Signal Health
                  </h3>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                          <th className="text-left px-3 py-2 font-medium">State</th>
                          <th className="text-right px-3 py-2 font-medium">Prospects</th>
                          <th className="text-right px-3 py-2 font-medium">Avg Signal</th>
                          <th className="text-right px-3 py-2 font-medium">Zero Signal</th>
                          <th className="text-right px-3 py-2 font-medium">% Zero</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.state_signal_health.map(s => {
                          const pctZero = s.count > 0 ? Math.round((s.zero_signal_count / s.count) * 100) : 0
                          const isRed = s.avg_signal < 0.5 && s.count >= 5
                          return (
                            <tr key={s.state} className={isRed ? 'bg-red-50' : 'hover:bg-gray-50'}>
                              <td className={`px-3 py-1.5 font-medium ${isRed ? 'text-red-700' : 'text-gray-900'}`}>{s.state}</td>
                              <td className="px-3 py-1.5 text-right text-gray-600">{s.count}</td>
                              <td className={`px-3 py-1.5 text-right font-medium ${isRed ? 'text-red-700' : 'text-gray-900'}`}>{s.avg_signal}</td>
                              <td className="px-3 py-1.5 text-right text-gray-600">{s.zero_signal_count}</td>
                              <td className={`px-3 py-1.5 text-right ${pctZero > 80 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>{pctZero}%</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Ontology Health */}
              {data.ontology_health && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Ontology Health
                  </h3>
                  {data.ontology_health.skipped ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-500">
                      {data.ontology_health.reason}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <div className="text-lg font-bold text-gray-900">{data.ontology_health.coverage_pct}%</div>
                        <div className="text-xs text-gray-500">Prospect coverage ({data.ontology_health.companies_in_ontology}/{data.ontology_health.total_prospects})</div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <div className="text-lg font-bold text-gray-900">{data.ontology_health.layer1_entities + data.ontology_health.layer2_entities}</div>
                        <div className="text-xs text-gray-500">Entities (L1: {data.ontology_health.layer1_entities}, L2: {data.ontology_health.layer2_entities})</div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <div className="text-lg font-bold text-gray-900">{data.ontology_health.layer1_relationships + data.ontology_health.layer2_relationships}</div>
                        <div className="text-xs text-gray-500">Relationships (L1: {data.ontology_health.layer1_relationships}, L2: {data.ontology_health.layer2_relationships})</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
