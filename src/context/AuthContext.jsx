import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'session_token'

function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return fetch(url, { ...options, headers }).then(res => {
    // A 401 from a data endpoint means the session is dead (PIN reset,
    // deactivation, deleted session) — broadcast so AuthProvider can log out.
    // /api/auth is excluded: e.g. change-pin legitimately 401s on a wrong
    // current PIN without the session being invalid.
    if (res.status === 401 && !String(url).includes('/api/auth')) {
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    return res
  })
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(null)

  // Validate existing session on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }

    fetch('/api/auth?action=validate', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(async res => {
        if (res.ok) {
          const data = await res.json()
          if (data.valid && data.user) {
            setUser(data.user)
            setLoading(false)
            return
          }
        }
        if (res.status === 401) {
          // Explicitly invalid session — discard the token
          localStorage.removeItem(TOKEN_KEY)
          setSessionError('Session expired, please sign in again.')
        } else {
          // Server error — keep the token so a reload can retry validation
          setSessionError('Could not verify your session. Check your connection and reload.')
        }
        setLoading(false)
      })
      .catch(() => {
        // Network failure — do NOT delete the token; the session may be fine
        setSessionError('Could not verify your session. Check your connection and reload.')
        setLoading(false)
      })
  }, [])

  // Force logout when any data API reports a dead session (see authFetch)
  useEffect(() => {
    function handleUnauthorized() {
      localStorage.removeItem(TOKEN_KEY)
      setUser(null)
      setSessionError('Session expired, please sign in again.')
    }
    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [])

  const login = useCallback(async (email, pin) => {
    const res = await fetch('/api/auth?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pin }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Login failed')

    localStorage.setItem(TOKEN_KEY, data.token)
    setUser(data.user)
    setSessionError(null)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      if (token) {
        await fetch('/api/auth?action=logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        })
      }
    } catch {
      // Best effort
    }
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const clearSessionError = useCallback(() => setSessionError(null), [])

  const updateUser = useCallback((fields) => {
    setUser(prev => prev ? { ...prev, ...fields } : prev)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, sessionError, clearSessionError, authFetch, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

export { authFetch }
