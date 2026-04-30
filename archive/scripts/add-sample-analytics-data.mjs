#!/usr/bin/env node
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

async function addSampleAnalyticsData() {
  const client = await pool.connect();
  
  try {
    console.log('📊 Adding sample analytics data...');

    // Get the latest grocery list
    const listResult = await client.query('SELECT id FROM grocery_lists ORDER BY created_at DESC LIMIT 1');
    if (listResult.rows.length === 0) {
      console.log('No grocery lists found. Please create a grocery list first.');
      return;
    }
    
    const listId = listResult.rows[0].id;
    console.log(`Using grocery list ID: ${listId}`);

    // Add sample purchase analytics
    const samplePurchases = [
      { item_name: 'bananas', quantity: '2 lbs', price: 3.50, food_group_id: 1, store_section_id: 1, was_planned: true, was_extra: false },
      { item_name: 'milk', quantity: '1 gallon', price: 4.20, food_group_id: 4, store_section_id: 3, was_planned: true, was_extra: false },
      { item_name: 'bread', quantity: '1 loaf', price: 2.80, food_group_id: 2, store_section_id: 2, was_planned: true, was_extra: false },
      { item_name: 'chicken breast', quantity: '2 lbs', price: 12.50, food_group_id: 3, store_section_id: 5, was_planned: true, was_extra: false },
      { item_name: 'ice cream', quantity: '1 pint', price: 5.99, food_group_id: 7, store_section_id: 4, was_planned: false, was_extra: true },
      { item_name: 'chips', quantity: '1 bag', price: 3.50, food_group_id: 7, store_section_id: 6, was_planned: false, was_extra: true },
      { item_name: 'olive oil', quantity: '1 bottle', price: 8.99, food_group_id: 5, store_section_id: 6, was_planned: true, was_extra: false },
    ];

    for (const purchase of samplePurchases) {
      await client.query(`
        INSERT INTO purchase_analytics (
          grocery_list_id, item_name, planned_quantity, purchased_quantity,
          unit_price, total_price, food_group_id, store_section_id,
          was_planned, was_extra_purchase, was_substitute, purchase_date, store_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        listId, purchase.item_name, purchase.quantity, purchase.quantity,
        purchase.price, purchase.price, purchase.food_group_id, purchase.store_section_id,
        purchase.was_planned, purchase.was_extra, false, 
        new Date().toISOString().split('T')[0], 'Sample Store'
      ]);
    }

    // Add sample skipped items
    const sampleSkipped = [
      { item_name: 'avocados', category: 'Produce', estimated_price: 4.00, skip_reason: 'too_expensive', frequency: 2 },
      { item_name: 'salmon', category: 'Protein', estimated_price: 15.00, skip_reason: 'out_of_stock', frequency: 1 },
      { item_name: 'quinoa', category: 'Pantry', estimated_price: 6.50, skip_reason: 'not_needed', frequency: 3 },
      { item_name: 'yogurt', category: 'Dairy', estimated_price: 5.00, skip_reason: 'forgot', frequency: 2 },
    ];

    for (const skipped of sampleSkipped) {
      await client.query(`
        INSERT INTO skipped_items_analytics (
          grocery_list_id, item_name, category, estimated_price,
          skip_reason, skip_frequency, planned_date, skipped_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        listId, skipped.item_name, skipped.category, skipped.estimated_price,
        skipped.skip_reason, skipped.frequency,
        new Date().toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]
      ]);
    }

    // Create shopping trip summary
    const plannedTotal = 45.00;
    const actualTotal = 54.48; // includes extra purchases
    const extraItemsCount = 2;
    const skippedItemsCount = 4;

    await client.query(`
      INSERT INTO shopping_trip_summary (
        grocery_list_id, planned_total, actual_total, budget_variance,
        budget_variance_percent, planned_items_count, purchased_items_count,
        extra_items_count, skipped_items_count, store_name, shopping_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      listId, plannedTotal, actualTotal, actualTotal - plannedTotal,
      ((actualTotal - plannedTotal) / plannedTotal) * 100,
      5, 7, extraItemsCount, skippedItemsCount, 'Sample Store',
      new Date().toISOString().split('T')[0]
    ]);

    // Update pantry suggestions
    await client.query(`
      INSERT INTO pantry_suggestions (
        item_name, food_group_id, times_purchased, times_skipped,
        avg_quantity, avg_price, suggestion_score, frequency_pattern,
        suggested_quantity, is_active
      ) VALUES 
      ('bananas', 1, 8, 1, '2 lbs', 3.50, 90, 'weekly', '2 lbs', true),
      ('milk', 4, 6, 0, '1 gallon', 4.20, 95, 'weekly', '1 gallon', true),
      ('bread', 2, 5, 2, '1 loaf', 2.80, 75, 'biweekly', '1 loaf', true),
      ('eggs', 4, 7, 0, '1 dozen', 3.00, 88, 'weekly', '1 dozen', true),
      ('olive oil', 5, 3, 0, '1 bottle', 8.99, 70, 'monthly', '1 bottle', true)
    `);

    console.log('✅ Sample analytics data added successfully!');
    console.log('🎯 Data includes:');
    console.log('   - Purchase analytics for food groups and store sections');
    console.log('   - Extra purchase tracking');
    console.log('   - Skipped items with reasons');
    console.log('   - Budget variance analysis');
    console.log('   - Pantry suggestions based on patterns');

  } catch (error) {
    console.error('❌ Error adding sample data:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the script
addSampleAnalyticsData()
  .then(() => {
    console.log('🎉 Sample analytics data setup completed!');
    console.log('🔗 Visit /analytics to see your reports');
    console.log('🤖 Visit /pantry-suggestions to see smart recommendations');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });