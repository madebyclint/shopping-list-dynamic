import { pool, WeeklyMealPlan, Meal } from './index';

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
      `INSERT INTO meals (plan_id, day_of_week, meal_type, title, brief_description, main_ingredients, comfort_flag, shortcut_flag, cultural_riff_flag, veggie_inclusion) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [meal.plan_id, meal.day_of_week, meal.meal_type, meal.title, meal.brief_description, meal.main_ingredients, meal.comfort_flag, meal.shortcut_flag, meal.cultural_riff_flag, meal.veggie_inclusion]
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

export async function updateMeal(mealId: number, updates: Partial<Meal>): Promise<boolean> {
  try {
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'plan_id' && key !== 'created_at')
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'plan_id' && key !== 'created_at')
      .map(key => updates[key as keyof Meal]);

    const result = await pool.query(
      `UPDATE meals SET ${setClause} WHERE id = $1`,
      [mealId, ...values]
    );
    
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Error updating meal:', error);
    return false;
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