import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL)
    await sql`SELECT 1`
    res.status(200).json({ status: 'ok', database: true })
  } catch {
    // Do not echo raw DB errors to unauthenticated callers
    res.status(200).json({ status: 'ok', database: false })
  }
}
