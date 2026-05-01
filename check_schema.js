const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
});

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'reading_sessions'
      ORDER BY ordinal_position
    `);
    console.log('reading_sessions columns:');
    result.rows.forEach(r => console.log(`  - ${r.column_name}`));
    
    const result2 = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'comprehension_reports'
      ORDER BY ordinal_position
    `);
    console.log('\ncomprehension_reports columns:');
    result2.rows.forEach(r => console.log(`  - ${r.column_name}`));

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
