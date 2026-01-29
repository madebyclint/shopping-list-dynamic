import { Meal, DAYS_OF_WEEK } from './types';

interface WeeklyOverviewProps {
  meals: Meal[];
}

export default function WeeklyOverview({ meals }: WeeklyOverviewProps) {
  return (
    <div className="at-a-glance-section">
      <h2>📋 At-a-Glance Weekly Menu</h2>
      <div className="glance-grid">
        {DAYS_OF_WEEK.map((day, dayIndex) => {
          const dayMeal = meals.find(m => m.day_of_week === dayIndex);
          return (
            <div key={day} className="glance-day">
              <h4>{day}</h4>
              {dayMeal && dayMeal.meal_type === 'cooking' ? (
                <div className="glance-meal">
                  <div className="glance-title">{dayMeal.title || 'Untitled Meal'}</div>
                  {dayMeal.estimated_time_minutes && (
                    <div className="glance-time">⏱️ {dayMeal.estimated_time_minutes} min</div>
                  )}
                  {dayMeal.cooking_instructions && (
                    <button
                      className="glance-instructions-btn"
                      onClick={() => {
                        alert(`Cooking Instructions for ${dayMeal.title}:\n\n${dayMeal.cooking_instructions}`);
                      }}
                    >
                      📋 Instructions
                    </button>
                  )}
                </div>
              ) : (
                <div className="glance-non-cooking">
                  {dayMeal?.meal_type === 'leftovers' ? '🍱 Leftovers' :
                    dayMeal?.meal_type === 'eating_out' ? '🍽️ Eating Out' :
                      '🚫 No meal planned'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}