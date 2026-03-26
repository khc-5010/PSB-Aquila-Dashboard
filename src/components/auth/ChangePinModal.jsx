import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

function ChangePinModal({ onClose }) {
  const { authFetch } = useAuth()
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (newPin !== confirmPin) {
      setError('New PINs do not match')
      return
    }

    setSubmitting(true)
    try {
      const res = await authFetch('/api/auth?action=change-pin', {
        method: 'POST',
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change PIN')
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Change PIN</h2>

        {success ? (
          <div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
              <p className="text-sm text-green-800">PIN changed successfully.</p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#0F3460] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current PIN</label>
              <input
                type="password"
                required
                inputMode="numeric"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tracking-[0.3em] text-center focus:ring-2 focus:ring-[#041E42] focus:border-transparent outline-none"
                placeholder="------"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New PIN</label>
              <input
                type="password"
                required
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tracking-[0.3em] text-center focus:ring-2 focus:ring-[#041E42] focus:border-transparent outline-none"
                placeholder="------"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New PIN</label>
              <input
                type="password"
                required
                inputMode="numeric"
                maxLength={6}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tracking-[0.3em] text-center focus:ring-2 focus:ring-[#041E42] focus:border-transparent outline-none"
                placeholder="------"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting || currentPin.length < 6 || newPin.length < 6 || confirmPin.length < 6}
                className="flex-1 py-2 text-sm font-medium text-white bg-[#041E42] rounded-lg hover:bg-[#0F3460] transition-colors disabled:opacity-50"
              >
                {submitting ? 'Changing...' : 'Change PIN'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default ChangePinModal
