import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'

const COLOR_OPTIONS = [
  { value: '#7C3AED', label: 'Purple' },
  { value: '#0891B2', label: 'Cyan' },
  { value: '#D97706', label: 'Amber' },
  { value: '#059669', label: 'Green' },
  { value: '#DC2626', label: 'Red' },
  { value: '#2563EB', label: 'Blue' },
  { value: '#6B7280', label: 'Gray' },
]

function AdminPanel({ onClose }) {
  const { authFetch } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [generatedPin, setGeneratedPin] = useState(null)
  const [error, setError] = useState(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth?action=list-users')
      if (!res.ok) throw new Error('Failed to load users')
      const data = await res.json()
      setUsers(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(85vh-65px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Generated PIN display */}
          {generatedPin && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">PIN generated successfully</p>
              <p className="mt-1 text-2xl font-mono font-bold text-green-900 tracking-widest">{generatedPin.pin}</p>
              <p className="mt-1 text-xs text-green-700">
                For: {generatedPin.name} &mdash; Share this PIN verbally. It cannot be retrieved again.
              </p>
              <button
                onClick={() => setGeneratedPin(null)}
                className="mt-2 text-xs text-green-600 hover:text-green-800 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Add user button */}
          {!showAddForm && !editingUser && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mb-4 px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#0F3460] transition-colors"
            >
              + Add User
            </button>
          )}

          {/* Add user form */}
          {showAddForm && (
            <UserForm
              onSubmit={async (formData) => {
                setError(null)
                const res = await authFetch('/api/auth?action=create-user', {
                  method: 'POST',
                  body: JSON.stringify(formData),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || 'Failed to create user')
                setGeneratedPin({ pin: data.pin, name: formData.name })
                setShowAddForm(false)
                fetchUsers()
              }}
              onCancel={() => setShowAddForm(false)}
              setError={setError}
            />
          )}

          {/* Edit user form */}
          {editingUser && (
            <UserForm
              user={editingUser}
              onSubmit={async (formData) => {
                setError(null)
                const res = await authFetch(`/api/auth?action=update-user&id=${editingUser.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify(formData),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || 'Failed to update user')
                setEditingUser(null)
                fetchUsers()
              }}
              onCancel={() => setEditingUser(null)}
              setError={setError}
              isEdit
            />
          )}

          {/* Users list */}
          {loading ? (
            <p className="text-sm text-gray-500">Loading users...</p>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className={`flex items-center justify-between p-3 rounded-lg border ${u.is_active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium"
                      style={{ backgroundColor: u.color }}
                    >
                      {u.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {u.name}
                        {u.role === 'admin' && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">admin</span>
                        )}
                        {!u.is_active && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">inactive</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.last_login_at && (
                      <span className="text-xs text-gray-400 mr-2">
                        Last login: {new Date(u.last_login_at).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      onClick={() => { setEditingUser(u); setShowAddForm(false) }}
                      className="px-2.5 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Reset PIN for ${u.name}?`)) return
                        setError(null)
                        try {
                          const res = await authFetch(`/api/auth?action=reset-pin&id=${u.id}`, { method: 'POST' })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data.error || 'Failed to reset PIN')
                          setGeneratedPin({ pin: data.pin, name: u.name })
                        } catch (err) {
                          setError(err.message)
                        }
                      }}
                      className="px-2.5 py-1 text-xs text-amber-600 hover:text-amber-800 border border-amber-300 rounded hover:bg-amber-50 transition-colors"
                    >
                      Reset PIN
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function UserForm({ user, onSubmit, onCancel, setError, isEdit }) {
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [color, setColor] = useState(user?.color || '#6B7280')
  const [role, setRole] = useState(user?.role || 'member')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const data = { name, email, color, role }
      if (isEdit) data.is_active = isActive
      await onSubmit(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{isEdit ? 'Edit User' : 'Add New User'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#041E42] focus:border-transparent outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#041E42] focus:border-transparent outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${color === c.value ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#041E42] focus:border-transparent outline-none"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {isEdit && (
          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#041E42] focus:ring-[#041E42]"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={submitting || !name || !email}
          className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#0F3460] transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export default AdminPanel
