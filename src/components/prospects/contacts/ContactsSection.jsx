import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Pencil, Trash2, Mail, Phone as PhoneIcon } from 'lucide-react'
import { useAuth, authFetch } from '../../../context/AuthContext'
import { parseLocalDate } from '../tasks/taskUtils'
import ContactEditor from './ContactEditor'

// Structured contacts per prospect (QA audit E5) — the person-level data that
// previously lived only in free text. Manual-entry MVP: list + inline
// add/edit/delete. Add/delete emit activity-log entries server-side, so the
// parent passes onActivityChanged to refresh its feed.
export default function ContactsSection({ prospectId, onActivityChanged }) {
  const { user } = useAuth()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)

  // Stale-response guard (same pattern as TasksSection)
  const currentIdRef = useRef(prospectId)
  currentIdRef.current = prospectId

  const fetchContacts = useCallback(async () => {
    const fetchedForId = prospectId
    if (!fetchedForId) return
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/prospects?action=contacts&id=${fetchedForId}`)
      if (!res.ok) throw new Error('Failed to load contacts')
      const data = await res.json()
      if (currentIdRef.current === fetchedForId) setContacts(Array.isArray(data) ? data : [])
    } catch (err) {
      if (currentIdRef.current === fetchedForId) setError(err.message)
    } finally {
      if (currentIdRef.current === fetchedForId) setLoading(false)
    }
  }, [prospectId])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  const handleCreate = async (fields) => {
    const res = await authFetch('/api/prospects?action=contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, prospect_id: prospectId, created_by: user?.name || 'Unknown' }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Failed to add contact')
      return
    }
    setAdding(false)
    await fetchContacts()
    onActivityChanged?.()
  }

  const handleUpdate = async (contactId, fields) => {
    const res = await authFetch(`/api/prospects?action=contacts&contact_id=${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Failed to update contact')
      return
    }
    setEditingId(null)
    await fetchContacts()
  }

  const handleDelete = async (contact) => {
    if (!window.confirm(`Remove contact "${contact.name}"?`)) return
    const res = await authFetch(
      `/api/prospects?action=contacts&contact_id=${contact.id}&deleted_by=${encodeURIComponent(user?.name || 'Unknown')}`,
      { method: 'DELETE' }
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Failed to delete contact')
      return
    }
    await fetchContacts()
    onActivityChanged?.()
  }

  const formatLastContacted = (val) => {
    const d = parseLocalDate(val)
    if (!d) return null
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500">
          {contacts.length > 0
            ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`
            : 'No contacts yet'}
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setEditingId(null) }}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-[#041E42] text-white rounded hover:bg-[#041E42]/90"
          >
            <Plus className="w-3 h-3" />
            Add Contact
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
          <ContactEditor onSave={handleCreate} onCancel={() => setAdding(false)} />
        </div>
      )}

      {loading ? (
        <div className="text-xs text-gray-400 italic">Loading contacts…</div>
      ) : contacts.length === 0 && !adding ? (
        <div className="text-xs text-gray-400 italic">
          No contacts on file. Names buried in notes or research briefs? Add them here so they travel with exports.
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map(contact => (
            editingId === contact.id ? (
              <ContactEditor
                key={contact.id}
                initial={contact}
                onSave={(fields) => handleUpdate(contact.id, fields)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={contact.id} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {contact.name}
                      {contact.role && <span className="font-normal text-gray-500"> · {contact.role}</span>}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-xs text-[#041E42] hover:underline" onClick={(e) => e.stopPropagation()}>
                          <Mail className="w-3 h-3" />{contact.email}
                        </a>
                      )}
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 text-xs text-[#041E42] hover:underline" onClick={(e) => e.stopPropagation()}>
                          <PhoneIcon className="w-3 h-3" />{contact.phone}
                        </a>
                      )}
                    </div>
                    {(contact.last_contacted || contact.source) && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {contact.last_contacted ? `Last contacted ${formatLastContacted(contact.last_contacted)}` : ''}
                        {contact.last_contacted && contact.source ? ' · ' : ''}
                        {contact.source ? `via ${contact.source}` : ''}
                      </p>
                    )}
                    {contact.notes && (
                      <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{contact.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => { setEditingId(contact.id); setAdding(false) }}
                      className="p-1 text-gray-400 hover:text-[#041E42] rounded hover:bg-gray-100"
                      title="Edit contact"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(contact)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                      title="Remove contact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
