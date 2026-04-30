import { pool, WeeklyMealPlan, Meal, AIMenuCache } from './index';

// AI Menu Generation specific functions

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