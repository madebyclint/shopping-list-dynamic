import { Meal, DAYS_OF_WEEK } from './types';

interface WeeklyOverviewProps {
  meals: Meal[];
}

export default function WeeklyOverview({ meals }: WeeklyOverviewProps) {

  const handleCopyQuickGlance = async () => {
    try {
      const quickList = DAYS_OF_WEEK.map((day, dayIndex) => {
        const dayMeal = meals.find(m => m.day_of_week === dayIndex);

        if (dayMeal && dayMeal.meal_type === 'cooking') {
          const title = dayMeal.title || 'Untitled Meal';
          const time = dayMeal.estimated_time_minutes ? ` - ${dayMeal.estimated_time_minutes} min` : '';
          return `${day}: ${title}${time}`;
        } else if (dayMeal?.meal_type === 'leftovers') {
          return `${day}: Leftovers`;
        } else if (dayMeal?.meal_type === 'eating_out') {
          return `${day}: Eating Out`;
        } else {
          return `${day}: No meal planned`;
        }
      }).join('\n');

      await navigator.clipboard.writeText(quickList);
      alert('Quick glance menu copied to clipboard!');
    } catch (error) {
      console.error('Error copying quick glance:', error);
      alert('Failed to copy to clipboard. Please try again.');
    }
  };

  const handleCopyFullDetails = async () => {
    try {
      const fullDetails = DAYS_OF_WEEK.map((day, dayIndex) => {
        const dayMeal = meals.find(m => m.day_of_week === dayIndex);

        if (dayMeal && dayMeal.meal_type === 'cooking') {
          const title = dayMeal.title || 'Untitled Meal';
          const time = dayMeal.estimated_time_minutes ? ` - ${dayMeal.estimated_time_minutes} min` : '';
          let details = `${day}: ${title}${time}`;

          if (dayMeal.main_ingredients) {
            details += `\n  Ingredients: ${dayMeal.main_ingredients}`;
          }

          if (dayMeal.cooking_instructions) {
            details += `\n  Instructions: ${dayMeal.cooking_instructions}`;
          }

          return details;
        } else if (dayMeal?.meal_type === 'leftovers') {
          return `${day}: Leftovers`;
        } else if (dayMeal?.meal_type === 'eating_out') {
          return `${day}: Eating Out`;
        } else {
          return `${day}: No meal planned`;
        }
      }).join('\n\n');

      await navigator.clipboard.writeText(fullDetails);
      alert('Full menu details copied to clipboard!');
    } catch (error) {
      console.error('Error copying full details:', error);
      alert('Failed to copy to clipboard. Please try again.');
    }
  };

  return (
    <div className="at-a-glance-section">
      <h2>
        📋 At-a-Glance Weekly Menu
        <button
          onClick={handleCopyQuickGlance}
          className="copy-menu-icon"
          title="Copy quick glance menu (meal names, times, and days)"
        >
          📋 Copy Quick Glance
        </button>
        <button
          onClick={handleCopyFullDetails}
          className="copy-menu-icon"
          title="Copy full menu details (including ingredients and instructions)"
        >
          📄 Copy Full Details
        </button>
      </h2>
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