'use client';

import { useState, useEffect } from 'react';

interface WeeklyMealPlan {
  id?: number;
  name: string;
  week_start_date: string;
  created_at?: Date;
}

interface Meal {
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

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_MEAL_COUNT = 5;

export default function WeeklyMenus() {
  const [plans, setPlans] = useState<WeeklyMealPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<WeeklyMealPlan | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [selectedWeekStart, setSelectedWeekStart] = useState('');

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    if (currentPlan) {
      fetchPlanDetails(currentPlan.id!);
    }
  }, [currentPlan]);

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/meal-plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data);
      }
    } catch (error) {
      console.error('Failed to fetch meal plans:', error);
    }
  };

  const fetchPlanDetails = async (planId: number) => {
    try {
      const response = await fetch(`/api/meal-plans/${planId}`);
      if (response.ok) {
        const data = await response.json();
        setMeals(data.meals);
      }
    } catch (error) {
      console.error('Failed to fetch plan details:', error);
    }
  };

  const createNewPlan = async () => {
    const planName = newPlanName.trim() || getDefaultPlanName();
    const weekStart = selectedWeekStart || getWeekStartDate();

    try {
      const response = await fetch('/api/meal-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: planName,
          weekStartDate: weekStart,
        }),
      });

      if (response.ok) {
        const { id } = await response.json();
        const newPlan: WeeklyMealPlan = {
          id,
          name: planName,
          week_start_date: weekStart,
        };

        setCurrentPlan(newPlan);
        await initializeDefaultMeals(id);
        setIsCreating(false);
        setNewPlanName('');
        setSelectedWeekStart('');
        fetchPlans();
      }
    } catch (error) {
      console.error('Failed to create meal plan:', error);
    }
  };

  const initializeDefaultMeals = async (planId: number) => {
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

    for (const meal of defaultMeals) {
      await fetch('/api/meals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(meal),
      });
    }
  };

  const updateMeal = async (mealId: number, updates: Partial<Meal>) => {
    try {
      const response = await fetch('/api/meals', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: mealId, ...updates }),
      });

      if (response.ok) {
        setMeals(meals.map(meal =>
          meal.id === mealId ? { ...meal, ...updates } : meal
        ));
      }
    } catch (error) {
      console.error('Failed to update meal:', error);
    }
  };

  const getRainbowCoverage = () => {
    const veggieCount = meals.filter(meal => meal.veggie_inclusion && meal.meal_type === 'cooking').length;
    const cookingCount = meals.filter(meal => meal.meal_type === 'cooking').length;
    return cookingCount > 0 ? Math.round((veggieCount / cookingCount) * 100) : 0;
  };

  const getNextWeekDates = () => {
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

  const getDefaultPlanName = () => {
    const { sunday, saturday } = getNextWeekDates();
    const sundayFormatted = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const saturdayFormatted = saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Weekly Meal Plan for ${sundayFormatted} - ${saturdayFormatted}`;
  };

  const getWeekStartDate = () => {
    if (!selectedWeekStart) {
      return getNextWeekDates().sundayString;
    }
    return selectedWeekStart;
  };

  return (
    <div className="content-section">
      <div className="shopping-lists-header">
        <h1>Weekly Meal Planning</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="edit-button"
        >
          Create New Plan
        </button>
      </div>

      {isCreating && (
        <div className="meal-plan-form">
          <h3>Create New Weekly Plan</h3>
          <div className="form-row">
            <input
              type="text"
              placeholder={getDefaultPlanName()}
              value={newPlanName}
              onChange={(e) => setNewPlanName(e.target.value)}
              className="plan-name-input"
            />
            <input
              type="date"
              value={selectedWeekStart || getWeekStartDate()}
              onChange={(e) => setSelectedWeekStart(e.target.value)}
              className="date-input"
            />
          </div>
          <div className="form-buttons">
            <button
              onClick={createNewPlan}
              className="create-button"
            >
              Create Plan
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewPlanName('');
                setSelectedWeekStart('');
              }}
              className="cancel-button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {plans.length > 0 && (
        <div className="list-selector">
          <h3>Select a Plan:</h3>
          <select
            value={currentPlan?.id || ''}
            onChange={(e) => {
              const selected = plans.find(p => p.id === parseInt(e.target.value));
              setCurrentPlan(selected || null);
            }}
          >
            <option value="">Choose a meal plan...</option>
            {plans.map(plan => (
              <option key={plan.id} value={plan.id}>
                {plan.name} - {new Date(plan.week_start_date).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      )}

      {currentPlan && (
        <div>
          <div className="plan-summary">
            <h2>{currentPlan.name}</h2>
            <div className="plan-stats">
              <span>🍳 Cooking meals: {meals.filter(m => m.meal_type === 'cooking').length}</span>
              <span>🥕 Rainbow coverage: {getRainbowCoverage()}%</span>
            </div>
          </div>

          <div className="week-grid">
            {DAYS_OF_WEEK.map((day, dayIndex) => {
              const dayMeal = meals.find(m => m.day_of_week === dayIndex);

              return (
                <div key={day} className="day-card">
                  <h3>{day}</h3>

                  {dayMeal ? (
                    <div className="meal-content">
                      <select
                        value={dayMeal.meal_type}
                        onChange={(e) => updateMeal(dayMeal.id!, { meal_type: e.target.value as any })}
                        className="meal-type-select"
                      >
                        <option value="cooking">Cooking</option>
                        <option value="leftovers">Leftovers</option>
                        <option value="eating_out">Eating Out</option>
                      </select>

                      {dayMeal.meal_type === 'cooking' && (
                        <>
                          <input
                            type="text"
                            placeholder="Meal title"
                            value={dayMeal.title || ''}
                            onChange={(e) => updateMeal(dayMeal.id!, { title: e.target.value })}
                            className="meal-title-input"
                          />

                          <div className="meal-flags">
                            <label className="flag-label">
                              <input
                                type="checkbox"
                                checked={dayMeal.comfort_flag || false}
                                onChange={(e) => updateMeal(dayMeal.id!, { comfort_flag: e.target.checked })}
                              />
                              Comfort
                            </label>
                            <label className="flag-label">
                              <input
                                type="checkbox"
                                checked={dayMeal.shortcut_flag || false}
                                onChange={(e) => updateMeal(dayMeal.id!, { shortcut_flag: e.target.checked })}
                              />
                              Shortcut/Hack
                            </label>
                            <label className="flag-label">
                              <input
                                type="checkbox"
                                checked={dayMeal.cultural_riff_flag || false}
                                onChange={(e) => updateMeal(dayMeal.id!, { cultural_riff_flag: e.target.checked })}
                              />
                              Cultural Riff
                            </label>
                            <label className="flag-label veggie-flag">
                              <input
                                type="checkbox"
                                checked={dayMeal.veggie_inclusion || false}
                                onChange={(e) => updateMeal(dayMeal.id!, { veggie_inclusion: e.target.checked })}
                              />
                              🥕 Veggies
                            </label>
                          </div>
                        </>
                      )}

                      {(dayMeal.meal_type === 'leftovers' || dayMeal.meal_type === 'eating_out') && (
                        <div className="non-cooking-meal">
                          {dayMeal.meal_type === 'leftovers' ? '🍱 Leftovers' : '🍽️ Eating Out'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="empty-meal">
                      No meal planned
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {meals.length > 0 && (
            <div className="weekly-overview">
              <h3>At-a-Glance Weekly Menu</h3>
              <div className="overview-grid">
                {meals
                  .filter(meal => meal.meal_type === 'cooking' && meal.title)
                  .map((meal) => (
                    <div key={meal.id} className="overview-item">
                      <span className="day-label">{DAYS_OF_WEEK[meal.day_of_week]}:</span>
                      <span className="meal-title">{meal.title}</span>
                      <div className="meal-icons">
                        {meal.comfort_flag && <span>😌</span>}
                        {meal.shortcut_flag && <span>⚡</span>}
                        {meal.cultural_riff_flag && <span>🌍</span>}
                        {meal.veggie_inclusion && <span>🥕</span>}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {plans.length === 0 && !isCreating && (
        <div className="empty-state">
          <h2>Get Started with Weekly Meal Planning</h2>
          <p>
            Create your first weekly meal plan to reduce decision fatigue and plan realistic weekly menus.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="create-first-plan-button"
          >
            Create Your First Plan
          </button>
        </div>
      )}
    </div>
  );
}