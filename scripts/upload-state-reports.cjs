#!/usr/bin/env node
/**
 * Bulk upload Tier3 state research reports to the dashboard API.
 *
 * Usage: node scripts/upload-state-reports.js
 *
 * Reads .md files from docs/state-reports/Tier3/, maps each to a state code,
 * and POSTs to the save-state-report API endpoint.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://psb-aquila-dashboard.vercel.app/api/prospects';
const TIER3_DIR = path.join(__dirname, '..', 'docs', 'state-reports', 'Tier3');
const DELAY_MS = 500;

// Reverse lookup: state name -> abbreviation
const STATE_NAME_TO_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT',
  'DC': 'DC', 'District of Columbia': 'DC',
  'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI',
  'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME',
  'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
  'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE',
  'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
  'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
};

const STATE_ABBR_TO_NAME = {};
for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
  if (name !== 'DC' && name.length > 2) {
    STATE_ABBR_TO_NAME[abbr] = name;
  }
}
STATE_ABBR_TO_NAME['DC'] = 'District of Columbia';

function extractStateFromFilename(filename) {
  // Pattern: StateName_Tier3_Prospect_Report_YYYY-MM-DD.md
  const match = filename.match(/^(.+?)_Tier3_Prospect_Report_/);
  if (!match) return null;
  const rawName = match[1].replace(/_/g, ' ');
  const abbr = STATE_NAME_TO_ABBR[rawName];
  if (!abbr) return null;
  return { stateCode: abbr, stateName: STATE_ABBR_TO_NAME[abbr] || rawName };
}

function extractTitle(content) {
  // Look for first # header line
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractResearchDate(content, filename) {
  // Try "Date: Month DD, YYYY" or "## Month DD, YYYY" in first 10 lines
  const header = content.split('\n').slice(0, 15).join('\n');

  // Pattern: "## March 30, 2026" or "# Date: April 3, 2026"
  const datePatterns = [
    /##\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i,
    /Date:\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i,
  ];

  for (const pat of datePatterns) {
    const m = header.match(pat);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  // Try date from filename: _YYYY-MM-DD.md
  const fnMatch = filename.match(/(\d{4}-\d{2}-\d{2})\.md$/);
  if (fnMatch) {
    return new Date(fnMatch[1] + 'T12:00:00Z').toISOString();
  }

  return '2026-03-30T12:00:00Z';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const files = fs.readdirSync(TIER3_DIR).filter(f => f.endsWith('.md')).sort();
  console.log(`Found ${files.length} Tier3 markdown files\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];
  const skippedFiles = [];

  for (const file of files) {
    const stateInfo = extractStateFromFilename(file);
    if (!stateInfo) {
      console.log(`⚠ SKIP: ${file} — could not map to state code`);
      skippedFiles.push(file);
      skipped++;
      continue;
    }

    const content = fs.readFileSync(path.join(TIER3_DIR, file), 'utf8');
    const title = extractTitle(content) || `Alliance Prospect Report — ${stateInfo.stateName}`;
    const researchedAt = extractResearchDate(content, file);

    const body = {
      state_code: stateInfo.stateCode,
      state_name: stateInfo.stateName,
      title,
      content,
      researched_at: researchedAt,
      researched_by: 'Kyle (Claude Research)',
      uploaded_by: 'Kyle (bulk upload)',
    };

    try {
      const res = await fetch(`${API_BASE}?action=save-state-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }

      const result = await res.json();
      console.log(`✓ ${stateInfo.stateCode} (${stateInfo.stateName}) — "${title.substring(0, 60)}..." — researched ${researchedAt.substring(0, 10)}`);
      uploaded++;
    } catch (err) {
      console.log(`✗ ${stateInfo.stateCode} (${stateInfo.stateName}) — ${err.message}`);
      errors.push({ file, state: stateInfo.stateCode, error: err.message });
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Failed:   ${failed}`);

  if (skippedFiles.length) {
    console.log(`\nSkipped files:`);
    skippedFiles.forEach(f => console.log(`  - ${f}`));
  }
  if (errors.length) {
    console.log(`\nFailed uploads:`);
    errors.forEach(e => console.log(`  - ${e.state}: ${e.error}`));
  }

  // Verify by fetching state-reports list
  console.log(`\n=== VERIFICATION ===`);
  try {
    const res = await fetch(`${API_BASE}?action=state-reports`);
    const reports = await res.json();
    console.log(`Total current reports in database: ${Array.isArray(reports) ? reports.length : 'unknown'}`);
    if (Array.isArray(reports)) {
      const states = reports.map(r => r.state_code).sort();
      console.log(`States with reports: ${states.join(', ')}`);
    }
  } catch (err) {
    console.log(`Could not verify: ${err.message}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
