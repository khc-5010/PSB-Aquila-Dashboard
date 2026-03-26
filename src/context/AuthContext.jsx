import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'session_token'

function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return fetch(url, { ...options, headers })
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
      .then(res => res.json())
      .then(data => {
        if (data.valid && data.user) {
          setUser(data.user)
        } else {
          localStorage.removeItem(TOKEN_KEY)
          setSessionError('Session expired, please sign in again.')
        }
        setLoading(false)
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        setLoading(false)
      })
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, sessionError, clearSessionError, authFetch }}>
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
