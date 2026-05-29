import { useState, useEffect, useRef } from 'react'
import { DUE_DATE_PRESETS, getDateOffset, TEAM_MEMBERS_FALLBACK } from './taskUtils'
import { useAuth } from '../../../context/AuthContext'

// Inline editor used by both TasksSection (new task) and TaskRow (edit existing task).
// Mirrors the EditableField pattern from ProspectDetail.jsx for visual consistency.
export default function TaskInlineEditor({
  initial = null,
  onSave,
  onCancel,
  autoFocus = true,
}) {
  const { user, authFetch } = useAuth()
  const [description, setDescription] = useState(initial?.description || '')
  const [dueDate, setDueDate] = useState(initial?.due_date ? initial.due_date.split('T')[0] : '')
  const [assignee, setAssignee] = useState(initial?.assignee || '')
  const [teamMembers, setTeamMembers] = useState(TEAM_MEMBERS_FALLBACK)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  // Pull live team members so the dropdown reflects current users without admin role.
  useEffect(() => {
    let cancelled = false
    async function fetchTeam() {
      try {
        const res = await authFetch('/api/auth?action=team-members')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setTeamMembers(data)
        }
      } catch {
        // Keep fallback list
      }
    }
    fetchTeam()
    return () => { cancelled = true }
  }, [authFetch])

  const handleSave = async () => {
    const trimmed = description.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await onSave({
        description: trimmed,
        due_date: dueDate || null,
        assignee: assignee || null,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel?.()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/40 space-y-2" onKeyDown={handleKeyDown}>
      <textarea
        ref={textareaRef}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What needs to happen?"
        rows={2}
        className="w-full text-sm border border-blue-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-500 font-medium">Due:</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        {dueDate && (
          <button
            type="button"
            onClick={() => setDueDate('')}
            className="text-xs text-gray-400 hover:text-red-500"
            title="Clear due date"
          >
            clear
          </button>
        )}

        <label className="text-xs text-gray-500 font-medium ml-2">Assignee:</label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="">Unassigned</option>
          {teamMembers.map(m => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DUE_DATE_PRESETS.map(({ label, days }) => (
          <button
            key={label}
            type="button"
            onClick={() => setDueDate(getDateOffset(days))}
            className="text-xs px-2 py-0.5 rounded-full bg-white hover:bg-gray-100 text-gray-600 border border-gray-200"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !description.trim()}
          className="px-3 py-1 text-xs font-medium bg-[#041E42] text-white rounded hover:bg-[#041E42]/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : (initial ? 'Save' : 'Add Task')}
        </button>
      </div>
    </div>
  )
}
