import { useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useAuth } from './context/AuthContext'
import LoginScreen from './components/auth/LoginScreen'
import OpportunityCard from './components/pipeline/OpportunityCard'
import DroppableColumn from './components/pipeline/DroppableColumn'
import SortableOpportunityCard from './components/pipeline/SortableOpportunityCard'
import OpportunityDetail from './components/OpportunityDetail'
import ValueBreakdownModal from './components/ValueBreakdownModal'
import ActionSummaryModal from './components/ActionSummaryModal'
import ActiveProjectsModal from './components/ActiveProjectsModal'
import DeadlineBanner from './components/DeadlineBanner'
import MetricsBar from './components/MetricsBar'
import Header from './components/layout/Header'
import ProspectTable from './components/prospects/ProspectTable'
import NationalMap from './components/national-map/NationalMap'
import KnowledgeGraph from './components/ontology/KnowledgeGraph'
import { PIPELINE_STAGES } from './constants/pipeline'

function App() {
  const { user, loading: authLoading } = useAuth()

  const [opportunities, setOpportunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedOpportunity, setSelectedOpportunity] = useState(null)
  const [metricsModal, setMetricsModal] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const VALID_VIEWS = ['prospects', 'pipeline', 'national-map', 'knowledge-graph']

  function getViewFromHash() {
    const raw = window.location.hash.replace('#', '')
    const hash = raw.split('?')[0]
    return VALID_VIEWS.includes(hash) ? hash : 'pipeline'
  }

  const [activeView, setActiveView] = useState(getViewFromHash)

  const changeView = useCallback((view) => {
    setActiveView(view)
    window.location.hash = view
  }, [])

  useEffect(() => {
    function handleHashChange() {
      const newView = getViewFromHash()
      setActiveView(prev => prev !== newView ? newView : prev)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])
  const [users, setUsers] = useState([])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const activeOpportunity = activeId
    ? opportunities.find(o => o.id === activeId)
    : null

  // Fetch users for owner display
  useEffect(() => {
    fetch('/api/auth?action=list-users')
      .then(r => r.ok ? r.json() : [])
      .then(data => setUsers(Array.isArray(data) ? data.filter(u => u.is_active) : []))
      .catch(() => {})
  }, [])

  // Fetch opportunities
  const fetchOpportunities = useCallback(() => {
    setLoading(true)
    fetch('/api/opportunities')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        setOpportunities(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching opportunities:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchOpportunities()
  }, [fetchOpportunities])

  // Group opportunities by stage using PIPELINE_STAGES keys
  const opportunitiesByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.key] = opportunities.filter(opp => opp.stage === stage.key)
    return acc
  }, {})

  const handleCardClick = (opportunity) => {
    setSelectedOpportunity(opportunity)
  }

  const handleCloseDetail = () => {
    setSelectedOpportunity(null)
  }

  const handleMetricsSelect = (opp) => {
    setSelectedOpportunity(opp)
  }

  const handleOpportunityUpdate = (updatedOpp) => {
    setOpportunities(prev =>
      prev.map(o => o.id === updatedOpp.id ? updatedOpp : o)
    )
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

    const opportunity = opportunities.find(o => o.id === opportunityId)
    if (!opportunity || opportunity.stage === newStage) return

    // Optimistic update
    setOpportunities(prev =>
      prev.map(o =>
        o.id === opportunityId ? { ...o, stage: newStage } : o
      )
    )

    try {
      const res = await fetch(`/api/opportunities/${opportunityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      })

      if (!res.ok) throw new Error('Failed to update')

      // Log the stage transition
      await fetch('/api/stage-transitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opportunityId,
          from_stage: opportunity.stage,
          to_stage: newStage,
          transitioned_by: user?.name || 'user',
        }),
      })
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

  // No Fit handler: delete opportunity, set prospect status to Nurture
  const handleNoFit = async (opportunity) => {
    if (!window.confirm(`Mark "${opportunity.company_name}" as Not a Fit? This will remove it from the pipeline and set the prospect status to Nurture.`)) {
      return
    }

    // Optimistic removal
    setOpportunities(prev => prev.filter(o => o.id !== opportunity.id))

    try {
      // Delete the opportunity
      const res = await fetch(`/api/opportunities?id=${opportunity.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete opportunity')

      // If it came from a prospect, set status to Nurture
      if (opportunity.source_prospect_id) {
        await fetch(`/api/prospects?id=${opportunity.source_prospect_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prospect_status: 'Nurture',
            last_edited_by: user?.name || 'Unknown',
          }),
        })
      }
    } catch (error) {
      console.error('No Fit action failed:', error)
      fetchOpportunities() // Revert by refetching
    }
  }

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-[#041E42] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen />
  }

  const hasOpportunities = opportunities.length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        activeView={activeView}
        onViewChange={changeView}
      />

      {activeView === 'prospects' ? (
        <ProspectTable />
      ) : activeView === 'national-map' ? (
        <NationalMap />
      ) : activeView === 'knowledge-graph' ? (
        <KnowledgeGraph />
      ) : (
        <>
          <MetricsBar
            opportunities={opportunities}
            onValueClick={() => setMetricsModal('value')}
            onActionClick={() => setMetricsModal('action')}
            onActiveClick={() => setMetricsModal('active')}
          />

          <DeadlineBanner />

          {error && (
            <div className="bg-red-50 border-b border-red-200 px-6 py-3">
              <p className="text-sm text-red-700">Error loading opportunities: {error}</p>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <main className="p-6">
              {!loading && !hasOpportunities && (
                <div className="mb-6 bg-white border border-gray-200 rounded-lg p-8 text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-1">No active opportunities yet</h3>
                  <p className="text-sm text-gray-500">
                    Promote prospects from the <button onClick={() => changeView('prospects')} className="text-[#041E42] font-medium underline hover:no-underline">Prospects tab</button> to start tracking projects here.
                  </p>
                </div>
              )}

              <div className="flex gap-4 overflow-x-auto pb-4">
                {PIPELINE_STAGES.map((stage) => {
                  const stageOpportunities = opportunitiesByStage[stage.key] || []

                  return (
                    <DroppableColumn
                      key={stage.key}
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
                            users={users}
                            onNoFit={handleNoFit}
                          />
                        ))
                      ) : (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 opacity-50">
                          <p className="text-sm text-center text-gray-400">No opportunities</p>
                        </div>
                      )}
                    </DroppableColumn>
                  )
                })}
              </div>
            </main>

            <DragOverlay>
              {activeOpportunity ? (
                <OpportunityCard opportunity={activeOpportunity} isDragging users={users} />
              ) : null}
            </DragOverlay>
          </DndContext>

          <OpportunityDetail
            opportunity={selectedOpportunity}
            onClose={handleCloseDetail}
            onUpdate={handleOpportunityUpdate}
          />

          {metricsModal === 'value' && (
            <ValueBreakdownModal
              opportunities={opportunities}
              onClose={() => setMetricsModal(null)}
              onSelectOpportunity={handleMetricsSelect}
            />
          )}
          {metricsModal === 'action' && (
            <ActionSummaryModal
              opportunities={opportunities}
              onClose={() => setMetricsModal(null)}
              onSelectOpportunity={handleMetricsSelect}
            />
          )}
          {metricsModal === 'active' && (
            <ActiveProjectsModal
              opportunities={opportunities}
              onClose={() => setMetricsModal(null)}
              onSelectOpportunity={handleMetricsSelect}
            />
          )}
        </>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3">
        <p className="text-sm text-gray-500 text-center">
          PSB-Aquila Partnership Dashboard &bull; Built for Kyle, Duane, Steve & Brett
        </p>
      </footer>
    </div>
  )
}

export default App
