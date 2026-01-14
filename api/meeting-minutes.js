import { neon } from '@neondatabase/serverless'

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Authenticate via API key
  const apiKey = req.headers['x-api-key']
  if (!apiKey || apiKey !== process.env.MEETING_MINUTES_API_KEY) {
    console.log('Unauthorized request - invalid or missing API key')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Parse and validate request body
  const {
    title,
    meetingDate,
    fullContent,
    summary,
    nextSteps,
    participants,
    sourceSubject
  } = req.body

  // Validate required fields
  const missingFields = []
  if (!title?.trim()) missingFields.push('title')
  if (!meetingDate?.trim()) missingFields.push('meetingDate')
  if (!fullContent?.trim()) missingFields.push('fullContent')

  if (missingFields.length > 0) {
    console.log('Missing required fields:', missingFields)
    return res.status(400).json({
      error: 'Missing required fields',
      details: missingFields
    })
  }

  // Insert into database
  const sql = neon(process.env.DATABASE_URL)

  try {
    console.log('Inserting meeting minutes:', { title, meetingDate })

    const result = await sql`
      INSERT INTO meeting_minutes (
        meeting_date,
        title,
        summary,
        next_steps,
        full_content,
        participants,
        source_email_subject
      ) VALUES (
        ${meetingDate},
        ${title.trim()},
        ${summary || null},
        ${nextSteps || null},
        ${fullContent.trim()},
        ${participants || null},
        ${sourceSubject || null}
      )
      RETURNING id
    `

    console.log('Meeting minutes saved successfully, id:', result[0].id)

    return res.status(201).json({
      id: result[0].id,
      message: 'Minutes saved successfully'
    })
  } catch (error) {
    console.error('Database error saving meeting minutes:', error)
    return res.status(500).json({
      error: 'Database error',
      details: error.message
    })
  }
}
