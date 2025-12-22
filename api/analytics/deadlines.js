import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    const result = await sql`
      SELECT * FROM deadlines
      WHERE deadline_date > NOW() - INTERVAL '60 days'
      ORDER BY deadline_date
    `

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error fetching deadlines:', error)
    return res.status(500).json({ error: error.message })
  }
}
