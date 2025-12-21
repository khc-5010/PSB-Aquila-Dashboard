import { useState, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import OpportunityCard from './components/pipeline/OpportunityCard'
import DroppableColumn from './components/pipeline/DroppableColumn'
import SortableOpportunityCard from './components/pipeline/SortableOpportunityCard'
import OpportunityDetail from './components/OpportunityDetail'
import AddOpportunityModal from './components/AddOpportunityModal'

const STAGES = [
  { id: 'lead', name: 'Lead', color: 'bg-gray-100' },
  { id: 'qualified', name: 'Qualified', color: 'bg-blue-100' },
  { id: 'proposal', name: 'Proposal', color: 'bg-yellow-100' },
  { id: 'negotiation', name: 'Negotiation', color: 'bg-orange-100' },
  { id: 'active', name: 'Active', color: 'bg-green-100' },
  { id: 'complete', name: 'Complete', color: 'bg-purple-100' },
]

function App() {
  const [dbStatus, setDbStatus] = useState('checking')
  const [opportunities, setOpportunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedOpportunity, setSelectedOpportunity] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeId, setActiveId] = useState(null)

  // Sensor config - 8px threshold so clicks still work
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Find active opportunity for drag overlay
  const activeOpportunity = activeId
    ? opportunities.find(o => o.id === activeId)
    : null

  // Check database health
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setDbStatus(data.database ? 'connected' : 'disconnected'))
      .catch(() => setDbStatus('disconnected'))
  }, [])

  // Fetch opportunities
  useEffect(() => {
    fetch('/api/opportunities')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        console.log('Fetched opportunities:', data)
        setOpportunities(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching opportunities:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Group opportunities by stage
  const opportunitiesByStage = STAGES.reduce((acc, stage) => {
    acc[stage.id] = opportunities.filter(opp => opp.stage === stage.id)
    return acc
  }, {})

  const handleCardClick = (opportunity) => {
    setSelectedOpportunity(opportunity)
  }

  const handleCloseDetail = () => {
    setSelectedOpportunity(null)
  }

  const handleOpportunityCreated = (newOpp) => {
    setOpportunities((prev) => [...prev, newOpp])
    setShowAddModal(false)
  }

  const handleOpportunityUpdate = (updatedOpp) => {
    setOpportunities(prev =>
      prev.map(o => o.id === updatedOpp.id ? updatedOpp : o)
    )
    // Also update selectedOpportunity if it's the same one
    if (selectedOpportunity?.id === updatedOpp.id) {
      setSelectedOpportunity(updatedOpp)
    }
  }

  const handleDragStart = (event) => {
    setActiveId(event.active.id)
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const opportunityId = active.id
    const newStage = over.id

    // Find the opportunity
    const opportunity = opportunities.find(o => o.id === opportunityId)
    if (!opportunity || opportunity.stage === newStage) return

    // Optimistic update
    setOpportunities(prev =>
      prev.map(o =>
        o.id === opportunityId ? { ...o, stage: newStage } : o
      )
    )

    // API call
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      })

      if (!res.ok) throw new Error('Failed to update')
    } catch (error) {
      // Revert on failure
      console.error('Failed to update stage:', error)
      setOpportunities(prev =>
        prev.map(o =>
          o.id === opportunityId ? { ...o, stage: opportunity.stage } : o
        )
      )
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PSB-Aquila Opportunity Tracker</h1>
            <p className="text-sm text-gray-500">Industrial AI Alliance Pipeline</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + Add Opportunity
            </button>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm ${
              dbStatus === 'connected'
                ? 'bg-green-100 text-green-700'
                : dbStatus === 'checking'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                dbStatus === 'connected'
                  ? 'bg-green-500'
                  : dbStatus === 'checking'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`} />
              {dbStatus === 'connected' ? 'Database Connected' : dbStatus === 'checking' ? 'Checking...' : 'Database Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <p className="text-sm text-red-700">Error loading opportunities: {error}</p>
        </div>
      )}

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <main className="p-6">
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => {
              const stageOpportunities = opportunitiesByStage[stage.id] || []

              return (
                <DroppableColumn
                  key={stage.id}
                  stage={stage}
                  opportunities={stageOpportunities}
                >
                  {loading ? (
                    <div className="bg-white/50 rounded-lg p-4 animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  ) : stageOpportunities.length > 0 ? (
                    stageOpportunities.map((opp) => (
                      <SortableOpportunityCard
                        key={opp.id}
                        opportunity={opp}
                        onClick={handleCardClick}
                      />
                    ))
                  ) : (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 opacity-50">
                      <p className="text-sm text-gray-400 text-center">No opportunities</p>
                    </div>
                  )}
                </DroppableColumn>
              )
            })}
          </div>
        </main>

        {/* Drag overlay - ghost card while dragging */}
        <DragOverlay>
          {activeOpportunity ? (
            <OpportunityCard opportunity={activeOpportunity} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3">
        <p className="text-sm text-gray-500 text-center">
          PSB-Aquila Partnership Dashboard &bull; Built for Kyle, Duane & Steve
        </p>
      </footer>

      {/* Opportunity Detail Panel */}
      <OpportunityDetail
        opportunity={selectedOpportunity}
        onClose={handleCloseDetail}
        onUpdate={handleOpportunityUpdate}
      />

      {/* Add Opportunity Modal */}
      {showAddModal && (
        <AddOpportunityModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleOpportunityCreated}
        />
      )}
    </div>
  )
}

export default App
