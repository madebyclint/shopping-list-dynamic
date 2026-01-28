'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WeeklyMealPlan, Meal, DAYS_OF_WEEK } from './meal-planning/types';
import { fetchPlans, fetchPlanDetails, getRainbowCoverage, fetchAIUsageStats } from './meal-planning/utils';
import PlanCreationForm from './meal-planning/PlanCreationForm';
import PlanManagement from './meal-planning/PlanManagement';
import DayCard from './meal-planning/DayCard';
import WeeklyOverview from './meal-planning/WeeklyOverview';

export default function WeeklyMenus() {
  const [plans, setPlans] = useState<WeeklyMealPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<WeeklyMealPlan | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [selectedWeekStart, setSelectedWeekStart] = useState('');
  const [aiStats, setAiStats] = useState({ totalCalls: 0, totalTokens: 0, estimatedCost: '0.0000' });
  const [isGeneratingList, setIsGeneratingList] = useState(false);
  const [generatedListId, setGeneratedListId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (currentPlan) {
      loadPlanDetails(currentPlan.id!);
      setGeneratedListId(null); // Reset when switching plans
    }
  }, [currentPlan]);

  const loadPlans = async () => {
    const planData = await fetchPlans();
    setPlans(planData);
  };

  const loadPlanDetails = async (planId: number) => {
    const mealData = await fetchPlanDetails(planId);
    setMeals(mealData);

    // Also load AI usage stats
    const stats = await fetchAIUsageStats();
    setAiStats(stats);
  };

  const handlePlanCreated = () => {
    loadPlans();
  };

  const handlePlanUpdate = () => {
    loadPlans();
    if (currentPlan) {
      loadPlanDetails(currentPlan.id!);
    }
  };

  const handleGenerateShoppingList = async () => {
    if (!currentPlan) return;

    setIsGeneratingList(true);
    try {
      const response = await fetch('/api/lists/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId: currentPlan.id }),
      });

      if (response.ok) {
        const result = await response.json();
        setGeneratedListId(result.id);
        // Store the list ID for the "Go to Shopping List" button
        // The actual navigation will happen when user clicks the button
      } else {
        console.error('Failed to generate shopping list');
        alert('Failed to generate shopping list. Please try again.');
      }
    } catch (error) {
      console.error('Error generating shopping list:', error);
      alert('Error generating shopping list. Please try again.');
    } finally {
      setIsGeneratingList(false);
    }
  };

  const handleGoToShoppingList = () => {
    if (generatedListId) {
      // Navigate to shopping lists tab with the generated list ID
      window.location.href = `/?listId=${generatedListId}`;
    }
  };

  const handlePlanSelect = (planId: string) => {
    const selected = plans.find(p => p.id === parseInt(planId));
    setCurrentPlan(selected || null);
  };

  return (
    <div className="content-section">
      <div className="shopping-lists-header">
        <h1>Weekly Meal Planning</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="edit-button"
        >
          Create New Plan
        </button>
      </div>

      <PlanCreationForm
        isCreating={isCreating}
        newPlanName={newPlanName}
        selectedWeekStart={selectedWeekStart}
        setNewPlanName={setNewPlanName}
        setSelectedWeekStart={setSelectedWeekStart}
        setIsCreating={setIsCreating}
        setCurrentPlan={setCurrentPlan}
        onPlanCreated={handlePlanCreated}
      />

      <PlanManagement
        currentPlan={currentPlan}
        setCurrentPlan={setCurrentPlan}
        onPlanUpdate={handlePlanUpdate}
      />

      {plans.length > 0 && (
        <div className="list-selector">
          <h3>Quick Plan Selector:</h3>
          <select
            value={currentPlan?.id || ''}
            onChange={(e) => handlePlanSelect(e.target.value)}
          >
            <option value="">Choose a meal plan...</option>
            {plans.map(plan => (
              <option key={plan.id} value={plan.id}>
                {plan.name} - {new Date(plan.week_start_date).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      )}

      {currentPlan && (
        <div>
          <div className="plan-summary">
            <h2>{currentPlan.name}</h2>
            <div className="plan-stats">
              <span>🍳 Cooking meals: {meals.filter(m => m.meal_type === 'cooking').length}</span>
              <span>🥕 Rainbow coverage: {getRainbowCoverage(meals)}%</span>
              <span>🤖 AI generations: {aiStats.totalCalls}</span>
              <span>💰 Total cost: ${aiStats.estimatedCost}</span>
            </div>
            <div className="plan-actions">
              <button
                onClick={handleGenerateShoppingList}
                disabled={isGeneratingList || generatedListId !== null || meals.filter(m => m.meal_type === 'cooking').length === 0}
                className="generate-shopping-list-button"
              >
                {isGeneratingList ? '🛒 Generating...' : '🛒 Generate Shopping List'}
              </button>
              {generatedListId && (
                <button
                  onClick={handleGoToShoppingList}
                  className="go-to-shopping-list-button"
                >
                  📋 Go to Shopping List
                </button>
              )}
            </div>
          </div>

          <div className="week-grid">
            {DAYS_OF_WEEK.map((day, dayIndex) => {
              const dayMeal = meals.find(m => m.day_of_week === dayIndex);

              return (
                <DayCard
                  key={day}
                  day={day}
                  dayIndex={dayIndex}
                  meal={dayMeal}
                  onMealUpdate={setMeals}
                  allMeals={meals}
                />
              );
            })}
          </div>

          <WeeklyOverview meals={meals} />
        </div>
      )}

      {plans.length === 0 && !isCreating && (
        <div className="empty-state">
          <h2>Get Started with Weekly Meal Planning</h2>
          <p>
            Create your first weekly meal plan to reduce decision fatigue and plan realistic weekly menus.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="create-first-plan-button"
          >
            Create Your First Plan
          </button>
        </div>
      )}
    </div>
  );
}