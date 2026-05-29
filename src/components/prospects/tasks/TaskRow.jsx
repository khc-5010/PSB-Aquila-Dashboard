import { useState } from 'react'
import { Check, X, RotateCcw, Pencil, Trash2, User } from 'lucide-react'
import { getTaskUrgency, parseLocalDate, getUrgencyClasses } from './taskUtils'
import TaskInlineEditor from './TaskInlineEditor'

// Single task row. Used in both TasksSection (per-prospect) and TasksView (cross-prospect).
// In cross-prospect mode, set `showCompany` true to render the prospect's company_name.
export default function TaskRow({
  task,
  onUpdate,      // ({ description?, due_date?, assignee?, status? }) => Promise
  onDelete,      // () => Promise
  onCompanyClick,// optional — for TasksView, click company name to open prospect detail
  showCompany = false,
  currentUserName,
}) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const urgency = getTaskUrgency(task)
  const isMine = task.assignee === currentUserName
  const isUnassigned = !task.assignee

  const handleStatusChange = async (newStatus) => {
    if (newStatus === task.status) return
    await onUpdate({ status: newStatus })
  }

  if (editing) {
    return (
      <TaskInlineEditor
        initial={task}
        onSave={async (fields) => {
          await onUpdate(fields)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const dueLabel = (() => {
    if (!task.due_date) return null
    const d = parseLocalDate(task.due_date)
    if (!d) return null
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  })()

  const isDone = task.status === 'done'
  const isDismissed = task.status === 'dismissed'
  const muted = isDone || isDismissed

  const rowClasses = [
    'border rounded-lg p-3 transition-colors',
    muted ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-gray-300',
  ].join(' ')

  const descriptionClasses = [
    'text-sm',
    muted ? 'text-gray-500 line-through' : 'text-gray-900',
  ].join(' ')

  return (
    <div className={rowClasses}>
      <div className="flex items-start gap-2">
        {urgency && !muted && (
          <span
            className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${getUrgencyClasses(urgency).dot}`}
            title={urgency.label}
          />
        )}

        <div className="flex-1 min-w-0">
          {showCompany && task.company_name && (
            <button
              type="button"
              onClick={() => onCompanyClick?.(task.prospect_id)}
              className="text-xs font-semibold text-[#041E42] hover:underline mb-0.5 block"
            >
              {task.company_name}
            </button>
          )}
          <div className={descriptionClasses}>{task.description}</div>

          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
            {dueLabel && (
              <span className={urgency && !muted ? getUrgencyClasses(urgency).text : 'text-gray-500'}>
                Due {dueLabel}
                {urgency && !muted && <span className="ml-1">· {urgency.label}</span>}
              </span>
            )}

            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
              isUnassigned ? 'bg-gray-100 text-gray-500' : isMine ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
            }`}>
              <User className="w-2.5 h-2.5" />
              {isUnassigned ? 'Unassigned' : task.assignee}
            </span>

            {isDone && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                ✓ Completed{task.completed_by ? ` by ${task.completed_by}` : ''}
              </span>
            )}
            {isDismissed && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                ✗ Dismissed{task.completed_by ? ` by ${task.completed_by}` : ''}
              </span>
            )}

            <span className="text-gray-400 italic">
              Created by {task.created_by || 'Unknown'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {task.status === 'open' && (
            <>
              <button
                type="button"
                onClick={() => handleStatusChange('done')}
                className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                title="Mark done"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('dismissed')}
                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </>
          )}
          {(isDone || isDismissed) && (
            <button
              type="button"
              onClick={() => handleStatusChange('open')}
              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="Reopen"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {confirmingDelete ? (
            <div className="flex items-center gap-1 ml-1 px-2 py-1 bg-red-50 rounded">
              <span className="text-xs text-red-700">Delete?</span>
              <button
                type="button"
                onClick={async () => { await onDelete(); setConfirmingDelete(false) }}
                className="text-xs text-red-700 font-semibold hover:underline"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="text-xs text-gray-500 hover:underline"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded"
              title="Delete (hard)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
