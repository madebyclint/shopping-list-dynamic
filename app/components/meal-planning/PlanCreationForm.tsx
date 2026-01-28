import { useState } from 'react';
import { WeeklyMealPlan } from './types';
import { getDefaultPlanName, getWeekStartDate, createMealPlan, initializeDefaultMeals } from './utils';

interface PlanCreationFormProps {
  isCreating: boolean;
  newPlanName: string;
  selectedWeekStart: string;
  setNewPlanName: (name: string) => void;
  setSelectedWeekStart: (date: string) => void;
  setIsCreating: (creating: boolean) => void;
  setCurrentPlan: (plan: WeeklyMealPlan | null) => void;
  onPlanCreated: () => void;
}

export default function PlanCreationForm({
  isCreating,
  newPlanName,
  selectedWeekStart,
  setNewPlanName,
  setSelectedWeekStart,
  setIsCreating,
  setCurrentPlan,
  onPlanCreated
}: PlanCreationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useAI, setUseAI] = useState(true); // Default to AI generation
  const [aiPreferences, setAIPreferences] = useState('');

  const handleCreatePlan = async () => {
    setIsSubmitting(true);
    setError(null);

    console.log('Starting plan creation...');

    try {
      const planName = newPlanName.trim() || getDefaultPlanName();
      const weekStart = selectedWeekStart || getWeekStartDate(selectedWeekStart);

      console.log('Creating plan with:', { planName, weekStart, useAI });

      if (useAI) {
        // Use AI to generate the complete meal plan
        console.log('Generating AI meal plan...');
        const aiResult = await fetch('/api/menus', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            weekStartDate: weekStart,
            preferences: aiPreferences.trim() || undefined,
            name: planName
          }),
        });

        const aiData = await aiResult.json();

        if (aiData.success) {
          const newPlan: WeeklyMealPlan = {
            id: aiData.planId,
            name: planName,
            week_start_date: weekStart,
          };

          setCurrentPlan(newPlan);
          console.log('AI meal plan created successfully:', aiData.message);
        } else {
          throw new Error(aiData.error || 'AI generation failed');
        }
      } else {
        // Use traditional manual plan creation
        const result = await createMealPlan(planName, weekStart);

        console.log('Plan creation result:', result);

        if (result) {
          const newPlan: WeeklyMealPlan = {
            id: result.id,
            name: planName,
            week_start_date: weekStart,
          };

          setCurrentPlan(newPlan);

          console.log('Initializing default meals...');
          await initializeDefaultMeals(result.id);
          console.log('Default meals initialized');
        } else {
          setError('Failed to create meal plan. Please check your database connection.');
          setIsSubmitting(false);
          return;
        }
      }

      setIsCreating(false);
      setNewPlanName('');
      setSelectedWeekStart('');
      setAIPreferences('');
      onPlanCreated();
    } catch (err) {
      console.error('Error in handleCreatePlan:', err);
      setError(`Failed to create meal plan: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    setIsSubmitting(false);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setNewPlanName('');
    setSelectedWeekStart('');
    setAIPreferences('');
    setError(null);
  };

  if (!isCreating) return null;

  return (
    <div className="meal-plan-form">
      <h3>Create New Weekly Plan</h3>
      {error && (
        <div style={{ color: 'red', marginBottom: '10px', fontSize: '14px' }}>
          {error}
        </div>
      )}
      <div className="form-row">
        <input
          type="text"
          placeholder={getDefaultPlanName()}
          value={newPlanName}
          onChange={(e) => setNewPlanName(e.target.value)}
          className="plan-name-input"
          disabled={isSubmitting}
        />
        <input
          type="date"
          value={selectedWeekStart || getWeekStartDate(selectedWeekStart)}
          onChange={(e) => setSelectedWeekStart(e.target.value)}
          className="date-input"
          disabled={isSubmitting}
        />
      </div>

      <div className="form-row ai-options">
        <label className="ai-toggle">
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) => setUseAI(e.target.checked)}
            disabled={isSubmitting}
          />
          <span>🤖 Generate meals with AI</span>
        </label>
      </div>

      {useAI && (
        <div className="form-row ai-preferences">
          <textarea
            placeholder="AI preferences (optional): e.g., 'No seafood, more vegetarian meals, kid-friendly options'"
            value={aiPreferences}
            onChange={(e) => setAIPreferences(e.target.value)}
            className="preferences-input"
            rows={2}
            disabled={isSubmitting}
          />
          <small style={{ color: '#666', fontSize: '12px' }}>
            AI will generate 6 dinners + 1 Sunday breakfast optimized for a Brooklyn family of 4
          </small>
        </div>
      )}
      <div className="form-buttons">
        <button
          onClick={handleCreatePlan}
          className="create-button"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? (useAI ? 'Generating with AI...' : 'Creating...')
            : (useAI ? 'Create AI-Generated Plan' : 'Create Manual Plan')
          }
        </button>
        <button
          onClick={handleCancel}
          className="cancel-button"
          disabled={isSubmitting}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}