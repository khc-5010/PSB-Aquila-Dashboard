import { useState, useEffect, useMemo, useCallback } from 'react'
import { CheckCircle, Flag, AlertTriangle } from 'lucide-react'
import { useAuth, authFetch } from '../../context/AuthContext'
import CallSheet from '../prospects/CallSheet'
import DataGapQueue from './DataGapQueue'
import StatusBadge from '../prospects/StatusBadge'
import { getProspectUrgency } from '../prospects/ProspectTable'
import { isMyTaskInBadge, getTaskUrgency, getUrgencyClasses, parseLocalDate } from '../prospects/tasks/taskUtils'

// "Today" view (Couch Mode Phase 2) — the morning/couch landing surface that
// answers "what needs me right now?" in one scroll: my open tasks, flagged
// companies, urgency items, and the ranked call sheet. Default landing view
// on mobile (App.jsx); a regular tab on desktop. Self-fetching so it works
// as a top-level view; company taps hand off to the Prospects tab via the
// existing #prospects?id= deep link.

function openProspect(id) {
  window.location.hash = `prospects?id=${id}`
}

function SectionCard({ title, icon, count, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        {icon}
        <h2 className="text-sm font-semibold text-[#041E42]">{title}</h2>
        {count > 0 && (
          <span className="text-xs font-semibold text-gray-400">{count}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function TaskRow({ task, onComplete, completing }) {
  const urgency = getTaskUrgency(task)
  const classes = getUrgencyClasses(urgency)
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <button
        onClick={() => onComplete(task)}
        disabled={completing}
        className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors disabled:opacity-50"
        title="Mark done"
        aria-label={`Mark done: ${task.description}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-800">{task.description}</p>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <button
            onClick={() => openProspect(task.prospect_id)}
            className="text-xs font-medium text-[#041E42] hover:underline"
          >
            {task.company_name}
          </button>
          {urgency && (
            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${classes.bg} ${classes.text}`}>
              {urgency.label}
            </span>
          )}
          {!task.assignee && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500">
              unassigned — grab it
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function TodayView() {
  const { user } = useAuth()
  const [prospects, setProspects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [completingId, setCompletingId] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const [pRes, tRes] = await Promise.all([
        authFetch('/api/prospects'),
        authFetch('/api/prospects?action=tasks&assignee=all&status=open'),
      ])
      if (!pRes.ok || !tRes.ok) throw new Error('Failed to load data')
      const [pData, tData] = await Promise.all([pRes.json(), tRes.json()])
      setProspects(Array.isArray(pData) ? pData : [])
      setTasks(Array.isArray(tData) ? tData : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const myTasks = useMemo(
    () => tasks.filter(t => isMyTaskInBadge(t, user?.name)),
    [tasks, user?.name]
  )

  // taskCounts in the same Map shape ProspectTable feeds CallSheet.
  const taskCounts = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      const entry = map.get(t.prospect_id) || { count: 0, earliestDueDate: null }
      entry.count += 1
      const due = parseLocalDate(t.due_date)
      if (due && (!entry.earliestDueDate || due < entry.earliestDueDate)) entry.earliestDueDate = due
      map.set(t.prospect_id, entry)
    }
    return map
  }, [tasks])

  const flagged = useMemo(() => prospects.filter(p => p.needs_review), [prospects])

  const attention = useMemo(() => {
    return prospects
      .map(p => ({ p, urgency: getProspectUrgency(p) }))
      .filter(x => x.urgency && x.urgency.priority <= 7)
      .sort((a, b) => a.urgency.priority - b.urgency.priority)
  }, [prospects])

  // Fill-the-Blanks save: patch local state so the gap leaves the queue
  // without a refetch (the server already recalculated score/ontology).
  const handleGapSaved = (id, field, val) => {
    setProspects(ps => ps.map(pr => pr.id === id ? { ...pr, [field]: val } : pr))
  }

  const handleComplete = async (task) => {
    setCompletingId(task.id)
    const prev = tasks
    setTasks(ts => ts.filter(t => t.id !== task.id)) // optimistic
    try {
      const res = await authFetch(`/api/prospects?action=tasks&task_id=${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', updated_by: user?.name || 'Unknown' }),
      })
      if (!res.ok) throw new Error('Failed to complete task')
    } catch {
      setTasks(prev) // revert
      setError('Could not complete the task — try again.')
    } finally {
      setCompletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#041E42] rounded-full animate-spin" />
      </div>
    )
  }

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 pb-16 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-[#041E42]">
          {user?.name ? `Good day, ${user.name}` : 'Today'}
        </h1>
        <p className="text-xs text-gray-500">{todayLabel}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <SectionCard
        title="My Tasks"
        count={myTasks.length}
        icon={<CheckCircle className="w-4 h-4 text-[#041E42]" />}
      >
        {myTasks.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-400">Nothing open — enjoy the quiet or grab a call below.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {myTasks.map(t => (
              <TaskRow key={t.id} task={t} onComplete={handleComplete} completing={completingId === t.id} />
            ))}
          </div>
        )}
      </SectionCard>

      {flagged.length > 0 && (
        <SectionCard
          title="Flagged for Review"
          count={flagged.length}
          icon={<Flag className="w-4 h-4 text-amber-500" />}
        >
          <div className="divide-y divide-gray-50">
            {flagged.map(p => (
              <button key={p.id} onClick={() => openProspect(p.id)} className="w-full text-left px-4 py-3 hover:bg-gray-50">
                <span className="text-sm font-medium text-gray-900">{p.company}</span>
                {p.review_note && <p className="text-xs text-gray-600 mt-0.5">{p.review_note}</p>}
                <p className="text-[11px] text-gray-400 mt-0.5">flagged by {p.review_flagged_by || 'Unknown'}</p>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {attention.length > 0 && (
        <SectionCard
          title="Needs Attention"
          count={attention.length}
          icon={<AlertTriangle className="w-4 h-4 text-orange-500" />}
        >
          <div className="divide-y divide-gray-50">
            {attention.slice(0, 10).map(({ p, urgency }) => {
              const classes = getUrgencyClasses(urgency)
              return (
                <button key={p.id} onClick={() => openProspect(p.id)} className="w-full text-left px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{p.company}</span>
                    <StatusBadge status={p.prospect_status} />
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${classes.bg} ${classes.text}`}>
                      {urgency.label}
                    </span>
                  </div>
                  {p.suggested_next_step && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">→ {p.suggested_next_step}</p>
                  )}
                </button>
              )
            })}
          </div>
          {attention.length > 10 && (
            <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">
              +{attention.length - 10} more — see the Prospects tab Action Items preset
            </p>
          )}
        </SectionCard>
      )}

      <DataGapQueue
        prospects={prospects}
        onSaved={handleGapSaved}
        onOpenProspect={openProspect}
      />

      {/* Ranked call queue — same component the Prospects sub-view uses,
          unfiltered here (global top of the list). */}
      <div className="-mx-4 sm:-mx-6">
        <CallSheet
          prospects={prospects}
          taskCounts={taskCounts}
          getUrgency={getProspectUrgency}
          onSelect={(p) => openProspect(p.id)}
        />
      </div>
    </div>
  )
}

export default TodayView
