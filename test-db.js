import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function testConnection() {
  console.log('Connecting to Neon database...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Test basic connection
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('Connection successful!');
    console.log('Server time:', result.rows[0].current_time, '\n');

    // Fetch all opportunities
    console.log('Fetching opportunities...\n');
    const opportunities = await pool.query('SELECT * FROM opportunities');

    if (opportunities.rows.length === 0) {
      console.log('No opportunities found in database.');
    } else {
      console.log(`Found ${opportunities.rows.length} opportunities:\n`);
      opportunities.rows.forEach((opp, index) => {
        console.log(`${index + 1}. ${opp.company_name || opp.company || opp.name || 'Unknown'}`);
        console.log(`   Stage: ${opp.stage || 'N/A'}`);
        console.log(`   Type: ${opp.project_type || opp.type || 'N/A'}`);
        console.log('');
      });
    }

    // Show table structure
    console.log('Table columns:');
    if (opportunities.rows.length > 0) {
      console.log(Object.keys(opportunities.rows[0]).join(', '));
    }

    await pool.end();
  } catch (error) {
    console.error('Database error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

testConnection();
