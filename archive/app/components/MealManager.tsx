'use client';

import { useState } from 'react';
import { Meal } from './meal-planning/types';

interface MealManagerProps {
  meal: Meal;
  onMealUpdated: () => void;
}

interface Alternative {
  title: string;
  brief_description?: string;
  main_ingredients?: string;
  comfort_flag: boolean;
  shortcut_flag: boolean;
  cultural_riff_flag: boolean;
  veggie_inclusion: boolean;
  reasoning?: string;
}

export default function MealManager({ meal, onMealUpdated }: MealManagerProps) {
  const [showActions, setShowActions] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [prompt, setPrompt] = useState('');
  const [previousSuggestions, setPreviousSuggestions] = useState<string[]>([]);
  const [bankReason, setBankReason] = useState('');
  const [rating, setRating] = useState<number>(3);
  const [showBankForm, setShowBankForm] = useState(false);

  const generateAlternative = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/meals/alternatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId: meal.id,
          currentMeal: meal.title,
          dayOfWeek: meal.day_of_week,
          mealType: meal.meal_type,
          prompt: prompt.trim(),
          actionType: 'alternative',
          previousSuggestions
        })
      });

      const data = await response.json();
      if (data.success) {
        setAlternatives([...alternatives, data.alternative]);
        setPreviousSuggestions([...previousSuggestions, data.alternative.title]);
        setPrompt('');
      } else {
        alert('Failed to generate alternative: ' + data.error);
      }
    } catch (error) {
      alert('Error generating alternative');
    }
    setIsGenerating(false);
  };

  const modifyCurrentMeal = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/meals/alternatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId: meal.id,
          currentMeal: meal.title,
          currentIngredients: meal.main_ingredients,
          dayOfWeek: meal.day_of_week,
          mealType: meal.meal_type,
          prompt: prompt.trim(),
          actionType: 'modify'
        })
      });

      const data = await response.json();
      if (data.success) {
        // For modifications, apply directly to current meal
        await fetch('/api/meals/banking?action=replace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mealId: meal.id,
            newMeal: {
              title: data.alternative.title,
              brief_description: data.alternative.brief_description,
              main_ingredients: data.alternative.main_ingredients,
              comfort_flag: data.alternative.comfort_flag,
              shortcut_flag: data.alternative.shortcut_flag,
              cultural_riff_flag: data.alternative.cultural_riff_flag,
              veggie_inclusion: data.alternative.veggie_inclusion
            }
          })
        });

        onMealUpdated();
        setPrompt('');
        alert(`Modified meal to: ${data.alternative.title}`);
      } else {
        alert('Failed to modify meal: ' + data.error);
      }
    } catch (error) {
      alert('Error modifying meal');
    }
    setIsGenerating(false);
  };

  const useAlternative = async (alternative: Alternative) => {
    try {
      const response = await fetch('/api/meals/banking?action=replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId: meal.id,
          newMeal: {
            title: alternative.title,
            comfort_flag: alternative.comfort_flag,
            shortcut_flag: alternative.shortcut_flag,
            cultural_riff_flag: alternative.cultural_riff_flag,
            veggie_inclusion: alternative.veggie_inclusion
          }
        })
      });

      const data = await response.json();
      if (data.success) {
        onMealUpdated();
        setShowActions(false);
        setAlternatives([]);
      } else {
        alert('Failed to update meal: ' + data.error);
      }
    } catch (error) {
      alert('Error updating meal');
    }
  };

  const bankCurrentMeal = async () => {
    try {
      const response = await fetch('/api/meals/banking?action=bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId: meal.id,
          currentMeal: {
            title: meal.title,
            day_of_week: meal.day_of_week,
            meal_type: meal.meal_type,
            comfort_flag: meal.comfort_flag,
            shortcut_flag: meal.shortcut_flag,
            cultural_riff_flag: meal.cultural_riff_flag,
            veggie_inclusion: meal.veggie_inclusion
          },
          bankReason: bankReason.trim() || undefined,
          rating
        })
      });

      const data = await response.json();
      if (data.success) {
        alert(`Meal "${meal.title}" banked successfully!`);
        setShowBankForm(false);
        setBankReason('');
        setRating(3);
      } else {
        alert('Failed to bank meal: ' + data.error);
      }
    } catch (error) {
      alert('Error banking meal');
    }
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="meal-manager">
      <div className="meal-header">
        <div className="meal-info">
          <h4>{meal.title || 'Untitled Meal'}</h4>
          <p className="meal-meta">
            {dayNames[meal.day_of_week]} • {meal.meal_type}
            {meal.shortcut_flag && ' • Quick'}
            {meal.comfort_flag && ' • Comfort'}
            {meal.cultural_riff_flag && ' • International'}
            {meal.veggie_inclusion && ' • Veggies'}
          </p>
          {meal.brief_description && (
            <p className="meal-description">{meal.brief_description}</p>
          )}
          {meal.main_ingredients && (
            <p className="meal-ingredients">
              <strong>Ingredients:</strong> {meal.main_ingredients}
            </p>
          )}
        </div>

        <button
          onClick={() => setShowActions(!showActions)}
          className="meal-actions-toggle"
        >
          ⚙️ Manage
        </button>
      </div>

      {showActions && (
        <div className="meal-actions-panel">
          {/* Single Prompt for Modifications */}
          <div className="action-section">
            <h5>🔧 Adjust This Meal</h5>
            <div className="prompt-container">
              <textarea
                placeholder="How would you like to adjust this meal? Examples:\n• Add more protein\n• Make it vegetarian\n• Avoid dairy\n• Make it spicier\n• Get completely different meal"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="adjustment-prompt"
                rows={3}
                disabled={isGenerating}
              />
            </div>
            <div className="action-buttons">
              <button
                onClick={modifyCurrentMeal}
                disabled={isGenerating || !prompt.trim()}
                className="modify-button"
                title="Keep the same base meal but modify it (e.g., add protein to Pasta Primavera)"
              >
                {isGenerating ? 'Modifying...' : '📝 Modify Current'}
              </button>
              <button
                onClick={generateAlternative}
                disabled={isGenerating || !prompt.trim()}
                className="alternative-button"
                title="Generate a completely different meal based on your preferences"
              >
                {isGenerating ? 'Generating...' : '🎲 Get Alternative'}
              </button>
            </div>
            <p className="help-text">
              <strong>Modify Current:</strong> Keeps "{meal.title}" but adjusts it (add protein, make vegetarian, etc.)<br />
              <strong>Get Alternative:</strong> Creates a completely different meal
            </p>
          </div>

          {/* Show Alternatives */}
          {alternatives.length > 0 && (
            <div className="alternatives-section">
              <h5>💡 Suggested Alternatives</h5>
              {alternatives.map((alt, index) => (
                <div key={index} className="alternative-option">
                  <div className="alt-info">
                    <strong>{alt.title}</strong>
                    {alt.brief_description && (
                      <p className="alt-description">{alt.brief_description}</p>
                    )}
                    {alt.main_ingredients && (
                      <p className="alt-ingredients">
                        <strong>Ingredients:</strong> {alt.main_ingredients}
                      </p>
                    )}
                    {alt.reasoning && <p className="alt-reasoning">{alt.reasoning}</p>}
                    <div className="alt-tags">
                      {alt.shortcut_flag && <span className="tag quick">Quick</span>}
                      {alt.comfort_flag && <span className="tag comfort">Comfort</span>}
                      {alt.cultural_riff_flag && <span className="tag cultural">International</span>}
                      {alt.veggie_inclusion && <span className="tag veggie">Veggies</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => useAlternative(alt)}
                    className="use-alt-button"
                  >
                    Use This
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Banking */}
          <div className="action-section">
            <h5>🏦 Bank This Meal</h5>
            {!showBankForm ? (
              <button
                onClick={() => setShowBankForm(true)}
                className="bank-button"
              >
                Save for Future Use
              </button>
            ) : (
              <div className="bank-form">
                <input
                  type="text"
                  placeholder="Why are you banking this? (optional)"
                  value={bankReason}
                  onChange={(e) => setBankReason(e.target.value)}
                />
                <div className="rating-input">
                  <label>Rating: </label>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className={`star ${rating >= star ? 'active' : ''}`}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
                <div className="bank-buttons">
                  <button onClick={bankCurrentMeal} className="confirm-bank">
                    Bank Meal
                  </button>
                  <button onClick={() => setShowBankForm(false)} className="cancel-bank">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .meal-manager {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: white;
          width: 100%;
        }
        .meal-header {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-start;
          padding: 12px 16px;
        }
        .meal-info h4 {
          margin: 0 0 4px 0;
          font-size: 16px;
        }
        .meal-meta {
          margin: 0;
          color: #666;
          font-size: 14px;
        }
        .meal-description {
          margin: 4px 0;
          color: #555;
          font-size: 13px;
          font-style: italic;
        }
        .meal-ingredients {
          margin: 4px 0;
          color: #444;
          font-size: 12px;
        }
        .meal-ingredients strong {
          color: #333;
        }
        .meal-actions-toggle {
          background: #f5f5f5;
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }
        .meal-actions-toggle:hover {
          background: #e0e0e0;
        }
        .meal-actions-panel {
          border-top: 1px solid #e0e0e0;
          padding: 16px;
          background: #fafafa;
        }
        .action-section {
          margin-bottom: 24px;
        }
        .action-section h5 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
        }
        .prompt-container {
          margin-bottom: 12px;
        }
        .adjustment-prompt {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          resize: vertical;
          font-family: inherit;
        }
        .action-buttons {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .modify-button, .alternative-button {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }
        .modify-button {
          background: #28a745;
          color: white;
        }
        .modify-button:hover:not(:disabled) {
          background: #218838;
        }
        .alternative-button {
          background: #007bff;
          color: white;
        }
        .alternative-button:hover:not(:disabled) {
          background: #0056b3;
        }
        .modify-button:disabled, .alternative-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .help-text {
          font-size: 12px;
          color: #666;
          line-height: 1.3;
          margin: 0;
        }
        .generate-alt-button, .bank-button, .use-alt-button {
          background: #007bff;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        .generate-alt-button:hover, .bank-button:hover, .use-alt-button:hover {
          background: #0056b3;
        }
        .generate-alt-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .alternatives-section {
          margin-top: 16px;
        }
        .alternative-option {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-bottom: 8px;
          background: white;
        }
        .alt-info strong {
          display: block;
          margin-bottom: 4px;
        }
        .alt-description {
          margin: 4px 0;
          color: #555;
          font-size: 12px;
          font-style: italic;
        }
        .alt-ingredients {
          margin: 4px 0;
          color: #444;
          font-size: 11px;
        }
        .alt-ingredients strong {
          color: #333;
        }
        .alt-reasoning {
          margin: 4px 0;
          color: #666;
          font-size: 13px;
        }
        .alt-tags {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .tag {
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          color: white;
        }
        .tag.quick { background: #17a2b8; }
        .tag.comfort { background: #ffc107; color: black; }
        .tag.cultural { background: #6f42c1; }
        .tag.veggie { background: #28a745; }
        .bank-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bank-form input {
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .rating-input {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .star {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          opacity: 0.3;
        }
        .star.active {
          opacity: 1;
        }
        .bank-buttons {
          display: flex;
          gap: 8px;
        }
        .confirm-bank {
          background: #28a745;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }
        .cancel-bank {
          background: #6c757d;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}