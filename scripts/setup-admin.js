/**
 * Initial admin setup script for PSB-Aquila Dashboard.
 * Creates the users and sessions tables, then inserts Kyle as admin.
 *
 * Usage: node scripts/setup-admin.js
 * Requires DATABASE_URL in .env
 */

import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env manually (no dotenv dependency)
try {
  const envPath = resolve(__dirname, '..', '.env')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  // .env might not exist, DATABASE_URL could be set in environment
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Add it to .env or set it in your environment.')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function main() {
  console.log('Setting up auth tables...\n')

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

  console.log('Tables created.\n')

  // Check if admin already exists
  const existing = await sql`SELECT id, name, email FROM users WHERE role = 'admin' LIMIT 1`
  if (existing.length > 0) {
    console.log(`Admin already exists: ${existing[0].name} (${existing[0].email})`)
    console.log('To reset the admin PIN, use the admin panel or run this script with --reset flag.')

    if (process.argv.includes('--reset')) {
      const pin = generatePin()
      const pinHash = await bcrypt.hash(pin, 10)
      await sql`UPDATE users SET pin_hash = ${pinHash} WHERE id = ${existing[0].id}`
      console.log(`\n=== Admin PIN Reset ===`)
      console.log(`User: ${existing[0].name}`)
      console.log(`New PIN: ${pin}`)
      console.log(`========================`)
      console.log(`\nGive this PIN to ${existing[0].name}. It cannot be retrieved again.`)
    }
    process.exit(0)
  }

  // Create Kyle as admin
  const name = 'Kyle'
  const email = 'kyle@aquila-ai.com'
  const color = '#7C3AED'
  const pin = generatePin()
  const pinHash = await bcrypt.hash(pin, 10)

  await sql`
    INSERT INTO users (name, email, pin_hash, color, role)
    VALUES (${name}, ${email}, ${pinHash}, ${color}, 'admin')
  `

  console.log(`=== Admin Account Created ===`)
  console.log(`Name:  ${name}`)
  console.log(`Email: ${email}`)
  console.log(`PIN:   ${pin}`)
  console.log(`Role:  admin`)
  console.log(`=============================`)
  console.log(`\nIMPORTANT: Give this PIN to Kyle. It cannot be retrieved again.`)
  console.log(`Kyle can change his email in the admin panel after logging in.`)
}

main().catch(err => {
  console.error('Setup failed:', err.message)
  process.exit(1)
})
