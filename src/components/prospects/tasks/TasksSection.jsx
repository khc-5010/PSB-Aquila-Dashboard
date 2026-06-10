import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth, authFetch } from '../../../context/AuthContext'
import TaskRow from './TaskRow'
import TaskInlineEditor from './TaskInlineEditor'

// Per-prospect Tasks section. Rendered inside ProspectDetail above the Activity Log.
// Manages its own task list state (fetches on mount + after each mutation).
export default function TasksSection({ prospectId, onTasksChanged }) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // Stale-response guard: a slow response for a previous prospect must not
  // render under the next one after prev/next navigation.
  const currentProspectIdRef = useRef(prospectId)
  currentProspectIdRef.current = prospectId

  const fetchTasks = useCallback(async () => {
    const fetchedForId = prospectId
    if (!fetchedForId) return
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/prospects?action=tasks&prospect_id=${fetchedForId}&status=all`)
      if (!res.ok) throw new Error('Failed to load tasks')
      const data = await res.json()
      if (currentProspectIdRef.current === fetchedForId) setTasks(Array.isArray(data) ? data : [])
    } catch (err) {
      if (currentProspectIdRef.current === fetchedForId) setError(err.message)
    } finally {
      if (currentProspectIdRef.current === fetchedForId) setLoading(false)
    }
  }, [prospectId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const openTasks = tasks.filter(t => t.status === 'open')
  const historyTasks = tasks.filter(t => t.status !== 'open')

  const notifyParent = () => {
    onTasksChanged?.()
  }

  const handleCreate = async (fields) => {
    const res = await authFetch('/api/prospects?action=tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_id: prospectId,
        description: fields.description,
        due_date: fields.due_date,
        assignee: fields.assignee,
        created_by: user?.name || 'Unknown',
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Failed to create task')
      return
    }
    setAdding(false)
    await fetchTasks()
    notifyParent()
  }

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
    notifyParent()
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
    notifyParent()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500">
          {openTasks.length > 0
            ? `${openTasks.length} open task${openTasks.length !== 1 ? 's' : ''}`
            : 'No open tasks'}
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-[#041E42] text-white rounded hover:bg-[#041E42]/90"
          >
            <Plus className="w-3 h-3" />
            Add Task
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">
          {error}
        </div>
      )}

      {adding && (
        <div className="mb-3">
          <TaskInlineEditor
            onSave={handleCreate}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {loading ? (
        <div className="text-xs text-gray-400 italic">Loading tasks…</div>
      ) : openTasks.length === 0 && !adding ? (
        <div className="text-xs text-gray-400 italic">No open tasks. Click <span className="font-semibold">Add Task</span> to create one.</div>
      ) : (
        <div className="space-y-2">
          {openTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onUpdate={(fields) => handleUpdate(task.id, fields)}
              onDelete={() => handleDelete(task.id)}
              currentUserName={user?.name}
            />
          ))}
        </div>
      )}

      {historyTasks.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Show {historyTasks.length} completed / dismissed
          </button>
          {showHistory && (
            <div className="space-y-2 mt-2">
              {historyTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onUpdate={(fields) => handleUpdate(task.id, fields)}
                  onDelete={() => handleDelete(task.id)}
                  currentUserName={user?.name}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
