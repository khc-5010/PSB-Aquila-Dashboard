import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL)
    await sql`SELECT 1`
    res.status(200).json({ status: 'ok', database: true })
  } catch (error) {
    // Don't leak raw DB error text to anonymous callers
    console.error('Health check DB error:', error)
    res.status(200).json({ status: 'ok', database: false })
  }
}
