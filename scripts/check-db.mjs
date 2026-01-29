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

async function checkData() {
  try {
    console.log('🔍 Checking grocery_lists table...');
    const lists = await pool.query('SELECT id, name, created_at FROM grocery_lists ORDER BY created_at DESC LIMIT 5');
    console.log('📋 Recent grocery lists:');
    lists.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Name: ${row.name}, Created: ${row.created_at}`);
    });
    
    console.log('\n🔍 Checking grocery_items table...');
    const items = await pool.query('SELECT list_id, name, qty, category FROM grocery_items ORDER BY list_id DESC LIMIT 10');
    console.log('📦 Recent grocery items:');
    items.rows.forEach(row => {
      console.log(`  List ${row.list_id}: ${row.name} (${row.qty}) - ${row.category}`);
    });
    
    const totalLists = await pool.query('SELECT COUNT(*) as count FROM grocery_lists');
    const totalItems = await pool.query('SELECT COUNT(*) as count FROM grocery_items');
    console.log(`\n📊 Totals: ${totalLists.rows[0].count} lists, ${totalItems.rows[0].count} items`);
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkData();