import { pool } from './index';
import DOMPurify from 'isomorphic-dompurify';

// Version for import/export schema
export const DATA_EXPORT_VERSION = '1.0.0';

export interface DataExportFormat {
  version: string;
  exportedAt: string;
  data: {
    weeklyMealPlans: any[];
    meals: any[];
    groceryLists: any[];
    groceryItems: any[];
    pantryItems: any[];
    bankedMeals: any[];
    aiMenuCache: any[];
    mealAlternativesHistory: any[];
  };
  metadata: {
    totalPlans: number;
    totalLists: number;
    totalItems: number;
    planDateRange?: {
      earliest: string;
      latest: string;
    };
  };
}

export interface ImportOptions {
  supplementMode: boolean; // true = supplement (default), false = replace
  skipDuplicates: boolean;
  preserveIds: boolean;
}

export interface ImportResult {
  success: boolean;
  imported: {
    weeklyMealPlans: number;
    meals: number;
    groceryLists: number;
    groceryItems: number;
    pantryItems: number;
    bankedMeals: number;
    aiMenuCache: number;
    mealAlternativesHistory: number;
  };
  skipped: {
    weeklyMealPlans: number;
    meals: number;
    groceryLists: number;
    groceryItems: number;
    pantryItems: number;
    bankedMeals: number;
    aiMenuCache: number;
    mealAlternativesHistory: number;
  };
  errors: string[];
  warnings: string[];
}

// Sanitize string data to prevent XSS and injection attacks
function sanitizeString(value: any): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  // Use DOMPurify to clean HTML/script content
  const cleaned = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
  
  // Additional SQL injection prevention (escape quotes)
  return cleaned.replace(/'/g, "''");
}

// Sanitize an object recursively
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

// Export all data from the database
export async function exportAllData(): Promise<DataExportFormat> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Export weekly meal plans
    const weeklyPlansResult = await client.query(`
      SELECT * FROM weekly_meal_plans 
      ORDER BY week_start_date DESC
    `);
    
    // Export meals
    const mealsResult = await client.query(`
      SELECT * FROM meals 
      ORDER BY plan_id, day_of_week
    `);
    
    // Export grocery lists
    const groceryListsResult = await client.query(`
      SELECT * FROM grocery_lists 
      ORDER BY created_at DESC
    `);
    
    // Export grocery items
    const groceryItemsResult = await client.query(`
      SELECT * FROM grocery_items 
      ORDER BY list_id, created_at
    `);
    
    // Export pantry items
    const pantryItemsResult = await client.query(`
      SELECT * FROM pantry_items 
      ORDER BY plan_id, created_at
    `);
    
    // Export banked meals
    const bankedMealsResult = await client.query(`
      SELECT * FROM banked_meals 
      ORDER BY created_at DESC
    `);
    
    // Export AI menu cache (optional, for performance)
    const aiMenuCacheResult = await client.query(`
      SELECT * FROM ai_menu_cache 
      ORDER BY week_start_date DESC
    `);
    
    // Export meal alternatives history
    const mealAlternativesResult = await client.query(`
      SELECT * FROM meal_alternatives_history 
      ORDER BY created_at DESC
    `);
    
    await client.query('COMMIT');
    
    // Calculate metadata
    let planDateRange;
    if (weeklyPlansResult.rows.length > 0) {
      const dates = weeklyPlansResult.rows.map(p => new Date(p.week_start_date)).sort();
      planDateRange = {
        earliest: dates[0].toISOString().split('T')[0],
        latest: dates[dates.length - 1].toISOString().split('T')[0]
      };
    }
    
    return {
      version: DATA_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        weeklyMealPlans: weeklyPlansResult.rows,
        meals: mealsResult.rows,
        groceryLists: groceryListsResult.rows,
        groceryItems: groceryItemsResult.rows,
        pantryItems: pantryItemsResult.rows,
        bankedMeals: bankedMealsResult.rows,
        aiMenuCache: aiMenuCacheResult.rows,
        mealAlternativesHistory: mealAlternativesResult.rows
      },
      metadata: {
        totalPlans: weeklyPlansResult.rows.length,
        totalLists: groceryListsResult.rows.length,
        totalItems: groceryItemsResult.rows.length + pantryItemsResult.rows.length,
        planDateRange
      }
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error exporting data:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Import data into the database
export async function importData(
  exportData: DataExportFormat, 
  options: ImportOptions = {
    supplementMode: true,
    skipDuplicates: true,
    preserveIds: false
  }
): Promise<ImportResult> {
  
  // Sanitize all incoming data
  const sanitizedData = sanitizeObject(exportData);
  
  const result: ImportResult = {
    success: false,
    imported: {
      weeklyMealPlans: 0,
      meals: 0,
      groceryLists: 0,
      groceryItems: 0,
      pantryItems: 0,
      bankedMeals: 0,
      aiMenuCache: 0,
      mealAlternativesHistory: 0
    },
    skipped: {
      weeklyMealPlans: 0,
      meals: 0,
      groceryLists: 0,
      groceryItems: 0,
      pantryItems: 0,
      bankedMeals: 0,
      aiMenuCache: 0,
      mealAlternativesHistory: 0
    },
    errors: [],
    warnings: []
  };
  
  // Version compatibility check
  if (!sanitizedData.version || sanitizedData.version !== DATA_EXPORT_VERSION) {
    result.warnings.push(`Version mismatch: expected ${DATA_EXPORT_VERSION}, got ${sanitizedData.version}. Import may have compatibility issues.`);
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create mapping for old IDs to new IDs
    const idMappings: { [key: string]: { [oldId: number]: number } } = {
      weeklyMealPlans: {},
      groceryLists: {}
    };
    
    // Import weekly meal plans first (other tables depend on this)
    for (const plan of sanitizedData.data.weeklyMealPlans || []) {
      try {
        if (options.skipDuplicates) {
          // Check if plan already exists
          const existingPlan = await client.query(
            'SELECT id FROM weekly_meal_plans WHERE name = $1 AND week_start_date = $2',
            [plan.name, plan.week_start_date]
          );
          
          if (existingPlan.rows.length > 0) {
            result.skipped.weeklyMealPlans++;
            idMappings.weeklyMealPlans[plan.id] = existingPlan.rows[0].id;
            continue;
          }
        }
        
        const insertQuery = options.preserveIds && plan.id ?
          'INSERT INTO weekly_meal_plans (id, name, week_start_date, created_at) VALUES ($1, $2, $3, $4) RETURNING id' :
          'INSERT INTO weekly_meal_plans (name, week_start_date, created_at) VALUES ($1, $2, $3) RETURNING id';
        
        const insertValues = options.preserveIds && plan.id ?
          [plan.id, plan.name, plan.week_start_date, plan.created_at || new Date()] :
          [plan.name, plan.week_start_date, plan.created_at || new Date()];
        
        const insertResult = await client.query(insertQuery, insertValues);
        idMappings.weeklyMealPlans[plan.id] = insertResult.rows[0].id;
        result.imported.weeklyMealPlans++;
        
      } catch (error) {
        result.errors.push(`Error importing weekly meal plan: ${error}`);
      }
    }
    
    // Import meals
    for (const meal of sanitizedData.data.meals || []) {
      try {
        const newPlanId = idMappings.weeklyMealPlans[meal.plan_id];
        if (!newPlanId) {
          result.errors.push(`Meal skipped: referenced plan_id ${meal.plan_id} not found`);
          continue;
        }
        
        if (options.skipDuplicates) {
          const existingMeal = await client.query(
            'SELECT id FROM meals WHERE plan_id = $1 AND day_of_week = $2 AND meal_type = $3 AND title = $4',
            [newPlanId, meal.day_of_week, meal.meal_type, meal.title]
          );
          
          if (existingMeal.rows.length > 0) {
            result.skipped.meals++;
            continue;
          }
        }
        
        await client.query(`
          INSERT INTO meals (plan_id, day_of_week, meal_type, title, brief_description, 
                           main_ingredients, cooking_instructions, estimated_time_minutes, 
                           cooking_temp_f, cooking_time_minutes, comfort_flag, shortcut_flag, 
                           cultural_riff_flag, veggie_inclusion, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          newPlanId, meal.day_of_week, meal.meal_type, meal.title, meal.brief_description,
          meal.main_ingredients, meal.cooking_instructions, meal.estimated_time_minutes,
          meal.cooking_temp_f, meal.cooking_time_minutes, meal.comfort_flag, meal.shortcut_flag,
          meal.cultural_riff_flag, meal.veggie_inclusion, meal.created_at || new Date()
        ]);
        
        result.imported.meals++;
        
      } catch (error) {
        result.errors.push(`Error importing meal: ${error}`);
      }
    }
    
    // Import grocery lists
    for (const list of sanitizedData.data.groceryLists || []) {
      try {
        const newPlanId = list.meal_plan_id ? idMappings.weeklyMealPlans[list.meal_plan_id] : null;
        
        if (options.skipDuplicates) {
          const existingList = await client.query(
            'SELECT id FROM grocery_lists WHERE name = $1 AND meal_plan_id = $2',
            [list.name, newPlanId]
          );
          
          if (existingList.rows.length > 0) {
            result.skipped.groceryLists++;
            idMappings.groceryLists[list.id] = existingList.rows[0].id;
            continue;
          }
        }
        
        const insertResult = await client.query(`
          INSERT INTO grocery_lists (name, raw_text, meal_plan_id, created_at)
          VALUES ($1, $2, $3, $4) RETURNING id
        `, [list.name, list.raw_text, newPlanId, list.created_at || new Date()]);
        
        idMappings.groceryLists[list.id] = insertResult.rows[0].id;
        result.imported.groceryLists++;
        
      } catch (error) {
        result.errors.push(`Error importing grocery list: ${error}`);
      }
    }
    
    // Import grocery items
    for (const item of sanitizedData.data.groceryItems || []) {
      try {
        const newListId = idMappings.groceryLists[item.list_id];
        if (!newListId) {
          result.errors.push(`Grocery item skipped: referenced list_id ${item.list_id} not found`);
          continue;
        }
        
        if (options.skipDuplicates) {
          const existingItem = await client.query(
            'SELECT id FROM grocery_items WHERE list_id = $1 AND name = $2 AND category = $3',
            [newListId, item.name, item.category]
          );
          
          if (existingItem.rows.length > 0) {
            result.skipped.groceryItems++;
            continue;
          }
        }
        
        await client.query(`
          INSERT INTO grocery_items (name, qty, price, category, meal, is_purchased, 
                                   is_skipped, list_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          item.name, item.qty, item.price, item.category, item.meal,
          item.is_purchased || false, item.is_skipped || false, newListId, 
          item.created_at || new Date()
        ]);
        
        result.imported.groceryItems++;
        
      } catch (error) {
        result.errors.push(`Error importing grocery item: ${error}`);
      }
    }
    
    // Import pantry items
    for (const item of sanitizedData.data.pantryItems || []) {
      try {
        const newPlanId = idMappings.weeklyMealPlans[item.plan_id];
        if (!newPlanId) {
          result.errors.push(`Pantry item skipped: referenced plan_id ${item.plan_id} not found`);
          continue;
        }
        
        if (options.skipDuplicates) {
          const existingItem = await client.query(
            'SELECT id FROM pantry_items WHERE plan_id = $1 AND name = $2',
            [newPlanId, item.name]
          );
          
          if (existingItem.rows.length > 0) {
            result.skipped.pantryItems++;
            continue;
          }
        }
        
        await client.query(`
          INSERT INTO pantry_items (plan_id, name, category, qty, estimated_price, 
                                  added_via_prompt, prompt_tokens_used, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          newPlanId, item.name, item.category, item.qty, item.estimated_price || 0,
          item.added_via_prompt, item.prompt_tokens_used || 0,
          item.created_at || new Date(), item.updated_at || new Date()
        ]);
        
        result.imported.pantryItems++;
        
      } catch (error) {
        result.errors.push(`Error importing pantry item: ${error}`);
      }
    }
    
    // Import banked meals
    for (const meal of sanitizedData.data.bankedMeals || []) {
      try {
        if (options.skipDuplicates) {
          const existingMeal = await client.query(
            'SELECT id FROM banked_meals WHERE title = $1 AND day_of_week = $2',
            [meal.title, meal.day_of_week]
          );
          
          if (existingMeal.rows.length > 0) {
            result.skipped.bankedMeals++;
            continue;
          }
        }
        
        await client.query(`
          INSERT INTO banked_meals (title, brief_description, main_ingredients, cooking_instructions,
                                  estimated_time_minutes, cooking_temp_f, cooking_time_minutes,
                                  day_of_week, meal_type, comfort_flag, shortcut_flag, cultural_riff_flag,
                                  veggie_inclusion, bank_reason, original_meal_title, times_used, 
                                  rating, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `, [
          meal.title, meal.brief_description, meal.main_ingredients, meal.cooking_instructions,
          meal.estimated_time_minutes, meal.cooking_temp_f, meal.cooking_time_minutes,
          meal.day_of_week, meal.meal_type, meal.comfort_flag, meal.shortcut_flag,
          meal.cultural_riff_flag, meal.veggie_inclusion, meal.bank_reason, meal.original_meal_title,
          meal.times_used || 0, meal.rating, meal.status || 'imported', meal.created_at || new Date()
        ]);
        
        result.imported.bankedMeals++;
        
      } catch (error) {
        result.errors.push(`Error importing banked meal: ${error}`);
      }
    }
    
    // Import AI menu cache (optional)
    for (const cache of sanitizedData.data.aiMenuCache || []) {
      try {
        const newPlanId = idMappings.weeklyMealPlans[cache.plan_id];
        if (!newPlanId) {
          result.skipped.aiMenuCache++;
          continue;
        }
        
        if (options.skipDuplicates) {
          const existingCache = await client.query(
            'SELECT id FROM ai_menu_cache WHERE week_start_date = $1 AND preferences_hash = $2',
            [cache.week_start_date, cache.preferences_hash]
          );
          
          if (existingCache.rows.length > 0) {
            result.skipped.aiMenuCache++;
            continue;
          }
        }
        
        await client.query(`
          INSERT INTO ai_menu_cache (week_start_date, plan_id, preferences_hash, 
                                   ai_cost_tokens, generation_time_ms, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (week_start_date, preferences_hash) DO NOTHING
        `, [
          cache.week_start_date, newPlanId, cache.preferences_hash,
          cache.ai_cost_tokens, cache.generation_time_ms, cache.created_at || new Date()
        ]);
        
        result.imported.aiMenuCache++;
        
      } catch (error) {
        result.errors.push(`Error importing AI menu cache: ${error}`);
      }
    }
    
    await client.query('COMMIT');
    result.success = result.errors.length === 0;
    
  } catch (error) {
    await client.query('ROLLBACK');
    result.errors.push(`Transaction failed: ${error}`);
    throw error;
  } finally {
    client.release();
  }
  
  return result;
}

// Get import preview without actually importing
export async function getImportPreview(exportData: DataExportFormat): Promise<{
  version: string;
  compatible: boolean;
  summary: {
    weeklyMealPlans: number;
    meals: number;
    groceryLists: number;
    groceryItems: number;
    pantryItems: number;
    bankedMeals: number;
    aiMenuCache: number;
    mealAlternativesHistory: number;
  };
  dateRange?: {
    earliest: string;
    latest: string;
  };
  warnings: string[];
}> {
  const sanitizedData = sanitizeObject(exportData);
  
  const warnings: string[] = [];
  
  // Version compatibility check
  const compatible = sanitizedData.version === DATA_EXPORT_VERSION;
  if (!compatible) {
    warnings.push(`Version mismatch: expected ${DATA_EXPORT_VERSION}, got ${sanitizedData.version}`);
  }
  
  // Calculate date range from meal plans
  let dateRange;
  if (sanitizedData.data.weeklyMealPlans?.length > 0) {
    const validDates = sanitizedData.data.weeklyMealPlans
      .map((p: any) => {
        if (p.week_start_date) {
          return new Date(p.week_start_date);
        }
        return null;
      })
      .filter(date => date && !isNaN(date.getTime()))
      .sort();
    
    if (validDates.length > 0) {
      dateRange = {
        earliest: validDates[0].toISOString().split('T')[0],
        latest: validDates[validDates.length - 1].toISOString().split('T')[0]
      };
    }
  }
  
  return {
    version: sanitizedData.version,
    compatible,
    summary: {
      weeklyMealPlans: sanitizedData.data.weeklyMealPlans?.length || 0,
      meals: sanitizedData.data.meals?.length || 0,
      groceryLists: sanitizedData.data.groceryLists?.length || 0,
      groceryItems: sanitizedData.data.groceryItems?.length || 0,
      pantryItems: sanitizedData.data.pantryItems?.length || 0,
      bankedMeals: sanitizedData.data.bankedMeals?.length || 0,
      aiMenuCache: sanitizedData.data.aiMenuCache?.length || 0,
      mealAlternativesHistory: sanitizedData.data.mealAlternativesHistory?.length || 0
    },
    dateRange,
    warnings
  };
}