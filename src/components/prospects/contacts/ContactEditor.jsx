import { useState, useEffect, useRef } from 'react'

// Inline add/edit form for a prospect contact (QA audit E5). Mirrors
// TaskInlineEditor's pattern: local draft state, explicit Save/Cancel,
// Escape cancels. Only `name` is required.
export default function ContactEditor({ initial = null, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    role: initial?.role || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    source: initial?.source || '',
    last_contacted: initial?.last_contacted ? String(initial.last_contacted).split('T')[0] : '',
    notes: initial?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim() || saving) return
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        role: form.role.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        source: form.source.trim() || null,
        last_contacted: form.last_contacted || null,
        notes: form.notes.trim() || null,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onCancel()
  }

  const inputClass = 'w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#041E42]/20'

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2" onKeyDown={handleKeyDown}>
      <div className="grid grid-cols-2 gap-2">
        <input ref={nameRef} type="text" placeholder="Name *" value={form.name} onChange={set('name')} className={inputClass} />
        <input type="text" placeholder="Role / title" value={form.role} onChange={set('role')} className={inputClass} />
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} className={inputClass} />
        <input type="tel" placeholder="Phone" value={form.phone} onChange={set('phone')} className={inputClass} />
        <input type="text" placeholder="Source (e.g. CWP list, LinkedIn)" value={form.source} onChange={set('source')} className={inputClass} />
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] text-gray-500 whitespace-nowrap">Last contacted</label>
          <input type="date" value={form.last_contacted} onChange={set('last_contacted')} className={inputClass} />
        </div>
      </div>
      <textarea
        placeholder="Notes (relationship context, how we know them...)"
        value={form.notes}
        onChange={set('notes')}
        rows={2}
        className={inputClass}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!form.name.trim() || saving}
          className="px-2.5 py-1 text-xs font-medium text-white bg-[#041E42] rounded hover:bg-[#041E42]/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Contact'}
        </button>
      </div>
    </div>
  )
}
