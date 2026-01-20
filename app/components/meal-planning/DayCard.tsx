import { Meal } from './types';
import { updateMeal as updateMealAPI } from './utils';

interface DayCardProps {
  day: string;
  dayIndex: number;
  meal?: Meal;
  onMealUpdate: (meals: Meal[]) => void;
  allMeals: Meal[];
}

export default function DayCard({ day, dayIndex, meal, onMealUpdate, allMeals }: DayCardProps) {
  const handleMealUpdate = async (mealId: number, updates: Partial<Meal>) => {
    const success = await updateMealAPI(mealId, updates);

    if (success) {
      const updatedMeals = allMeals.map(m =>
        m.id === mealId ? { ...m, ...updates } : m
      );
      onMealUpdate(updatedMeals);
    }
  };

  return (
    <div className="day-card">
      <h3>{day}</h3>

      {meal ? (
        <div className="meal-content">
          <select
            value={meal.meal_type}
            onChange={(e) => handleMealUpdate(meal.id!, { meal_type: e.target.value as any })}
            className="meal-type-select"
          >
            <option value="cooking">Cooking</option>
            <option value="leftovers">Leftovers</option>
            <option value="eating_out">Eating Out</option>
          </select>

          {meal.meal_type === 'cooking' && (
            <>
              <input
                type="text"
                placeholder="Meal title"
                value={meal.title || ''}
                onChange={(e) => handleMealUpdate(meal.id!, { title: e.target.value })}
                className="meal-title-input"
              />

              <div className="meal-flags">
                <label className="flag-label">
                  <input
                    type="checkbox"
                    checked={meal.comfort_flag || false}
                    onChange={(e) => handleMealUpdate(meal.id!, { comfort_flag: e.target.checked })}
                  />
                  Comfort
                </label>
                <label className="flag-label">
                  <input
                    type="checkbox"
                    checked={meal.shortcut_flag || false}
                    onChange={(e) => handleMealUpdate(meal.id!, { shortcut_flag: e.target.checked })}
                  />
                  Shortcut/Hack
                </label>
                <label className="flag-label">
                  <input
                    type="checkbox"
                    checked={meal.cultural_riff_flag || false}
                    onChange={(e) => handleMealUpdate(meal.id!, { cultural_riff_flag: e.target.checked })}
                  />
                  Cultural Riff
                </label>
                <label className="flag-label veggie-flag">
                  <input
                    type="checkbox"
                    checked={meal.veggie_inclusion || false}
                    onChange={(e) => handleMealUpdate(meal.id!, { veggie_inclusion: e.target.checked })}
                  />
                  🥕 Veggies
                </label>
              </div>
            </>
          )}

          {(meal.meal_type === 'leftovers' || meal.meal_type === 'eating_out') && (
            <div className="non-cooking-meal">
              {meal.meal_type === 'leftovers' ? '🍱 Leftovers' : '🍽️ Eating Out'}
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
}