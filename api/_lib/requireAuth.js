// Shared session validation for data endpoints.
// Files prefixed with an underscore inside api/ are NOT deployed as serverless
// functions by Vercel, so this module does not count toward the function limit.
//
// Mirrors the session lookup in api/auth.js (getSessionUser). Sessions persist
// until explicit logout; a row in `sessions` joined to an active user is valid.

export async function getSessionUser(req, sql) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  if (!token) return null
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.color, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${token} AND u.is_active = true
  `
  return rows[0] || null
}

// Returns the authenticated user, or sends a 401 and returns null.
// Callers must `return` when this yields null.
export async function requireAuth(req, res, sql) {
  try {
    const user = await getSessionUser(req, sql)
    if (user) return user
  } catch (err) {
    console.error('Auth check failed:', err)
    res.status(500).json({ error: 'Auth check failed' })
    return null
  }
  res.status(401).json({ error: 'Not authenticated' })
  return null
}
