import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

/**
 * Consolidated auth API — single serverless function.
 *
 * POST /api/auth?action=login        — validate email + PIN, create session
 * POST /api/auth?action=logout       — delete session
 * GET  /api/auth?action=validate     — validate session token
 * GET  /api/auth?action=me           — get current user profile
 * POST /api/auth?action=create-user  — admin: add new user
 * PATCH /api/auth?action=update-user&id=X — admin: edit user
 * PATCH /api/auth?action=update-preferences — update own digest notification preferences
 * POST /api/auth?action=reset-pin&id=X   — admin: generate new PIN
 * POST /api/auth?action=change-pin   — change own PIN
 * GET  /api/auth?action=list-users   — admin: get all users
 * GET  /api/auth?action=team-members — any user: active member names + colors
 *
 * Initial setup is handled by scripts/setup-admin.js (the old unauthenticated
 * ?action=setup endpoint was removed — it leaked the admin's identity).
 */

// Brute-force protection: a 6-digit PIN is only 1M combinations, so failed
// logins are throttled per-email with a temporary lockout.
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

// Hash compared on unknown-email logins so the response time doesn't reveal
// whether an email is registered. Computed once per cold start.
const dummyHashPromise = bcrypt.hash('not-a-real-pin', 10)

// CREATE TABLE IF NOT EXISTS once per cold start (logins are infrequent).
// Canonical DDL also lives in scripts/create-login-attempts.sql.
let attemptsTableReady = false
async function ensureAttemptsTable(sql) {
  if (attemptsTableReady) return
  await sql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      email TEXT PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      last_failed_at TIMESTAMPTZ,
      locked_until TIMESTAMPTZ
    )
  `
  attemptsTableReady = true
}
export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)
  const { action, id } = req.query

  // ─── Helper: extract session user ──────────────────────
  async function getSessionUser() {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.slice(7)
    const rows = await sql`
      SELECT u.id, u.name, u.email, u.color, u.role, u.is_active, u.digest_enabled, u.digest_preferences
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ${token} AND u.is_active = true
    `
    return rows[0] || null
  }

  // ─── Helper: require admin ─────────────────────────────
  async function requireAdmin() {
    const user = await getSessionUser()
    if (!user) return { error: 'Unauthorized', status: 401 }
    if (user.role !== 'admin') return { error: 'Forbidden', status: 403 }
    return { user }
  }

  // ─── Helper: generate 6-digit PIN (CSPRNG) ────────────
  function generatePin() {
    return String(crypto.randomInt(100000, 1000000))
  }

  // ─── POST ──────────────────────────────────────────────
  if (req.method === 'POST') {

    // ── Login ────────────────────────────────────────────
    if (action === 'login') {
      try {
        const { email, pin } = req.body || {}
        if (!email || !pin) {
          return res.status(400).json({ error: 'Email and PIN are required' })
        }
        const normalizedEmail = email.toLowerCase().trim()

        await ensureAttemptsTable(sql)

        // Lockout check before any credential work
        const [attempt] = await sql`
          SELECT failed_count, locked_until FROM login_attempts WHERE email = ${normalizedEmail}
        `
        if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
          return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' })
        }

        const users = await sql`
          SELECT id, name, email, pin_hash, color, role, is_active, digest_enabled, digest_preferences
          FROM users WHERE email = ${normalizedEmail}
        `
        const user = users[0]

        // Always run a bcrypt compare — even for unknown emails — so response
        // timing doesn't reveal which emails are registered. Deactivated
        // accounts get the same generic error for the same reason.
        const hashToCheck = user?.pin_hash || (await dummyHashPromise)
        const pinValid = await bcrypt.compare(String(pin), hashToCheck)

        if (!user || !user.is_active || !pinValid) {
          await sql`
            INSERT INTO login_attempts (email, failed_count, last_failed_at, locked_until)
            VALUES (${normalizedEmail}, 1, NOW(), NULL)
            ON CONFLICT (email) DO UPDATE SET
              failed_count = login_attempts.failed_count + 1,
              last_failed_at = NOW(),
              locked_until = CASE
                WHEN login_attempts.failed_count + 1 >= ${MAX_FAILED_ATTEMPTS}
                THEN NOW() + make_interval(mins => ${LOCKOUT_MINUTES})
                ELSE NULL
              END
          `
          return res.status(401).json({ error: 'Invalid email or PIN' })
        }

        // Success — clear the failure counter
        await sql`DELETE FROM login_attempts WHERE email = ${normalizedEmail}`

        // Create session
        const sessionId = crypto.randomUUID()
        await sql`INSERT INTO sessions (id, user_id) VALUES (${sessionId}, ${user.id})`
        await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`

        return res.status(200).json({
          token: sessionId,
          user: { id: user.id, name: user.name, email: user.email, color: user.color, role: user.role, digest_enabled: user.digest_enabled, digest_preferences: user.digest_preferences },
        })
      } catch (err) {
        console.error('Login error:', err)
        return res.status(500).json({ error: 'Login failed' })
      }
    }

    // ── Logout ───────────────────────────────────────────
    if (action === 'logout') {
      try {
        const authHeader = req.headers.authorization
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.slice(7)
          await sql`DELETE FROM sessions WHERE id = ${token}`
        }
        return res.status(200).json({ success: true })
      } catch (err) {
        console.error('Logout error:', err)
        return res.status(500).json({ error: 'Logout failed' })
      }
    }

    // ── Create user (admin only) ─────────────────────────
    if (action === 'create-user') {
      const auth = await requireAdmin()
      if (auth.error) return res.status(auth.status).json({ error: auth.error })

      try {
        const { name, email, color, role } = req.body || {}
        if (!name || !email) {
          return res.status(400).json({ error: 'Name and email are required' })
        }

        // Check for duplicate email
        const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`
        if (existing.length > 0) {
          return res.status(409).json({ error: 'A user with this email already exists' })
        }

        const pin = generatePin()
        const pinHash = await bcrypt.hash(pin, 10)
        const userRole = role === 'admin' ? 'admin' : 'member'
        const userColor = color || '#6B7280'

        const result = await sql`
          INSERT INTO users (name, email, pin_hash, color, role)
          VALUES (${name.trim()}, ${email.toLowerCase().trim()}, ${pinHash}, ${userColor}, ${userRole})
          RETURNING id, name, email, color, role, is_active, created_at
        `

        return res.status(201).json({ user: result[0], pin })
      } catch (err) {
        console.error('Create user error:', err)
        return res.status(500).json({ error: 'Failed to create user' })
      }
    }

    // ── Reset PIN (admin only) ───────────────────────────
    if (action === 'reset-pin') {
      const auth = await requireAdmin()
      if (auth.error) return res.status(auth.status).json({ error: auth.error })

      if (!id) return res.status(400).json({ error: 'User id is required' })

      try {
        const pin = generatePin()
        const pinHash = await bcrypt.hash(pin, 10)
        await sql`UPDATE users SET pin_hash = ${pinHash} WHERE id = ${parseInt(id)}`

        // Invalidate all sessions for this user so they must re-login
        await sql`DELETE FROM sessions WHERE user_id = ${parseInt(id)}`

        return res.status(200).json({ pin })
      } catch (err) {
        console.error('Reset PIN error:', err)
        return res.status(500).json({ error: 'Failed to reset PIN' })
      }
    }

    // ── Change own PIN (any authenticated user) ──────────
    if (action === 'change-pin') {
      const user = await getSessionUser()
      if (!user) return res.status(401).json({ error: 'Not authenticated' })

      try {
        const { current_pin, new_pin } = req.body || {}
        if (!current_pin || !new_pin) {
          return res.status(400).json({ error: 'Current PIN and new PIN are required' })
        }
        if (!/^\d{6}$/.test(new_pin)) {
          return res.status(400).json({ error: 'New PIN must be exactly 6 digits' })
        }

        // Verify current PIN
        const rows = await sql`SELECT pin_hash FROM users WHERE id = ${user.id}`
        const valid = await bcrypt.compare(String(current_pin), rows[0].pin_hash)
        if (!valid) {
          return res.status(401).json({ error: 'Current PIN is incorrect' })
        }

        const pinHash = await bcrypt.hash(String(new_pin), 10)
        await sql`UPDATE users SET pin_hash = ${pinHash} WHERE id = ${user.id}`

        return res.status(200).json({ success: true })
      } catch (err) {
        console.error('Change PIN error:', err)
        return res.status(500).json({ error: 'Failed to change PIN' })
      }
    }
  }

  // ─── GET ───────────────────────────────────────────────
  if (req.method === 'GET') {

    // ── Validate session ─────────────────────────────────
    if (action === 'validate') {
      const user = await getSessionUser()
      if (!user) return res.status(401).json({ valid: false })
      return res.status(200).json({ valid: true, user: { id: user.id, name: user.name, email: user.email, color: user.color, role: user.role, digest_enabled: user.digest_enabled, digest_preferences: user.digest_preferences } })
    }

    // ── Get current user ─────────────────────────────────
    if (action === 'me') {
      const user = await getSessionUser()
      if (!user) return res.status(401).json({ error: 'Not authenticated' })
      return res.status(200).json({ id: user.id, name: user.name, email: user.email, color: user.color, role: user.role, digest_enabled: user.digest_enabled, digest_preferences: user.digest_preferences })
    }

    // ── List users (admin only) ──────────────────────────
    if (action === 'list-users') {
      const auth = await requireAdmin()
      if (auth.error) return res.status(auth.status).json({ error: auth.error })

      try {
        const users = await sql`
          SELECT id, name, email, color, role, is_active, created_at, last_login_at, digest_enabled, digest_preferences
          FROM users ORDER BY created_at ASC
        `
        return res.status(200).json(users)
      } catch (err) {
        console.error('List users error:', err)
        return res.status(500).json({ error: 'Failed to list users' })
      }
    }

    // ── Team members (any authenticated user) ────────────
    // Lightweight read so the Tasks assignee dropdown can list teammates without
    // requiring admin role. Returns only display fields (no email, no role, no PIN).
    if (action === 'team-members') {
      const user = await getSessionUser()
      if (!user) return res.status(401).json({ error: 'Not authenticated' })

      try {
        const members = await sql`
          SELECT name, color FROM users WHERE is_active = true ORDER BY name ASC
        `
        return res.status(200).json(members)
      } catch (err) {
        console.error('Team members error:', err)
        return res.status(500).json({ error: 'Failed to list team members' })
      }
    }
  }

  // ─── PATCH ─────────────────────────────────────────────
  if (req.method === 'PATCH') {

    // ── Update user (admin only) ─────────────────────────
    if (action === 'update-user') {
      const auth = await requireAdmin()
      if (auth.error) return res.status(auth.status).json({ error: auth.error })

      if (!id) return res.status(400).json({ error: 'User id is required' })

      try {
        const { name, email, color, role, is_active } = req.body || {}
        const updates = []
        const values = {}

        if (name !== undefined) { updates.push('name'); values.name = name.trim() }
        if (email !== undefined) { updates.push('email'); values.email = email.toLowerCase().trim() }
        if (color !== undefined) { updates.push('color'); values.color = color }
        if (role !== undefined) { updates.push('role'); values.role = role === 'admin' ? 'admin' : 'member' }
        if (is_active !== undefined) { updates.push('is_active'); values.is_active = Boolean(is_active) }

        if (updates.length === 0) {
          return res.status(400).json({ error: 'No fields to update' })
        }

        // Build dynamic update — neon tagged templates don't support dynamic column names,
        // so we handle each field explicitly
        const userId = parseInt(id)

        // Guard: never demote or deactivate the last active admin — that would
        // leave the app with no admin and no in-app recovery path.
        const demoting = values.role !== undefined && values.role !== 'admin'
        const deactivating = values.is_active === false
        if (demoting || deactivating) {
          const [target] = await sql`SELECT role, is_active FROM users WHERE id = ${userId}`
          if (target?.role === 'admin' && target.is_active) {
            const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active = true`
            if (count <= 1) {
              return res.status(400).json({ error: 'Cannot demote or deactivate the only active admin' })
            }
          }
        }

        if (values.name !== undefined) await sql`UPDATE users SET name = ${values.name} WHERE id = ${userId}`
        if (values.email !== undefined) await sql`UPDATE users SET email = ${values.email} WHERE id = ${userId}`
        if (values.color !== undefined) await sql`UPDATE users SET color = ${values.color} WHERE id = ${userId}`
        if (values.role !== undefined) await sql`UPDATE users SET role = ${values.role} WHERE id = ${userId}`
        if (values.is_active !== undefined) {
          await sql`UPDATE users SET is_active = ${values.is_active} WHERE id = ${userId}`
          // If deactivating, kill their sessions
          if (!values.is_active) {
            await sql`DELETE FROM sessions WHERE user_id = ${userId}`
          }
        }

        const updated = await sql`
          SELECT id, name, email, color, role, is_active, created_at, last_login_at
          FROM users WHERE id = ${userId}
        `
        return res.status(200).json(updated[0])
      } catch (err) {
        console.error('Update user error:', err)
        return res.status(500).json({ error: 'Failed to update user' })
      }
    }

    // ── Update own notification preferences ──────────────
    if (action === 'update-preferences') {
      const user = await getSessionUser()
      if (!user) return res.status(401).json({ error: 'Not authenticated' })

      try {
        const { digest_enabled, digest_preferences } = req.body || {}

        if (digest_enabled !== undefined) {
          await sql`UPDATE users SET digest_enabled = ${Boolean(digest_enabled)} WHERE id = ${user.id}`
        }
        if (digest_preferences !== undefined) {
          await sql`UPDATE users SET digest_preferences = ${JSON.stringify(digest_preferences)}::jsonb WHERE id = ${user.id}`
        }

        const updated = await sql`
          SELECT id, name, email, color, role, digest_enabled, digest_preferences
          FROM users WHERE id = ${user.id}
        `
        return res.status(200).json(updated[0])
      } catch (err) {
        console.error('Update preferences error:', err)
        return res.status(500).json({ error: 'Failed to update preferences' })
      }
    }
  }

  return res.status(405).json({ error: 'Method not allowed or unknown action' })
}
