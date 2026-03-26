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
 * POST /api/auth?action=reset-pin&id=X   — admin: generate new PIN
 * GET  /api/auth?action=list-users   — admin: get all users
 * POST /api/auth?action=setup        — one-time: create tables + admin user
 */
export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)
  const { action, id } = req.query

  // ─── Helper: extract session user ──────────────────────
  async function getSessionUser() {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.slice(7)
    const rows = await sql`
      SELECT u.id, u.name, u.email, u.color, u.role, u.is_active
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

  // ─── Helper: generate 6-digit PIN ─────────────────────
  function generatePin() {
    return String(Math.floor(100000 + Math.random() * 900000))
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

        const users = await sql`
          SELECT id, name, email, pin_hash, color, role, is_active
          FROM users WHERE email = ${email.toLowerCase().trim()}
        `
        if (users.length === 0) {
          return res.status(401).json({ error: 'Invalid email or PIN' })
        }

        const user = users[0]
        if (!user.is_active) {
          return res.status(401).json({ error: 'Account is deactivated. Contact your admin.' })
        }

        const pinValid = await bcrypt.compare(String(pin), user.pin_hash)
        if (!pinValid) {
          return res.status(401).json({ error: 'Invalid email or PIN' })
        }

        // Create session
        const sessionId = crypto.randomUUID()
        await sql`INSERT INTO sessions (id, user_id) VALUES (${sessionId}, ${user.id})`
        await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`

        return res.status(200).json({
          token: sessionId,
          user: { id: user.id, name: user.name, email: user.email, color: user.color, role: user.role },
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
      return res.status(200).json({ valid: true, user: { id: user.id, name: user.name, email: user.email, color: user.color, role: user.role } })
    }

    // ── Get current user ─────────────────────────────────
    if (action === 'me') {
      const user = await getSessionUser()
      if (!user) return res.status(401).json({ error: 'Not authenticated' })
      return res.status(200).json({ id: user.id, name: user.name, email: user.email, color: user.color, role: user.role })
    }

    // ── List users (admin only) ──────────────────────────
    if (action === 'list-users') {
      const auth = await requireAdmin()
      if (auth.error) return res.status(auth.status).json({ error: auth.error })

      try {
        const users = await sql`
          SELECT id, name, email, color, role, is_active, created_at, last_login_at
          FROM users ORDER BY created_at ASC
        `
        return res.status(200).json(users)
      } catch (err) {
        console.error('List users error:', err)
        return res.status(500).json({ error: 'Failed to list users' })
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
  }

  // ─── One-time setup (POST ?action=setup) ────────────
  if (req.method === 'POST' && action === 'setup') {
    try {
      // Create tables
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          pin_hash TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#6B7280',
          role TEXT NOT NULL DEFAULT 'member',
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          last_login_at TIMESTAMPTZ
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`

      // Check if admin already exists
      const existing = await sql`SELECT id, name, email FROM users WHERE role = 'admin' LIMIT 1`
      if (existing.length > 0) {
        return res.status(200).json({
          message: 'Tables exist. Admin already created.',
          admin: { name: existing[0].name, email: existing[0].email },
        })
      }

      // Create Kyle as initial admin
      const pin = String(Math.floor(100000 + Math.random() * 900000))
      const pinHash = await bcrypt.hash(pin, 10)
      await sql`
        INSERT INTO users (name, email, pin_hash, color, role)
        VALUES ('Kyle', 'kyle@aquila-ai.com', ${pinHash}, '#7C3AED', 'admin')
      `

      return res.status(201).json({
        message: 'Auth tables created and admin account ready.',
        admin: { name: 'Kyle', email: 'kyle@aquila-ai.com' },
        pin,
        warning: 'Save this PIN now — it cannot be retrieved again. Change the email in the admin panel after login.',
      })
    } catch (err) {
      console.error('Setup error:', err)
      return res.status(500).json({ error: 'Setup failed: ' + err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed or unknown action' })
}
