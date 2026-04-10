import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const DEFAULT_PREFS = { overdue: true, due_soon: true, stale: true, pe_windows: true }

function DigestPrefsModal({ onClose }) {
  const { user, authFetch, updateUser } = useAuth()

  const [enabled, setEnabled] = useState(user?.digest_enabled ?? true)
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(user?.digest_preferences || {}) })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const togglePref = (key) => setPrefs(prev => ({ ...prev, [key]: !prev[key] }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await authFetch('/api/auth?action=update-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ digest_enabled: enabled, digest_preferences: prefs }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save')
      }
      updateUser({ digest_enabled: enabled, digest_preferences: prefs })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const sections = [
    { key: 'overdue', label: 'Overdue follow-ups', desc: 'Prospects past their follow-up date' },
    { key: 'due_soon', label: 'Due this week', desc: 'Follow-ups due today or within 7 days' },
    { key: 'stale', label: 'Stale prospects', desc: 'Prospects idle too long for their status' },
    { key: 'pe_windows', label: 'PE window alerts', desc: 'PE-backed companies with recent M&A activity' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#041E42] text-white px-5 py-3.5 rounded-t-lg flex items-center justify-between">
          <h2 className="text-base font-semibold">Digest Notifications</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">&times;</button>
        </div>

        <div className="p-5">
          {/* Master toggle */}
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-200">
            <div>
              <div className="font-medium text-gray-900 text-sm">Daily Email Digest</div>
              <div className="text-xs text-gray-500 mt-0.5">Weekday mornings at 8:00 AM ET</div>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-[#041E42]' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Section toggles */}
          <div className={`space-y-3 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            {sections.map(({ key, label, desc }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => togglePref(key)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#041E42] focus:ring-[#041E42]"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800 group-hover:text-gray-900">{label}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Email note */}
          <div className="mt-5 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-400 text-center">
              Sent to <span className="font-medium text-gray-500">{user?.email}</span>
            </p>
          </div>

          {/* Error / success */}
          {error && <p className="mt-3 text-xs text-red-600 text-center">{error}</p>}
          {saved && <p className="mt-3 text-xs text-green-600 text-center">Preferences saved</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-md hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#041E42] rounded-md hover:bg-[#0a2d5e] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DigestPrefsModal
