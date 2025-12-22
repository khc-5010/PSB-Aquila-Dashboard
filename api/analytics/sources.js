import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    const result = await sql`
      SELECT source, COUNT(*) as count
      FROM opportunities
      WHERE source IS NOT NULL
      GROUP BY source
      ORDER BY count DESC
    `

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error fetching lead sources:', error)
    return res.status(500).json({ error: error.message })
  }
}
