import pg from 'pg';
import { readFileSync } from 'fs';

// Read the POSTGRES_URL from .env.local
const envFile = readFileSync('.env.local', 'utf8');
const postgresUrl = envFile.split('\n')
  .find(line => line.startsWith('POSTGRES_URL='))
  ?.split('=')[1];

if (!postgresUrl) {
  console.error('❌ POSTGRES_URL not found in .env.local');
  process.exit(1);
}

const pool = new pg.Pool({ 
  connectionString: postgresUrl,
  ssl: { rejectUnauthorized: false }
});

async function showTableStructures() {
  try {
    const relevantTables = ['grocery_lists', 'grocery_items', 'receipts', 'shopping_trip_summary', 'meals', 'weekly_meal_plans'];
    
    for (const tableName of relevantTables) {
      console.log(`\n📋 Structure of ${tableName}:`);
      
      const result = await pool.query(`
        SELECT 
          column_name, 
          data_type, 
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = '${tableName}' 
        ORDER BY ordinal_position
      `);
      
      if (result.rows.length === 0) {
        console.log('  Table not found or has no columns');
      } else {
        result.rows.forEach(row => {
          console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
        });
      }
    }
    
  } catch (err) {
    console.error('❌ Database error:', err.message);
  } finally {
    await pool.end();
  }
}

showTableStructures();