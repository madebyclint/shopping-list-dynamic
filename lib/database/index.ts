import { Pool } from 'pg';

// Shared database connection pool
export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// Shared type definitions
export interface GroceryItem {
  id?: number;
  name: string;
  qty: string;
  price: string;
  category: string;
  meal: string;
  is_purchased?: boolean;
  is_skipped?: boolean;
  list_id: number;
  created_at?: Date;
}

export interface GroceryList {
  id?: number;
  name: string;
  raw_text: string;
  meal_plan_id?: number;
  created_at?: Date;
}

export interface WeeklyMealPlan {
  id?: number;
  name: string;
  week_start_date: string;
  created_at?: Date;
}

export interface Meal {
  id?: number;
  plan_id: number;
  day_of_week: number; // 0-6 (Sunday-Saturday)
  meal_type: 'cooking' | 'leftovers' | 'eating_out';
  title?: string;
  brief_description?: string;
  main_ingredients?: string;
  cooking_instructions?: string;
  estimated_time_minutes?: number;
  cooking_temp_f?: number;
  cooking_time_minutes?: number;
  comfort_flag?: boolean;
  shortcut_flag?: boolean;
  cultural_riff_flag?: boolean;
  veggie_inclusion?: boolean;
  created_at?: Date;
}

export interface AIMenuCache {
  id?: number;
  week_start_date: string;
  plan_id: number;
  preferences_hash: string;
  ai_cost_tokens: number;
  generation_time_ms: number;
  created_at?: Date;
}

export interface BankedMeal {
  id?: number;
  title: string;
  brief_description?: string;
  main_ingredients?: string;
  cooking_instructions?: string;
  estimated_time_minutes?: number;
  cooking_temp_f?: number;
  cooking_time_minutes?: number;
  day_of_week: number;
  meal_type: 'cooking' | 'leftovers' | 'eating_out';
  comfort_flag?: boolean;
  shortcut_flag?: boolean;
  cultural_riff_flag?: boolean;
  veggie_inclusion?: boolean;
  bank_reason?: string;
  original_meal_title?: string;
  times_used?: number;
  rating?: number;
  status?: 'banked' | 'favorited' | 'archived' | 'generated';
  created_at?: Date;
}

export interface MealAlternativeHistory {
  id?: number;
  original_meal_id: number;
  alternative_title: string;
  chosen?: boolean;
  ai_reasoning?: string;
  generation_cost_tokens?: number;
  created_at?: Date;
}

export interface PantryItem {
  id?: number;
  plan_id: number;
  name: string;
  category: string;
  qty: string;
  estimated_price?: number;
  created_at?: Date;
}

// Database initialization functions
export async function initializeDatabase() {
  try {
    // Test the connection with a simple query first
    await pool.query('SELECT 1');
    
    // Create tables if connection succeeds
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grocery_lists (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        raw_text TEXT NOT NULL,
        meal_plan_id INTEGER REFERENCES weekly_meal_plans(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add meal_plan_id column if it doesn't exist (for existing databases)
    await pool.query(`
      ALTER TABLE grocery_lists 
      ADD COLUMN IF NOT EXISTS meal_plan_id INTEGER REFERENCES weekly_meal_plans(id) ON DELETE SET NULL
    `);

    // Create grocery_items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grocery_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        qty VARCHAR(100) NOT NULL,
        price VARCHAR(50) NOT NULL,
        category VARCHAR(255) NOT NULL,
        meal VARCHAR(255) NOT NULL,
        is_purchased BOOLEAN DEFAULT FALSE,
        is_skipped BOOLEAN DEFAULT FALSE,
        list_id INTEGER REFERENCES grocery_lists(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add is_skipped column if it doesn't exist (for existing databases)
    await pool.query(`
      ALTER TABLE grocery_items 
      ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN DEFAULT FALSE
    `);

    // Create weekly_meal_plans table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS weekly_meal_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        week_start_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create meals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meals (
        id SERIAL PRIMARY KEY,
        plan_id INTEGER REFERENCES weekly_meal_plans(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('cooking', 'leftovers', 'eating_out')),
        title VARCHAR(255),
        brief_description TEXT,
        main_ingredients TEXT,
        cooking_instructions TEXT,
        estimated_time_minutes INTEGER,
        cooking_temp_f INTEGER,
        cooking_time_minutes INTEGER,
        comfort_flag BOOLEAN DEFAULT FALSE,
        shortcut_flag BOOLEAN DEFAULT FALSE,
        cultural_riff_flag BOOLEAN DEFAULT FALSE,
        veggie_inclusion BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new cooking instruction columns if they don't exist (for existing databases)
    try {
      await pool.query(`ALTER TABLE meals ADD COLUMN IF NOT EXISTS cooking_instructions TEXT`);
      await pool.query(`ALTER TABLE meals ADD COLUMN IF NOT EXISTS estimated_time_minutes INTEGER`);
      await pool.query(`ALTER TABLE meals ADD COLUMN IF NOT EXISTS cooking_temp_f INTEGER`);
      await pool.query(`ALTER TABLE meals ADD COLUMN IF NOT EXISTS cooking_time_minutes INTEGER`);
    } catch (error) {
      // Columns might already exist, ignore error
    }

    // Create pantry_items table for extra items added to meal plans
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pantry_items (
        id SERIAL PRIMARY KEY,
        plan_id INTEGER REFERENCES weekly_meal_plans(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        qty VARCHAR(100) NOT NULL,
        estimated_price DECIMAL(8,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');

  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

export async function initializeAIMenuTables(): Promise<void> {
  try {
    // Create AI menu cache table for cost optimization
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_menu_cache (
        id SERIAL PRIMARY KEY,
        week_start_date DATE NOT NULL,
        plan_id INTEGER REFERENCES weekly_meal_plans(id) ON DELETE CASCADE,
        preferences_hash VARCHAR(255) NOT NULL,
        ai_cost_tokens INTEGER NOT NULL,
        generation_time_ms INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(week_start_date, preferences_hash)
      )
    `);

    // Create AI usage tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_stats (
        id SERIAL PRIMARY KEY,
        total_calls INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cost_estimate DECIMAL(10,4) DEFAULT 0.00,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create meal banking table for saving alternatives
    await pool.query(`
      CREATE TABLE IF NOT EXISTS banked_meals (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        brief_description TEXT,
        main_ingredients TEXT,
        cooking_instructions TEXT,
        estimated_time_minutes INTEGER,
        cooking_temp_f INTEGER,
        cooking_time_minutes INTEGER,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('cooking', 'leftovers', 'eating_out')),
        comfort_flag BOOLEAN DEFAULT FALSE,
        shortcut_flag BOOLEAN DEFAULT FALSE,
        cultural_riff_flag BOOLEAN DEFAULT FALSE,
        veggie_inclusion BOOLEAN DEFAULT FALSE,
        bank_reason VARCHAR(255) DEFAULT 'auto_generated',
        original_meal_title VARCHAR(255),
        times_used INTEGER DEFAULT 0,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        status VARCHAR(20) DEFAULT 'generated' CHECK (status IN ('banked', 'favorited', 'archived', 'generated')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create meal alternatives history
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meal_alternatives_history (
        id SERIAL PRIMARY KEY,
        original_meal_id INTEGER REFERENCES meals(id) ON DELETE CASCADE,
        alternative_title VARCHAR(255) NOT NULL,
        chosen BOOLEAN DEFAULT FALSE,
        ai_reasoning TEXT,
        generation_cost_tokens INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize stats if empty
    const statsResult = await pool.query('SELECT COUNT(*) FROM ai_usage_stats');
    if (parseInt(statsResult.rows[0].count) === 0) {
      await pool.query('INSERT INTO ai_usage_stats (total_calls, total_tokens) VALUES (0, 0)');
    }

    console.log('AI menu tables initialized successfully');
  } catch (error) {
    console.error('Error initializing AI menu tables:', error);
    throw error;
  }
}

// Re-export functions from grocery-lists module
export { 
  createGroceryList, 
  getGroceryList,
  getAllGroceryLists,
  updateItemPurchaseStatus,
  updateGroceryItem,
  addItemToList,
  deleteItemFromList,
  searchIngredients,
  updateExistingList, 
  findExistingListForMealPlan, 
  deleteGroceryListItems,
  addItemsToGroceryList
} from './grocery-lists';

// Re-export functions from meal-planning module
export { 
  createWeeklyMealPlan, 
  getWeeklyMealPlan, 
  updateWeeklyMealPlan, 
  deleteWeeklyMealPlan 
} from './meal-planning';

// Re-export functions from meal-banking module
export { 
  getMealAlternatives, 
  saveMealAlternative,
  bankMeal,
  getBankedMeals,
  updateBankedMealUsage
} from './meal-banking';

// Re-export functions from pantry-items module
export {
  addPantryItems,
  getPantryItems,
  updatePantryItems,
  deletePantryItem,
  clearPantryItems
} from './pantry-items';