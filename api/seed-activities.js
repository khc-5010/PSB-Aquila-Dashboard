import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  // Only allow POST to prevent accidental calls
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST to seed.' })
    return
  }

  try {
    const sql = neon(process.env.DATABASE_URL)

    // Ensure activities table exists
    await sql`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        activity_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        description TEXT NOT NULL,
        created_by VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    console.log('Activities table ensured')

    // First, find the Amcor/Berry opportunity
    const opportunities = await sql`
      SELECT id, company_name FROM opportunities
      WHERE company_name ILIKE '%Amcor%' OR company_name ILIKE '%Berry%'
      LIMIT 1
    `

    if (opportunities.length === 0) {
      res.status(404).json({ error: 'Amcor/Berry opportunity not found' })
      return
    }

    const opportunityId = opportunities[0].id
    console.log('Found opportunity:', opportunities[0].company_name, 'with ID:', opportunityId)

    // Check if activities already exist for this opportunity
    const existingActivities = await sql`
      SELECT COUNT(*) as count FROM activities WHERE opportunity_id = ${opportunityId}
    `

    if (parseInt(existingActivities[0].count) > 0) {
      res.status(200).json({
        message: 'Activities already exist for this opportunity',
        count: existingActivities[0].count,
        opportunity: opportunities[0].company_name
      })
      return
    }

    // Insert sample activities
    const activities = await sql`
      INSERT INTO activities (opportunity_id, activity_date, description, created_by)
      VALUES
        (${opportunityId}, '2024-11-19', 'Poulin working session scheduled', 'kyle'),
        (${opportunityId}, '2024-11-12', 'Aligned on research integration approach', 'duane'),
        (${opportunityId}, '2024-10-28', 'Presented to Ralph Ford – positive reception', 'kyle'),
        (${opportunityId}, '2024-08-15', 'Initial strategy discussion (Kyle + Duane)', 'kyle')
      RETURNING id, activity_date, description, created_by
    `

    console.log('Inserted activities:', activities.length)

    res.status(201).json({
      message: 'Sample activities seeded successfully',
      opportunity: opportunities[0].company_name,
      activities: activities
    })
  } catch (error) {
    console.error('Error seeding activities:', error)
    res.status(500).json({ error: error.message })
  }
}
