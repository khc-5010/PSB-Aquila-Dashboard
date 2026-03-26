import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

function LoginScreen() {
  const { login, sessionError, clearSessionError } = useAuth()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    clearSessionError()
    setSubmitting(true)

    try {
      await login(email.trim(), pin)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const displayError = error || sessionError

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #041E42 0%, #0F3460 50%, #164E63 100%)' }}>
      <div className="w-full max-w-sm mx-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <img
              src="/aquila-logo.png"
              alt="Aquila"
              className="h-12 mx-auto mb-4"
            />
            <h1 className="text-xl font-semibold text-gray-900">
              AI<sup className="text-xs">2</sup> Opportunity Tracker
            </h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
          </div>

          {/* Error */}
          {displayError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{displayError}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#041E42] focus:border-transparent outline-none transition-shadow"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1">
                PIN
              </label>
              <input
                id="pin"
                type="password"
                required
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm tracking-[0.3em] text-center focus:ring-2 focus:ring-[#041E42] focus:border-transparent outline-none transition-shadow"
                placeholder="------"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !email || pin.length < 6}
              className="w-full py-2.5 px-4 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#041E42' }}
              onMouseEnter={(e) => { if (!e.target.disabled) e.target.style.backgroundColor = '#0F3460' }}
              onMouseLeave={(e) => { e.target.style.backgroundColor = '#041E42' }}
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-xs text-gray-400 text-center">
            PSB-Aquila Partnership Dashboard
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginScreen
