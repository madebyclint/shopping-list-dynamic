import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

export interface GroceryItem {
  id?: number;
  name: string;
  qty: string;
  price: string;
  category: string;
  meal: string;
  is_purchased?: boolean;
  list_id: number;
  created_at?: Date;
}

export interface GroceryList {
  id?: number;
  name: string;
  raw_text: string;
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
  comfort_flag?: boolean;
  shortcut_flag?: boolean;
  cultural_riff_flag?: boolean;
  veggie_inclusion?: boolean;
  created_at?: Date;
}

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
        list_id INTEGER REFERENCES grocery_lists(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
        comfort_flag BOOLEAN DEFAULT FALSE,
        shortcut_flag BOOLEAN DEFAULT FALSE,
        cultural_riff_flag BOOLEAN DEFAULT FALSE,
        veggie_inclusion BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');

  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

export async function createGroceryList(name: string, rawText: string, items: Omit<GroceryItem, 'id' | 'list_id' | 'created_at'>[]): Promise<number> {
  try {
    // Create the list
    const listResult = await pool.query(
      'INSERT INTO grocery_lists (name, raw_text) VALUES ($1, $2) RETURNING id',
      [name, rawText]
    );
    
    const listId = listResult.rows[0].id;

    // Create the items
    for (const item of items) {
      await pool.query(
        'INSERT INTO grocery_items (name, qty, price, category, meal, list_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [item.name, item.qty, item.price, item.category, item.meal, listId]
      );
    }

    return listId;
  } catch (error) {
    console.error('Error creating grocery list:', error);
    throw error;
  }
}

export async function getGroceryList(listId: number): Promise<{ list: GroceryList; items: GroceryItem[] } | null> {
  try {
    const listResult = await pool.query(
      'SELECT * FROM grocery_lists WHERE id = $1',
      [listId]
    );
    
    if (listResult.rows.length === 0) {
      return null;
    }

    const itemsResult = await pool.query(
      'SELECT * FROM grocery_items WHERE list_id = $1 ORDER BY category, name',
      [listId]
    );

    return {
      list: listResult.rows[0] as GroceryList,
      items: itemsResult.rows as GroceryItem[]
    };
  } catch (error) {
    console.error('Error getting grocery list:', error);
    throw error;
  }
}

export async function updateItemPurchaseStatus(itemId: number, isPurchased: boolean): Promise<void> {
  try {
    await pool.query(
      'UPDATE grocery_items SET is_purchased = $1 WHERE id = $2',
      [isPurchased, itemId]
    );
  } catch (error) {
    console.error('Error updating item purchase status:', error);
    throw error;
  }
}

export async function getAllGroceryLists(): Promise<GroceryList[]> {
  try {
    const result = await pool.query(
      'SELECT id, name, created_at FROM grocery_lists ORDER BY created_at DESC'
    );
    
    return result.rows as GroceryList[];
  } catch (error) {
    console.error('Error getting all grocery lists:', error);
    throw error;
  }
}

// Meal Plan Functions

export async function createWeeklyMealPlan(name: string, weekStartDate: string): Promise<number> {
  try {
    const result = await pool.query(
      'INSERT INTO weekly_meal_plans (name, week_start_date) VALUES ($1, $2) RETURNING id',
      [name, weekStartDate]
    );
    
    return result.rows[0].id;
  } catch (error) {
    console.error('Error creating weekly meal plan:', error);
    throw error;
  }
}

export async function createMeal(meal: Omit<Meal, 'id' | 'created_at'>): Promise<number> {
  try {
    const result = await pool.query(
      `INSERT INTO meals (plan_id, day_of_week, meal_type, title, comfort_flag, shortcut_flag, cultural_riff_flag, veggie_inclusion) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [meal.plan_id, meal.day_of_week, meal.meal_type, meal.title, meal.comfort_flag, meal.shortcut_flag, meal.cultural_riff_flag, meal.veggie_inclusion]
    );
    
    return result.rows[0].id;
  } catch (error) {
    console.error('Error creating meal:', error);
    throw error;
  }
}

export async function getWeeklyMealPlan(planId: number): Promise<{ plan: WeeklyMealPlan; meals: Meal[] } | null> {
  try {
    const planResult = await pool.query(
      'SELECT * FROM weekly_meal_plans WHERE id = $1',
      [planId]
    );
    
    if (planResult.rows.length === 0) {
      return null;
    }

    const mealsResult = await pool.query(
      'SELECT * FROM meals WHERE plan_id = $1 ORDER BY day_of_week',
      [planId]
    );

    return {
      plan: planResult.rows[0] as WeeklyMealPlan,
      meals: mealsResult.rows as Meal[]
    };
  } catch (error) {
    console.error('Error getting weekly meal plan:', error);
    throw error;
  }
}

export async function getAllWeeklyMealPlans(): Promise<WeeklyMealPlan[]> {
  try {
    const result = await pool.query(
      'SELECT * FROM weekly_meal_plans ORDER BY week_start_date DESC'
    );
    
    return result.rows as WeeklyMealPlan[];
  } catch (error) {
    console.error('Error getting all weekly meal plans:', error);
    throw error;
  }
}

export async function updateMeal(mealId: number, updates: Partial<Meal>): Promise<void> {
  try {
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'plan_id' && key !== 'created_at')
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'plan_id' && key !== 'created_at')
      .map(key => updates[key as keyof Meal]);

    await pool.query(
      `UPDATE meals SET ${setClause} WHERE id = $1`,
      [mealId, ...values]
    );
  } catch (error) {
    console.error('Error updating meal:', error);
    throw error;
  }
}

export async function deleteWeeklyMealPlan(planId: number): Promise<void> {
  try {
    // Delete all meals associated with the plan first (cascade should handle this, but being explicit)
    await pool.query('DELETE FROM meals WHERE plan_id = $1', [planId]);
    
    // Delete the plan itself
    await pool.query('DELETE FROM weekly_meal_plans WHERE id = $1', [planId]);
  } catch (error) {
    console.error('Error deleting weekly meal plan:', error);
    throw error;
  }
}

export async function updateWeeklyMealPlan(planId: number, updates: Partial<WeeklyMealPlan>): Promise<void> {
  try {
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'created_at')
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'created_at')
      .map(key => updates[key as keyof WeeklyMealPlan]);

    await pool.query(
      `UPDATE weekly_meal_plans SET ${setClause} WHERE id = $1`,
      [planId, ...values]
    );
  } catch (error) {
    console.error('Error updating weekly meal plan:', error);
    throw error;
  }
}

// AI Menu Generation specific functions

export interface AIMenuCache {
  id?: number;
  week_start_date: string;
  plan_id: number;
  preferences_hash: string;
  ai_cost_tokens: number;
  generation_time_ms: number;
  created_at?: Date;
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

export async function findSimilarMenuInCache(weekStartDate: string, preferencesHash: string): Promise<{ plan: WeeklyMealPlan; meals: Meal[] } | null> {
  try {
    // Look for exact match first
    const exactMatch = await pool.query(
      `SELECT wmp.*, amc.ai_cost_tokens, amc.generation_time_ms 
       FROM ai_menu_cache amc 
       JOIN weekly_meal_plans wmp ON amc.plan_id = wmp.id 
       WHERE amc.week_start_date = $1 AND amc.preferences_hash = $2`,
      [weekStartDate, preferencesHash]
    );

    if (exactMatch.rows.length > 0) {
      const plan = exactMatch.rows[0];
      const meals = await pool.query('SELECT * FROM meals WHERE plan_id = $1 ORDER BY day_of_week', [plan.id]);
      return { plan, meals: meals.rows };
    }

    // Look for similar week (within 7 days) with same preferences
    const similarMatch = await pool.query(
      `SELECT wmp.*, amc.ai_cost_tokens, amc.generation_time_ms 
       FROM ai_menu_cache amc 
       JOIN weekly_meal_plans wmp ON amc.plan_id = wmp.id 
       WHERE amc.preferences_hash = $1 
       AND amc.week_start_date BETWEEN $2::date - INTERVAL '7 days' AND $2::date + INTERVAL '7 days'
       ORDER BY ABS(EXTRACT(EPOCH FROM (amc.week_start_date - $2::date))) 
       LIMIT 1`,
      [preferencesHash, weekStartDate]
    );

    if (similarMatch.rows.length > 0) {
      const plan = similarMatch.rows[0];
      const meals = await pool.query('SELECT * FROM meals WHERE plan_id = $1 ORDER BY day_of_week', [plan.id]);
      return { plan, meals: meals.rows };
    }

    return null;
  } catch (error) {
    console.error('Error finding similar menu in cache:', error);
    return null;
  }
}

export async function saveMenuToCache(weekStartDate: string, planId: number, preferencesHash: string, tokens: number, timeMs: number): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_menu_cache (week_start_date, plan_id, preferences_hash, ai_cost_tokens, generation_time_ms)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (week_start_date, preferences_hash) DO UPDATE SET
       plan_id = EXCLUDED.plan_id,
       ai_cost_tokens = EXCLUDED.ai_cost_tokens,
       generation_time_ms = EXCLUDED.generation_time_ms,
       created_at = CURRENT_TIMESTAMP`,
      [weekStartDate, planId, preferencesHash, tokens, timeMs]
    );
  } catch (error) {
    console.error('Error saving menu to cache:', error);
    throw error;
  }
}

export async function updateAIUsageStats(additionalCalls: number, additionalTokens: number): Promise<void> {
  try {
    const costEstimate = additionalTokens * 0.00003; // GPT-4 rough estimate
    await pool.query(
      `UPDATE ai_usage_stats SET 
       total_calls = total_calls + $1,
       total_tokens = total_tokens + $2,
       total_cost_estimate = total_cost_estimate + $3,
       last_updated = CURRENT_TIMESTAMP`,
      [additionalCalls, additionalTokens, costEstimate]
    );
  } catch (error) {
    console.error('Error updating AI usage stats:', error);
    throw error;
  }
}

export async function getAIUsageStats(): Promise<any> {
  try {
    const result = await pool.query('SELECT * FROM ai_usage_stats LIMIT 1');
    return result.rows[0] || { total_calls: 0, total_tokens: 0, total_cost_estimate: 0 };
  } catch (error) {
    console.error('Error getting AI usage stats:', error);
    return { total_calls: 0, total_tokens: 0, total_cost_estimate: 0 };
  }
}