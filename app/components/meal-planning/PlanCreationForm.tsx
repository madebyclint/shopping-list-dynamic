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

  const handleCreatePlan = async () => {
    setIsSubmitting(true);
    setError(null);

    console.log('Starting plan creation...');

    try {
      const planName = newPlanName.trim() || getDefaultPlanName();
      const weekStart = selectedWeekStart || getWeekStartDate(selectedWeekStart);

      console.log('Creating plan with:', { planName, weekStart });

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

        setIsCreating(false);
        setNewPlanName('');
        setSelectedWeekStart('');
        onPlanCreated();
      } else {
        setError('Failed to create meal plan. Please check your database connection.');
      }
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
      <div className="form-buttons">
        <button
          onClick={handleCreatePlan}
          className="create-button"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Plan'}
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