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

async function createAnalyticsTables() {
  const client = await pool.connect();
  
  try {
    console.log('🏗️ Creating analytics tables...');

    // 1. Food Groups table - standardized food categorization
    await client.query(`
      CREATE TABLE IF NOT EXISTS food_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        color VARCHAR(7), -- hex color for charts
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert standard food groups
    await client.query(`
      INSERT INTO food_groups (name, description, color) VALUES
      ('Fruits & Vegetables', 'Fresh and frozen produce', '#4CAF50'),
      ('Grains & Starches', 'Bread, pasta, rice, cereals', '#FF9800'),
      ('Proteins', 'Meat, fish, beans, nuts, dairy proteins', '#F44336'),
      ('Dairy & Eggs', 'Milk, cheese, yogurt, eggs', '#2196F3'),
      ('Fats & Oils', 'Cooking oils, butter, nuts, avocados', '#9C27B0'),
      ('Beverages', 'Water, juice, soda, coffee, tea', '#00BCD4'),
      ('Snacks & Treats', 'Chips, candy, desserts', '#795548'),
      ('Condiments & Spices', 'Sauces, seasonings, herbs', '#607D8B'),
      ('Other', 'Items not fitting other categories', '#9E9E9E')
      ON CONFLICT (name) DO NOTHING
    `);

    // 2. Store Sections table - physical store layout categories
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_sections (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert standard store sections
    await client.query(`
      INSERT INTO store_sections (name, description, sort_order) VALUES
      ('Produce', 'Fresh fruits and vegetables', 1),
      ('Bakery/Deli', 'Fresh bread, deli meats, prepared foods', 2),
      ('Dairy/Refrigerated', 'Milk, cheese, yogurt, eggs', 3),
      ('Frozen Foods', 'Frozen meals, vegetables, ice cream', 4),
      ('Meat & Seafood', 'Fresh and packaged proteins', 5),
      ('Aisles', 'Pantry items, canned goods, dry goods', 6),
      ('Health & Beauty', 'Personal care, medications', 7),
      ('Household', 'Cleaning supplies, paper products', 8),
      ('Other', 'Miscellaneous items', 9)
      ON CONFLICT (name) DO NOTHING
    `);

    // 3. Receipts table - store receipt data
    await client.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        grocery_list_id INTEGER REFERENCES grocery_lists(id),
        store_name VARCHAR(100),
        store_address TEXT,
        receipt_date DATE,
        receipt_time TIME,
        subtotal DECIMAL(10,2),
        tax DECIMAL(10,2),
        total DECIMAL(10,2),
        payment_method VARCHAR(50),
        image_url TEXT,
        raw_text TEXT, -- OCR extracted text
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Purchase Analytics table - detailed purchase tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_analytics (
        id SERIAL PRIMARY KEY,
        grocery_list_id INTEGER REFERENCES grocery_lists(id),
        receipt_id INTEGER REFERENCES receipts(id),
        grocery_item_id INTEGER REFERENCES grocery_items(id),
        
        -- Item details
        item_name VARCHAR(200) NOT NULL,
        planned_quantity VARCHAR(50),
        purchased_quantity VARCHAR(50),
        unit_price DECIMAL(10,2),
        total_price DECIMAL(10,2),
        
        -- Categorization
        food_group_id INTEGER REFERENCES food_groups(id),
        store_section_id INTEGER REFERENCES store_sections(id),
        
        -- Shopping behavior tracking
        was_planned BOOLEAN DEFAULT TRUE, -- was this on the shopping list?
        was_extra_purchase BOOLEAN DEFAULT FALSE, -- bought more than planned
        was_substitute BOOLEAN DEFAULT FALSE, -- substitute for planned item
        
        -- Metadata
        purchase_date DATE,
        store_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Skipped Items Analytics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS skipped_items_analytics (
        id SERIAL PRIMARY KEY,
        grocery_list_id INTEGER REFERENCES grocery_lists(id),
        grocery_item_id INTEGER REFERENCES grocery_items(id),
        
        -- Item details
        item_name VARCHAR(200) NOT NULL,
        planned_quantity VARCHAR(50),
        estimated_price DECIMAL(10,2),
        category VARCHAR(100),
        meal VARCHAR(200),
        
        -- Skip analysis
        skip_reason VARCHAR(100), -- 'not_needed', 'too_expensive', 'out_of_stock', 'forgot', 'other'
        skip_frequency INTEGER DEFAULT 1, -- how many times this item has been skipped
        
        -- Dates
        planned_date DATE,
        skipped_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Shopping Trip Summary table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shopping_trip_summary (
        id SERIAL PRIMARY KEY,
        grocery_list_id INTEGER REFERENCES grocery_lists(id),
        receipt_id INTEGER REFERENCES receipts(id),
        
        -- Trip totals
        planned_total DECIMAL(10,2),
        actual_total DECIMAL(10,2),
        budget_variance DECIMAL(10,2), -- actual - planned
        budget_variance_percent DECIMAL(5,2), -- percentage variance
        
        -- Item counts
        planned_items_count INTEGER,
        purchased_items_count INTEGER,
        extra_items_count INTEGER,
        skipped_items_count INTEGER,
        
        -- Trip metadata
        store_name VARCHAR(100),
        shopping_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 7. Pantry Suggestions table - recurring item suggestions
    await client.query(`
      CREATE TABLE IF NOT EXISTS pantry_suggestions (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(200) NOT NULL,
        category VARCHAR(100),
        food_group_id INTEGER REFERENCES food_groups(id),
        
        -- Analytics data
        times_purchased INTEGER DEFAULT 0,
        times_skipped INTEGER DEFAULT 0,
        avg_quantity VARCHAR(50),
        avg_price DECIMAL(10,2),
        last_purchased DATE,
        last_skipped DATE,
        
        -- Suggestion scoring
        suggestion_score DECIMAL(5,2), -- 0-100 score for recommendation
        frequency_pattern VARCHAR(50), -- 'weekly', 'biweekly', 'monthly', 'irregular'
        suggested_quantity VARCHAR(50),
        
        -- Status
        is_active BOOLEAN DEFAULT TRUE,
        added_to_pantry BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Update grocery_items table to include food_group and store_section references
    await client.query(`
      ALTER TABLE grocery_items 
      ADD COLUMN IF NOT EXISTS food_group_id INTEGER REFERENCES food_groups(id),
      ADD COLUMN IF NOT EXISTS store_section_id INTEGER REFERENCES store_sections(id),
      ADD COLUMN IF NOT EXISTS actual_price DECIMAL(10,2),
      ADD COLUMN IF NOT EXISTS purchased_quantity VARCHAR(50)
    `);

    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_analytics_date ON purchase_analytics(purchase_date);
      CREATE INDEX IF NOT EXISTS idx_purchase_analytics_food_group ON purchase_analytics(food_group_id);
      CREATE INDEX IF NOT EXISTS idx_purchase_analytics_store_section ON purchase_analytics(store_section_id);
      CREATE INDEX IF NOT EXISTS idx_skipped_items_date ON skipped_items_analytics(skipped_date);
      CREATE INDEX IF NOT EXISTS idx_pantry_suggestions_score ON pantry_suggestions(suggestion_score DESC);
    `);

    console.log('✅ Analytics tables created successfully!');

  } catch (error) {
    console.error('❌ Error creating analytics tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
createAnalyticsTables()
  .then(() => {
    console.log('🎉 Analytics database migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });