import { Meal, DAYS_OF_WEEK } from './types';

interface WeeklyOverviewProps {
  meals: Meal[];
}

export default function WeeklyOverview({ meals }: WeeklyOverviewProps) {
  const cookingMeals = meals.filter(meal => meal.meal_type === 'cooking' && meal.title);

  if (cookingMeals.length === 0) return null;

  return (
    <div className="weekly-overview">
      <h3>At-a-Glance Weekly Menu</h3>
      <div className="overview-grid">
        {cookingMeals.map((meal) => (
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
  );
}