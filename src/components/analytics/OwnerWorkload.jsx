const OWNER_COLORS = {
  Kyle: '#8B5CF6',
  Duane: '#0D9488',
  Steve: '#F59E0B',
}

const STAGE_ORDER = ['lead', 'qualified', 'proposal', 'negotiation', 'active']

const STAGE_COLORS = {
  lead: '#8B5CF6',
  qualified: '#3B82F6',
  proposal: '#F59E0B',
  negotiation: '#EAB308',
  active: '#22C55E',
}

function OwnerWorkload({ data, loading }) {
  // Group by owner
  const owners = ['Kyle', 'Duane', 'Steve']
  const workloadByOwner = owners.map((owner) => {
    const ownerData = data?.filter((r) => r.owner === owner) || []
    const stageBreakdown = STAGE_ORDER.map((stage) => {
      const stageRow = ownerData.find((r) => r.stage === stage)
      return { stage, count: stageRow ? parseInt(stageRow.count) : 0 }
    })
    const total = stageBreakdown.reduce((sum, s) => sum + s.count, 0)
    return { owner, stageBreakdown, total }
  })

  const maxTotal = Math.max(...workloadByOwner.map((w) => w.total), 1)

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 h-80">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Owner Workload</h3>
      <div className="space-y-4">
        {workloadByOwner.map(({ owner, stageBreakdown, total }) => (
          <div key={owner}>
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ backgroundColor: OWNER_COLORS[owner] }}
                >
                  {owner[0]}
                </div>
                <span className="text-sm font-medium text-gray-700">{owner}</span>
              </div>
              <span className="text-sm text-gray-500">{total} opps</span>
            </div>
            <div className="h-6 bg-gray-100 rounded-full overflow-hidden flex">
              {stageBreakdown.map(({ stage, count }) => {
                if (count === 0) return null
                const width = (count / maxTotal) * 100
                return (
                  <div
                    key={stage}
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${width}%`,
                      backgroundColor: STAGE_COLORS[stage],
                    }}
                    title={`${stage}: ${count}`}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex flex-wrap gap-3">
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: STAGE_COLORS[stage] }}
              />
              <span className="text-xs text-gray-500 capitalize">{stage}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default OwnerWorkload
