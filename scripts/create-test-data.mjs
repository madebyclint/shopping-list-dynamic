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

async function createTestData() {
  try {
    console.log('🔧 Creating test data for post-shopping experience...\n');
    
    // Create a test grocery list
    const listResult = await pool.query(`
      INSERT INTO grocery_lists (name, raw_text, created_at) 
      VALUES ($1, $2, NOW()) 
      RETURNING id, name
    `, [
      'Test Shopping List for Post-Shopping Demo',
      'Weekly grocery shopping with planned meals'
    ]);
    
    const listId = listResult.rows[0].id;
    console.log(`✅ Created test grocery list: ID ${listId}`);
    
    // Add some test items to the list
    const testItems = [
      { name: 'Organic Bananas', qty: '3 lbs', price: '$3.99', category: 'Produce', meal: 'Breakfast Smoothies' },
      { name: 'Almond Milk', qty: '1/2 gallon', price: '$4.49', category: 'Refrigerated', meal: 'Breakfast' },
      { name: 'Ground Turkey', qty: '1 lb', price: '$6.99', category: 'Meat', meal: 'Turkey Tacos' },
      { name: 'Spinach', qty: '1 bag', price: '$3.29', category: 'Produce', meal: 'Turkey Tacos' },
      { name: 'Whole Grain Bread', qty: '1 loaf', price: '$4.99', category: 'Bakery', meal: 'Breakfast' },
    ];
    
    for (const item of testItems) {
      await pool.query(`
        INSERT INTO grocery_items (list_id, name, qty, price, category, meal, is_purchased) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [listId, item.name, item.qty, item.price, item.category, item.meal, true]);
    }
    
    console.log(`✅ Added ${testItems.length} test items to the list`);
    
    // Create a test receipt entry
    const receiptResult = await pool.query(`
      INSERT INTO receipts (
        grocery_list_id, 
        store_name, 
        receipt_date, 
        subtotal, 
        tax, 
        total, 
        image_url,
        processed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      listId,
      'Whole Foods Market',
      '2026-02-01',
      38.73,
      3.49,
      42.22,
      '/uploads/receipt-20260201.jpg',
      true
    ]);
    
    const receiptId = receiptResult.rows[0].id;
    console.log(`✅ Created test receipt: ID ${receiptId}`);
    
    // Create shopping trip summary
    await pool.query(`
      INSERT INTO shopping_trip_summary (
        grocery_list_id,
        receipt_id,
        planned_total,
        actual_total,
        budget_variance,
        budget_variance_percent,
        planned_items_count,
        purchased_items_count,
        store_name,
        shopping_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      listId,
      receiptId,
      23.75, // Planned total from items above
      42.22, // Actual total from receipt
      18.47, // Over budget
      77.7,  // Percentage over
      5,     // Planned items
      5,     // Purchased items (all were bought)
      'Whole Foods Market',
      '2026-02-01'
    ]);
    
    console.log(`✅ Created shopping trip summary`);
    
    console.log('\n🎉 Test data created successfully!');
    console.log('\n📋 You can now test the post-shopping experience:');
    console.log(`   URL: /post-shopping?sessionId=${listId}&userId=1`);
    console.log(`   Grocery List ID: ${listId}`);
    console.log(`   Receipt ID: ${receiptId}`);
    console.log('\n💡 The system will find the existing receipt and allow you to complete the feedback workflow.');
    
  } catch (err) {
    console.error('❌ Error creating test data:', err.message);
  } finally {
    await pool.end();
  }
}

createTestData();