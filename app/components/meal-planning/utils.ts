import { Meal, WeeklyMealPlan, DEFAULT_MEAL_COUNT } from './types';

export const getNextWeekDates = () => {
  const today = new Date();
  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + (7 - today.getDay()));

  const nextSaturday = new Date(nextSunday);
  nextSaturday.setDate(nextSunday.getDate() + 6);

  return {
    sunday: nextSunday,
    saturday: nextSaturday,
    sundayString: nextSunday.toISOString().split('T')[0],
    saturdayString: nextSaturday.toISOString().split('T')[0]
  };
};

export const getDefaultPlanName = () => {
  const { sunday, saturday } = getNextWeekDates();
  const sundayFormatted = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const saturdayFormatted = saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Weekly Meal Plan for ${sundayFormatted} - ${saturdayFormatted}`;
};

export const getWeekStartDate = (selectedWeekStart: string) => {
  if (!selectedWeekStart) {
    return getNextWeekDates().sundayString;
  }
  return selectedWeekStart;
};

export const getRainbowCoverage = (meals: Meal[]) => {
  const veggieCount = meals.filter(meal => meal.veggie_inclusion && meal.meal_type === 'cooking').length;
  const cookingCount = meals.filter(meal => meal.meal_type === 'cooking').length;
  return cookingCount > 0 ? Math.round((veggieCount / cookingCount) * 100) : 0;
};

export const fetchPlans = async (): Promise<WeeklyMealPlan[]> => {
  try {
    const response = await fetch('/api/meal-plans');
    if (response.ok) {
      return await response.json();
    } else {
      console.error('Failed to fetch plans:', response.statusText);
    }
  } catch (error) {
    console.error('Failed to fetch meal plans:', error);
  }
  return [];
};

export const fetchPlanDetails = async (planId: number): Promise<Meal[]> => {
  try {
    const response = await fetch(`/api/meal-plans/${planId}`);
    if (response.ok) {
      const data = await response.json();
      return data.meals || [];
    } else {
      console.error('Failed to fetch plan details:', response.statusText);
    }
  } catch (error) {
    console.error('Failed to fetch plan details:', error);
  }
  return [];
};

export const createMealPlan = async (name: string, weekStartDate: string) => {
  try {
    const response = await fetch('/api/meal-plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        weekStartDate,
      }),
    });

    if (response.ok) {
      return await response.json();
    } else {
      console.error('Failed to create meal plan:', response.statusText);
      const errorData = await response.json().catch(() => ({}));
      console.error('Error details:', errorData);
    }
  } catch (error) {
    console.error('Failed to create meal plan:', error);
  }
  return null;
};

export const initializeDefaultMeals = async (planId: number) => {
  const defaultMeals: Omit<Meal, 'id' | 'created_at'>[] = [];

  // Create 5 cooking days by default
  for (let i = 1; i <= DEFAULT_MEAL_COUNT; i++) {
    defaultMeals.push({
      plan_id: planId,
      day_of_week: i,
      meal_type: 'cooking',
      title: '',
      comfort_flag: false,
      shortcut_flag: false,
      cultural_riff_flag: false,
      veggie_inclusion: false,
    });
  }

  // Add 2 non-cooking days
  defaultMeals.push({
    plan_id: planId,
    day_of_week: 0, // Sunday
    meal_type: 'leftovers',
    title: 'Leftovers',
  });

  defaultMeals.push({
    plan_id: planId,
    day_of_week: 6, // Saturday
    meal_type: 'eating_out',
    title: 'Eating Out',
  });

  console.log('Creating default meals:', defaultMeals.length);

  try {
    const promises = defaultMeals.map(async (meal) => {
      console.log('Creating meal:', meal);
      const response = await fetch('/api/meals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(meal),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to create meal:', errorData);
        throw new Error(`Failed to create meal: ${errorData.error || response.statusText}`);
      }
      
      return response.json();
    });

    await Promise.all(promises);
    console.log('All default meals created successfully');
  } catch (error) {
    console.error('Error initializing default meals:', error);
    throw error;
  }
};

export const updateMeal = async (mealId: number, updates: Partial<Meal>) => {
  try {
    const response = await fetch('/api/meals', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: mealId, ...updates }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to update meal:', error);
    return false;
  }
};

export const deleteMealPlan = async (planId: number) => {
  try {
    const response = await fetch('/api/meal-plans', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: planId }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to delete meal plan:', error);
    return false;
  }
};

export const updateMealPlan = async (planId: number, updates: Partial<WeeklyMealPlan>) => {
  try {
    const response = await fetch(`/api/meal-plans/${planId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to update meal plan:', error);
    return false;
  }
};