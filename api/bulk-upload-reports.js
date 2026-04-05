import { neon } from '@neondatabase/serverless'

// Temporary one-shot endpoint to bulk-upload Tier3 state research reports.
// Fetches markdown files from GitHub, inserts into state_research_reports.
// DELETE THIS FILE after successful upload.

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/khc-5010/PSB-Aquila-Dashboard/claude/upload-state-reports-evS74/docs/state-reports/Tier3'

const STATE_NAME_TO_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT',
  'DC': 'DC', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN',
  'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA',
  'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI',
  'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT',
  'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
  'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
}

const STATE_ABBR_TO_NAME = {}
for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
  if (name.length > 2) STATE_ABBR_TO_NAME[abbr] = name
}
STATE_ABBR_TO_NAME['DC'] = 'District of Columbia'

const TIER3_FILES = [
  'Alabama_Tier3_Prospect_Report_2026-04-02.md',
  'Alaska_Tier3_Prospect_Report_2026-04-03.md',
  'Arizona_Tier3_Prospect_Report_2026-04-02.md',
  'Arkansas_Tier3_Prospect_Report_2026-04-02.md',
  'California_Tier3_Prospect_Report_2026-03-30.md',
  'Colorado_Tier3_Prospect_Report_2026-04-02.md',
  'Connecticut_Tier3_Prospect_Report_2026-04-02.md',
  'DC_Tier3_Prospect_Report_2026-04-03.md',
  'Delaware_Tier3_Prospect_Report_2026-04-03.md',
  'Florida_Tier3_Prospect_Report_2026-03-31.md',
  'Georgia_Tier3_Prospect_Report_2026-04-01.md',
  'Hawaii_Tier3_Prospect_Report_2026-04-03.md',
  'Idaho_Tier3_Prospect_Report_2026-04-03.md',
  'Iowa_Tier3_Prospect_Report_2026-04-02.md',
  'Kansas_Tier3_Prospect_Report_2026-04-03.md',
  'Kentucky_Tier3_Prospect_Report_2026-04-02.md',
  'Louisiana_Tier3_Prospect_Report_2026-04-02.md',
  'Maine_Tier3_Prospect_Report_2026-04-03.md',
  'Maryland_Tier3_Prospect_Report_2026-04-02.md',
  'Massachusetts_Tier3_Prospect_Report_2026-04-01.md',
  'Minnesota_Tier3_Prospect_Report_2026-04-01.md',
  'Mississippi_Tier3_Prospect_Report_2026-04-03.md',
  'Missouri_Tier3_Prospect_Report_2026-04-02.md',
  'Montana_Tier3_Prospect_Report_2026-04-03.md',
  'Nebraska_Tier3_Prospect_Report_2026-04-03.md',
  'Nevada_Tier3_Prospect_Report_2026-04-03.md',
  'New_Hampshire_Tier3_Prospect_Report_2026-04-03.md',
  'New_Jersey_Tier3_Prospect_Report_2026-04-01.md',
  'New_Mexico_Tier3_Prospect_Report_2026-04-03.md',
  'North_Carolina_Tier3_Prospect_Report_2026-04-01.md',
  'North_Dakota_Tier3_Prospect_Report_2026-04-03.md',
  'Oklahoma_Tier3_Prospect_Report_2026-04-03.md',
  'Oregon_Tier3_Prospect_Report_2026-04-03.md',
  'Rhode_Island_Tier3_Prospect_Report_2026-04-03.md',
  'South_Carolina_Tier3_Prospect_Report_2026-04-02.md',
  'South_Dakota_Tier3_Prospect_Report_2026-04-03.md',
  'Tennessee_Tier3_Prospect_Report_2026-04-01.md',
  'Texas_Tier3_Prospect_Report_2026-03-30.md',
  'Utah_Tier3_Prospect_Report_2026-04-02.md',
  'Vermont_Tier3_Prospect_Report_2026-04-03.md',
  'Virginia_Tier3_Prospect_Report_2026-04-02.md',
  'Washington_Tier3_Prospect_Report_2026-04-02.md',
  'West_Virginia_Tier3_Prospect_Report_2026-04-03.md',
  'Wyoming_Tier3_Prospect_Report_2026-04-03.md',
]

function extractStateFromFilename(filename) {
  const match = filename.match(/^(.+?)_Tier3_Prospect_Report_/)
  if (!match) return null
  const rawName = match[1].replace(/_/g, ' ')
  const abbr = STATE_NAME_TO_ABBR[rawName]
  if (!abbr) return null
  return { stateCode: abbr, stateName: STATE_ABBR_TO_NAME[abbr] || rawName }
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

function extractResearchDate(content, filename) {
  const header = content.split('\n').slice(0, 15).join('\n')
  const datePatterns = [
    /##\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i,
    /Date:\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i,
  ]
  for (const pat of datePatterns) {
    const m = header.match(pat)
    if (m) {
      const d = new Date(m[1])
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  const fnMatch = filename.match(/(\d{4}-\d{2}-\d{2})\.md$/)
  if (fnMatch) return new Date(fnMatch[1] + 'T12:00:00Z').toISOString()
  return '2026-03-30T12:00:00Z'
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default async function handler(req, res) {
  // Only allow POST to prevent accidental triggers
  if (req.method !== 'POST') {
    return res.status(200).send(`
      <html><body style="font-family:monospace;max-width:800px;margin:40px auto;padding:20px">
        <h2>Bulk Upload State Reports</h2>
        <p>This will upload ${TIER3_FILES.length} Tier3 state reports to the database.</p>
        <p>Each upload archives any existing report for that state (sets is_current=false).</p>
        <button onclick="runUpload()" style="padding:12px 24px;font-size:16px;cursor:pointer;background:#041E42;color:white;border:none;border-radius:6px">
          Run Upload
        </button>
        <pre id="log" style="background:#111;color:#0f0;padding:16px;margin-top:16px;height:500px;overflow-y:auto;white-space:pre-wrap"></pre>
        <script>
          async function runUpload() {
            const log = document.getElementById('log');
            log.textContent = 'Starting upload...\\n';
            try {
              const res = await fetch('/api/bulk-upload-reports', { method: 'POST' });
              const data = await res.json();
              log.textContent = JSON.stringify(data, null, 2);
            } catch(e) {
              log.textContent += 'Error: ' + e.message;
            }
          }
        </script>
      </body></html>
    `)
  }

  const sql = neon(process.env.DATABASE_URL)
  const results = []
  let uploaded = 0
  let failed = 0
  let skipped = 0

  for (const file of TIER3_FILES) {
    const stateInfo = extractStateFromFilename(file)
    if (!stateInfo) {
      results.push({ file, status: 'skipped', reason: 'no state mapping' })
      skipped++
      continue
    }

    try {
      // Fetch markdown from GitHub
      const url = `${GITHUB_RAW_BASE}/${encodeURIComponent(file)}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`)
      }
      const content = await response.text()

      const title = extractTitle(content) || `Alliance Prospect Report — ${stateInfo.stateName}`
      const researchedAt = extractResearchDate(content, file)

      // Get prospect count for this state
      const countResult = await sql`
        SELECT COUNT(*)::int AS count FROM prospect_companies
        WHERE UPPER(state) = ${stateInfo.stateCode}
      `
      const prospectCount = countResult[0]?.count || 0

      // Archive existing current report
      await sql`
        UPDATE state_research_reports
        SET is_current = false
        WHERE state_code = ${stateInfo.stateCode} AND is_current = true
      `

      // Insert new report
      const result = await sql`
        INSERT INTO state_research_reports (
          state_code, state_name, title, content,
          researched_at, researched_by, uploaded_by,
          prospect_count_at_time, is_current
        ) VALUES (
          ${stateInfo.stateCode},
          ${stateInfo.stateName},
          ${title},
          ${content},
          ${researchedAt},
          ${'Kyle (Claude Research)'},
          ${'Kyle (bulk upload)'},
          ${prospectCount},
          true
        )
        RETURNING id, state_code, title
      `

      results.push({
        file,
        state: stateInfo.stateCode,
        status: 'uploaded',
        id: result[0]?.id,
        title: title.substring(0, 80),
        researched_at: researchedAt.substring(0, 10),
        prospect_count: prospectCount,
      })
      uploaded++
    } catch (err) {
      results.push({ file, state: stateInfo.stateCode, status: 'failed', error: err.message })
      failed++
    }

    // Small delay between DB operations
    await sleep(200)
  }

  // Get final count of current reports
  let totalReports = 0
  try {
    const countRes = await sql`SELECT COUNT(*)::int AS count FROM state_research_reports WHERE is_current = true`
    totalReports = countRes[0]?.count || 0
  } catch (e) { /* ignore */ }

  return res.status(200).json({
    summary: { uploaded, failed, skipped, total_current_reports: totalReports },
    details: results,
  })
}
