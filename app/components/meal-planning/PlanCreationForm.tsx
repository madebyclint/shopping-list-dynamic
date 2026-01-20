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
  const handleCreatePlan = async () => {
    const planName = newPlanName.trim() || getDefaultPlanName();
    const weekStart = selectedWeekStart || getWeekStartDate(selectedWeekStart);

    const result = await createMealPlan(planName, weekStart);

    if (result) {
      const newPlan: WeeklyMealPlan = {
        id: result.id,
        name: planName,
        week_start_date: weekStart,
      };

      setCurrentPlan(newPlan);
      await initializeDefaultMeals(result.id);
      setIsCreating(false);
      setNewPlanName('');
      setSelectedWeekStart('');
      onPlanCreated();
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setNewPlanName('');
    setSelectedWeekStart('');
  };

  if (!isCreating) return null;

  return (
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
          value={selectedWeekStart || getWeekStartDate(selectedWeekStart)}
          onChange={(e) => setSelectedWeekStart(e.target.value)}
          className="date-input"
        />
      </div>
      <div className="form-buttons">
        <button onClick={handleCreatePlan} className="create-button">
          Create Plan
        </button>
        <button onClick={handleCancel} className="cancel-button">
          Cancel
        </button>
      </div>
    </div>
  );
}