import { useState, useEffect } from 'react';
import { Meal } from './types';
import { updateMeal as updateMealAPI, enhanceMealWithAI } from './utils';
import MealManager from '../MealManager';

interface DayCardProps {
  day: string;
  dayIndex: number;
  meal?: Meal;
  onMealUpdate: (meals: Meal[]) => void;
  onStatsUpdate?: () => void; // New prop to refresh AI stats
  allMeals: Meal[];
}

export default function DayCard({ day, dayIndex, meal, onMealUpdate, onStatsUpdate, allMeals }: DayCardProps) {
  const [localTitle, setLocalTitle] = useState(meal?.title || '');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

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

  const mealNeedsData = (meal: Meal) => {
    return !meal.main_ingredients || !meal.brief_description ||
      !meal.cooking_instructions || !meal.estimated_time_minutes;
  };

  const handleEnhanceMeal = async () => {
    if (!meal?.id || !meal.plan_id) return;

    setIsEnhancing(true);
    try {
      const result = await enhanceMealWithAI(meal);

      if (result.success) {
        // Refresh stats in parent component
        if (onStatsUpdate) {
          onStatsUpdate();
        }

        // Navigate back to weekly menus with current plan to maintain state
        const params = new URLSearchParams();
        params.set('section', 'weeklyMenus');
        params.set('planId', meal.plan_id.toString());
        window.location.href = `/?${params.toString()}`;

        alert(`✅ ${result.message}\nUpdated: ${result.updatedFields?.join(', ')}\n\nAI costs have been updated in the Weekly Menu stats.`);
      } else {
        alert(`❌ Failed to enhance meal: ${result.message}`);
      }
    } catch (error) {
      alert(`❌ Error enhancing meal: ${error}`);
    } finally {
      setIsEnhancing(false);
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

                {/* Description */}
                {meal.brief_description && (
                  <div className="meal-description">
                    📝 {meal.brief_description}
                  </div>
                )}

                {/* Ingredient Count */}
                {meal.main_ingredients && (
                  <div className="meal-ingredients-info">
                    <div className="ingredient-count">
                      🥬 {(() => {
                        try {
                          // Try parsing as JSON array first
                          const parsed = JSON.parse(meal.main_ingredients);
                          return Array.isArray(parsed) ? parsed.length : meal.main_ingredients.split(',').length;
                        } catch {
                          // Fall back to comma-separated string
                          return meal.main_ingredients.split(',').length;
                        }
                      })()} ingredients
                    </div>
                    <div className="estimated-cost">
                      💰 Est. ${(() => {
                        try {
                          // Try parsing as JSON array first
                          const parsed = JSON.parse(meal.main_ingredients);
                          const count = Array.isArray(parsed) ? parsed.length : meal.main_ingredients.split(',').length;
                          return (count * 2.5).toFixed(2);
                        } catch {
                          // Fall back to comma-separated string
                          const count = meal.main_ingredients.split(',').length;
                          return (count * 2.5).toFixed(2);
                        }
                      })()}
                    </div>
                  </div>
                )}

                {/* Cooking Time and Instructions */}
                <div className="meal-cooking-info">
                  {meal.estimated_time_minutes && (
                    <div className="cooking-time">
                      ⏱️ Total Time: {meal.estimated_time_minutes} minutes
                    </div>
                  )}
                  {meal.cooking_instructions && (
                    <button
                      className="instructions-button"
                      onClick={() => {
                        alert(`Cooking Instructions for ${meal.title || 'This Meal'}:\n\n${meal.cooking_instructions}`);
                      }}
                    >
                      📋 View Instructions
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

                {/* Enhance Meal Button */}
                {meal.meal_type === 'cooking' && mealNeedsData(meal) && (
                  <div className="enhance-meal-section">
                    <button
                      onClick={handleEnhanceMeal}
                      disabled={isEnhancing}
                      className="enhance-meal-button"
                      title="Use AI to add missing ingredients, description, instructions, and cooking time"
                    >
                      {isEnhancing ? '🤖 Enhancing...' : '✨ Complete with AI'}
                    </button>
                    <span className="enhance-hint">
                      Missing: {[
                        !meal.main_ingredients ? 'ingredients' : null,
                        !meal.brief_description ? 'description' : null,
                        !meal.cooking_instructions ? 'instructions' : null,
                        !meal.estimated_time_minutes ? 'time' : null
                      ].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}

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