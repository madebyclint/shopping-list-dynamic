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

export const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DEFAULT_MEAL_COUNT = 5;