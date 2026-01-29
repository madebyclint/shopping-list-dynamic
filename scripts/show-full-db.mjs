import pg from 'pg';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env.local', 'utf8');
const postgresUrl = envFile.split('\n')
  .find(line => line.startsWith('POSTGRES_URL='))
  ?.split('=')[1];

const pool = new pg.Pool({ 
  connectionString: postgresUrl,
  ssl: { rejectUnauthorized: false }
});

async function showFullDatabase() {
  try {
    // Show all tables
    console.log('🏗️ Database Tables:');
    const tables = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    tables.rows.forEach(row => console.log(`  📋 ${row.tablename}`));
    
    // Show the latest shopping list in detail
    console.log('\n🎯 Latest Shopping List (ID: 9):');
    const list = await pool.query('SELECT * FROM grocery_lists WHERE id = 9');
    if (list.rows.length > 0) {
      const listData = list.rows[0];
      console.log(`  📝 Name: ${listData.name}`);
      console.log(`  📅 Created: ${listData.created_at}`);
      console.log(`  🗒️ Raw Text Preview: ${listData.raw_text.substring(0, 100)}...`);
      console.log(`  🔗 Meal Plan ID: ${listData.meal_plan_id}`);
    }
    
    // Show all items from list 9
    console.log('\n🛒 All Items in List 9:');
    const items = await pool.query('SELECT * FROM grocery_items WHERE list_id = 9 ORDER BY category, name');
    items.rows.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} (${item.qty}) - ${item.category} - $${item.price}`);
    });
    
    console.log(`\n📊 Total items in list 9: ${items.rows.length}`);
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

showFullDatabase();