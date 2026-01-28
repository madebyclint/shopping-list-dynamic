import { useState, useEffect } from 'react';
import { Meal } from './types';
import { updateMeal as updateMealAPI } from './utils';
import MealManager from '../MealManager';

interface DayCardProps {
  day: string;
  dayIndex: number;
  meal?: Meal;
  onMealUpdate: (meals: Meal[]) => void;
  allMeals: Meal[];
}

export default function DayCard({ day, dayIndex, meal, onMealUpdate, allMeals }: DayCardProps) {
  const [localTitle, setLocalTitle] = useState(meal?.title || '');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Update local state when meal prop changes
  useEffect(() => {
    if (meal?.title !== undefined) {
      setLocalTitle(meal.title);
      setHasUnsavedChanges(false);
    }
  }, [meal?.title]);

  const handleMealUpdate = async (mealId: number, updates: Partial<Meal>) => {
    const success = await updateMealAPI(mealId, updates);

    if (success) {
      const updatedMeals = allMeals.map(m =>
        m.id === mealId ? { ...m, ...updates } : m
      );
      onMealUpdate(updatedMeals);
    }
  };

  const handleTitleChange = (value: string) => {
    setLocalTitle(value);
    setHasUnsavedChanges(value !== meal?.title);
  };

  const handleSaveTitle = async () => {
    if (meal?.id && hasUnsavedChanges) {
      const success = await updateMealAPI(meal.id, { title: localTitle });
      if (success) {
        const updatedMeals = allMeals.map(m =>
          m.id === meal.id ? { ...m, title: localTitle } : m
        );
        onMealUpdate(updatedMeals);
        setHasUnsavedChanges(false);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    }
  };

  return (
    <div className="day-card">
      <h3>{day}</h3>

      {meal ? (
        <div className="meal-content">
          {meal.meal_type === 'cooking' && (
            <>
              <section className="cooking-meal-section">
                <select
                  value={meal.meal_type}
                  onChange={(e) => handleMealUpdate(meal.id!, { meal_type: e.target.value as any })}
                  className="meal-type-select"
                >
                  <option value="cooking">Cooking</option>
                  <option value="leftovers">Leftovers</option>
                  <option value="eating_out">Eating Out</option>
                </select>
                <div className="meal-title-container">
                  <input
                    type="text"
                    placeholder="Meal title"
                    value={localTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className={`meal-title-input ${hasUnsavedChanges ? 'unsaved' : ''}`}
                  />
                  {hasUnsavedChanges && (
                    <button
                      onClick={handleSaveTitle}
                      className="save-title-button"
                      title="Save title (or press Enter)"
                    >
                      💾 Save
                    </button>
                  )}
                </div>

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

                {/* AI Meal Management */}

              </section>
              <MealManager
                meal={meal}
                onMealUpdated={() => {
                  // Refresh the meal data by calling the parent update
                  window.location.reload(); // Simple approach for now
                }}
              />
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