import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../../context/AuthContext'
import TaskRow from './TaskRow'
import { TEAM_MEMBERS_FALLBACK } from './taskUtils'

// Cross-prospect filtered list view. Opens when the "My Tasks" badge is clicked.
// Default filter on mount: "Assigned to me + Unassigned" + "Open".
export default function TasksView({ onOpenProspect, onTasksChanged }) {
  const { user, authFetch } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [teamMembers, setTeamMembers] = useState(TEAM_MEMBERS_FALLBACK)

  // Filter state
  const [assigneeFilter, setAssigneeFilter] = useState('me')   // 'me' | 'unassigned' | 'all' | specific name
  const [statusFilter, setStatusFilter] = useState('open')     // 'open' | 'done' | 'dismissed' | 'all'

  // Pull live team members for the assignee dropdown
  useEffect(() => {
    let cancelled = false
    async function fetchTeam() {
      try {
        const res = await authFetch('/api/auth?action=team-members')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data) && data.length > 0) setTeamMembers(data)
      } catch {}
    }
    fetchTeam()
    return () => { cancelled = true }
  }, [authFetch])

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        action: 'tasks',
        assignee: assigneeFilter,
        status: statusFilter,
      })
      if (assigneeFilter === 'me' && user?.name) {
        params.set('current_user', user.name)
      }
      const res = await authFetch(`/api/prospects?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load tasks')
      const data = await res.json()
      setTasks(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [assigneeFilter, statusFilter, user?.name])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const handleUpdate = async (taskId, fields) => {
    const res = await authFetch(`/api/prospects?action=tasks&task_id=${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, updated_by: user?.name || 'Unknown' }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Failed to update task')
      return
    }
    await fetchTasks()
    onTasksChanged?.()
  }

  const handleDelete = async (taskId) => {
    const res = await authFetch(`/api/prospects?action=tasks&task_id=${taskId}&deleted_by=${encodeURIComponent(user?.name || 'Unknown')}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Failed to delete task')
      return
    }
    await fetchTasks()
    onTasksChanged?.()
  }

  const assigneeChips = [
    { value: 'me', label: 'Assigned to me' },
    { value: 'unassigned', label: 'Unassigned' },
    { value: 'all', label: 'All' },
  ]
  const statusChips = [
    { value: 'open', label: 'Open' },
    { value: 'done', label: 'Completed' },
    { value: 'dismissed', label: 'Dismissed' },
  ]
  const isSpecificAssignee = assigneeChips.every(c => c.value !== assigneeFilter)

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="px-6 py-4 space-y-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#041E42]">My Tasks</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cross-prospect task queue. Click a company name to jump to the prospect detail.
            </p>
          </div>
        </div>

        {/* Assignee filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mr-1">Assignee:</span>
          {assigneeChips.map(chip => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setAssigneeFilter(chip.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                assigneeFilter === chip.value
                  ? 'bg-[#041E42] text-white border-[#041E42]'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {chip.label}
            </button>
          ))}
          <select
            value={isSpecificAssignee ? assigneeFilter : ''}
            onChange={(e) => { if (e.target.value) setAssigneeFilter(e.target.value) }}
            className={`text-xs border rounded-full px-3 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20 ${
              isSpecificAssignee ? 'bg-[#041E42] text-white border-[#041E42]' : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            <option value="">Specific person…</option>
            {teamMembers.map(m => (
              <option key={m.name} value={m.name}>Assigned to {m.name}</option>
            ))}
          </select>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mr-1">Status:</span>
          {statusChips.map(chip => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setStatusFilter(chip.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                statusFilter === chip.value
                  ? 'bg-[#041E42] text-white border-[#041E42]'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-400 italic py-6 text-center">Loading tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-gray-400 italic py-12 text-center">
            No tasks match the current filters.
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-500 mb-2">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</div>
            <div className="space-y-2">
              {tasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onUpdate={(fields) => handleUpdate(task.id, fields)}
                  onDelete={() => handleDelete(task.id)}
                  onCompanyClick={onOpenProspect}
                  showCompany
                  currentUserName={user?.name}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
