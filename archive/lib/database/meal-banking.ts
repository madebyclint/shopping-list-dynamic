import { pool, BankedMeal, MealAlternativeHistory } from './index';

// Meal Banking Functions

export async function bankMeal(meal: Omit<BankedMeal, 'id' | 'created_at'>): Promise<number> {
  try {
    const result = await pool.query(
      `INSERT INTO banked_meals (title, day_of_week, meal_type, comfort_flag, shortcut_flag, 
       cultural_riff_flag, veggie_inclusion, bank_reason, original_meal_title, rating, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [meal.title, meal.day_of_week, meal.meal_type, meal.comfort_flag, meal.shortcut_flag,
       meal.cultural_riff_flag, meal.veggie_inclusion, meal.bank_reason, meal.original_meal_title,
       meal.rating, meal.status || 'banked']
    );
    return result.rows[0].id;
  } catch (error) {
    console.error('Error banking meal:', error);
    throw error;
  }
}

export async function getBankedMeals(status?: string): Promise<BankedMeal[]> {
  try {
    let query = 'SELECT * FROM banked_meals';
    let params: any[] = [];
    
    if (status) {
      query += ' WHERE status = $1';
      params = [status];
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error getting banked meals:', error);
    throw error;
  }
}

export async function updateBankedMealUsage(mealId: number): Promise<void> {
  try {
    await pool.query(
      'UPDATE banked_meals SET times_used = times_used + 1 WHERE id = $1',
      [mealId]
    );
  } catch (error) {
    console.error('Error updating banked meal usage:', error);
    throw error;
  }
}

export async function saveMealAlternative(alternative: Omit<MealAlternativeHistory, 'id' | 'created_at'>): Promise<number> {
  try {
    const result = await pool.query(
      `INSERT INTO meal_alternatives_history (original_meal_id, alternative_title, chosen, ai_reasoning, generation_cost_tokens)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [alternative.original_meal_id, alternative.alternative_title, alternative.chosen,
       alternative.ai_reasoning, alternative.generation_cost_tokens]
    );
    return result.rows[0].id;
  } catch (error) {
    console.error('Error saving meal alternative:', error);
    throw error;
  }
}

export async function getMealAlternatives(mealId: number): Promise<MealAlternativeHistory[]> {
  try {
    const result = await pool.query(
      'SELECT * FROM meal_alternatives_history WHERE original_meal_id = $1 ORDER BY created_at DESC',
      [mealId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting meal alternatives:', error);
    throw error;
  }
}