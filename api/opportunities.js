import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const sql = neon(process.env.DATABASE_URL)

    const opportunities = await sql`
      SELECT * FROM opportunities
      ORDER BY updated_at DESC
    `

    console.log('Fetched opportunities:', opportunities.length, 'records')
    console.log('Opportunities data:', JSON.stringify(opportunities, null, 2))

    res.status(200).json(opportunities)
  } catch (error) {
    console.error('Error fetching opportunities:', error)
    res.status(500).json({ error: error.message })
  }
}
