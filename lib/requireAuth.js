import { neon } from '@neondatabase/serverless'

/**
 * Shared server-side session validation for all data APIs.
 *
 * Lives in /lib (NOT /api) so Vercel does not deploy it as a serverless
 * function — it would otherwise consume one of the 12 Hobby function slots.
 *
 * Validates the `Authorization: Bearer <token>` header against the sessions
 * table (same lookup as api/auth.js's getSessionUser). On failure it writes
 * the 401 response itself and returns null; on success it returns the user
 * row ({ id, name, email, role }).
 *
 * Usage at the top of a handler:
 *   const authUser = await requireAuth(req, res)
 *   if (!authUser) return
 *
 * Exemptions are the caller's responsibility (e.g. the CRON_SECRET-gated
 * daily-digest action in api/prospects.js, and api/auth.js which manages
 * its own tokens).
 */
export async function requireAuth(req, res) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' })
    return null
  }
  const token = authHeader.slice(7)
  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return null
  }

  try {
    const sql = neon(process.env.DATABASE_URL)
    const rows = await sql`
      SELECT u.id, u.name, u.email, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ${token} AND u.is_active = true
    `
    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid or expired session' })
      return null
    }
    return rows[0]
  } catch (err) {
    console.error('Auth validation error:', err)
    res.status(500).json({ error: 'Authentication check failed' })
    return null
  }
}
