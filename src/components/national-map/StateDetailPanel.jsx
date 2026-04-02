function StateDetailPanel({ stateId, stateName, data, onClose }) {
  if (!stateId) return null

  const hasData = data && data.prospect_count > 0

  // Priority breakdown for horizontal bar
  const priorities = data?.priorities || {}
  const totalPriority = Object.values(priorities).reduce((s, v) => s + v, 0)

  const priorityColors = {
    'HIGH PRIORITY': '#16A34A',
    'QUALIFIED': '#2563EB',
    'STRATEGIC PARTNER': '#7C3AED',
    'WATCH': '#9CA3AF',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[480px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-[#041E42] px-5 py-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">{stateName}</h2>
                <span className="text-white/60 text-sm">{stateId}</span>
              </div>
              {hasData && (
                <p className="text-sm text-white/70 mt-1">
                  {data.prospect_count} prospect{data.prospect_count !== 1 ? 's' : ''} tracked
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white ml-3 mt-1 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {!hasData ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">No prospects in {stateName}</h3>
              <p className="text-sm text-gray-500">This state hasn't been covered in research sweeps yet.</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-[#041E42]">{data.prospect_count}</p>
                    <p className="text-xs text-gray-500">Total Prospects</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#041E42]">{data.avg_signal}</p>
                    <p className="text-xs text-gray-500">Avg Signal</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#041E42]">{data.cwp_total}</p>
                    <p className="text-xs text-gray-500">CWP Contacts</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#041E42]">
                      {data.categories?.[0]?.category || '\u2014'}
                    </p>
                    <p className="text-xs text-gray-500">Top Category</p>
                  </div>
                </div>
              </div>

              {/* Category Breakdown */}
              {data.categories?.length > 0 && (
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Top Categories</h3>
                  <div className="space-y-2">
                    {data.categories.map((cat) => (
                      <div key={cat.category} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{cat.category}</span>
                        <span className="text-sm font-medium text-[#041E42]">{cat.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Priority Breakdown */}
              {totalPriority > 0 && (
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Priority Breakdown</h3>
                  {/* Stacked bar */}
                  <div className="flex h-4 rounded-full overflow-hidden mb-3">
                    {Object.entries(priorities).map(([priority, count]) => (
                      <div
                        key={priority}
                        style={{
                          width: `${(count / totalPriority) * 100}%`,
                          backgroundColor: priorityColors[priority] || '#D1D5DB',
                        }}
                        title={`${priority}: ${count}`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(priorities).map(([priority, count]) => (
                      <div key={priority} className="flex items-center gap-1.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: priorityColors[priority] || '#D1D5DB' }}
                        />
                        <span className="text-xs text-gray-600">{priority}: {count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Companies */}
              {data.top_companies?.length > 0 && (
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Top Companies</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase tracking-wider">
                          <th className="text-left pb-2 font-medium">Company</th>
                          <th className="text-left pb-2 font-medium">Category</th>
                          <th className="text-right pb-2 font-medium">Signals</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.top_companies.map((c, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-2 font-medium text-gray-900">{c.company}</td>
                            <td className="py-2 text-gray-500">{c.category || '\u2014'}</td>
                            <td className="py-2 text-right text-gray-600">{c.signal_count ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Coming Soon Placeholders */}
              <div className="px-5 py-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Coming Soon</h3>
                <div className="space-y-3">
                  {[
                    { title: 'State Research Report', desc: 'AI-generated analysis of industry landscape and opportunities' },
                    { title: 'Prompt Builder', desc: 'Generate targeted research prompts for this state' },
                    { title: 'Ontology Summary', desc: 'Industry knowledge graph connections and insights' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100 opacity-60"
                    >
                      <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-gray-500">{item.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default StateDetailPanel
