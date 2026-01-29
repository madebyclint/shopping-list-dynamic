'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WeeklyMealPlan, Meal, DAYS_OF_WEEK } from './meal-planning/types';
import { fetchPlans, fetchPlanDetails, getRainbowCoverage, fetchAIUsageStats } from './meal-planning/utils';
import PlanCreationForm from './meal-planning/PlanCreationForm';
import PlanManagement from './meal-planning/PlanManagement';
import DayCard from './meal-planning/DayCard';
import WeeklyOverview from './meal-planning/WeeklyOverview';
import ProgressOverlay from './ProgressOverlay';
import PantryExtras from './PantryExtras';

interface WeeklyMenusProps {
  initialPlanId?: number;
}

export default function WeeklyMenus({ initialPlanId }: WeeklyMenusProps) {
  const [plans, setPlans] = useState<WeeklyMealPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<WeeklyMealPlan | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [selectedWeekStart, setSelectedWeekStart] = useState('');
  const [aiStats, setAiStats] = useState({ totalCalls: 0, totalTokens: 0, estimatedCost: '0.0000' });
  const [isGeneratingList, setIsGeneratingList] = useState(false);
  const [generatedListId, setGeneratedListId] = useState<number | null>(null);
  const [pantryItems, setPantryItems] = useState<any[]>([]);
  const router = useRouter();

  // Helper functions for ingredient and cost calculations
  const countIngredientsInText = (text: string): number => {
    if (!text) return 0;

    // Split by common separators and count distinct items
    const ingredients = text.split(/[,;]|\band\b/i)
      .map(item => item.trim())
      .filter(item => item.length > 3) // Filter out very short items
      .map(item => item.replace(/^\d+\.?\d*\s*(cups?|lbs?|pounds?|oz|ounces?|tbsp|tablespoons?|tsp|teaspoons?|cloves?|cans?|packages?|heads?|bunches?)?\s*/i, '')) // Remove quantities
      .filter(item => item.length > 0);

    return new Set(ingredients.map(ing => ing.toLowerCase())).size; // Use Set to count unique ingredients
  };

  const getIngredientCount = (meal: Meal): number => {
    if (meal.meal_type !== 'cooking') return 0;
    return countIngredientsInText(meal.main_ingredients || '');
  };

  const getTotalIngredientCount = (meals: Meal[]): number => {
    return meals
      .filter(m => m.meal_type === 'cooking')
      .reduce((total, meal) => total + getIngredientCount(meal), 0);
  };

  const estimateMealCost = (meal: Meal): number => {
    if (meal.meal_type !== 'cooking') return 0;

    const ingredientCount = getIngredientCount(meal);
    // Simple cost estimation: $2.50 per ingredient on average
    return ingredientCount * 2.5;
  };

  const getTotalEstimatedCost = (meals: Meal[]): number => {
    return meals
      .filter(m => m.meal_type === 'cooking')
      .reduce((total, meal) => total + estimateMealCost(meal), 0);
  };

  const getPantryItemsCount = (): number => {
    return pantryItems.length;
  };

  const getPantryEstimatedCost = (): number => {
    return pantryItems.reduce((total, item) => total + (item.estimatedPrice || 0), 0);
  };

  const getTotalCostWithPantry = (meals: Meal[]): number => {
    return getTotalEstimatedCost(meals) + getPantryEstimatedCost();
  };

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    // Handle initial plan ID from URL
    if (initialPlanId && plans.length > 0) {
      const plan = plans.find(p => p.id === initialPlanId);
      if (plan) {
        setCurrentPlan(plan);
        loadPlanDetails(initialPlanId);
      }
    } else if (plans.length > 0 && !currentPlan) {
      setCurrentPlan(plans[0]);
      loadPlanDetails(plans[0].id!);
    }
  }, [initialPlanId, plans, currentPlan]);

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

    // Load pantry items for this plan
    await loadPantryItems(planId);

    // Also load AI usage stats
    const stats = await fetchAIUsageStats();
    setAiStats(stats);
  };

  const loadPantryItems = async (planId: number) => {
    try {
      const response = await fetch(`/api/pantry/${planId}`);
      if (response.ok) {
        const data = await response.json();
        setPantryItems(data.items || []);
      } else {
        setPantryItems([]);
      }
    } catch (error) {
      console.error('Error loading pantry items:', error);
      setPantryItems([]);
    }
  };

  const handlePantryItemsUpdate = async (items: any[], prompt?: string, tokensUsed?: number) => {
    if (!currentPlan?.id) return;

    setPantryItems(items);

    try {
      const response = await fetch(`/api/pantry/${currentPlan.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items, prompt, tokensUsed }),
      });

      if (!response.ok) {
        console.error('Failed to update pantry items');
      }
    } catch (error) {
      console.error('Error updating pantry items:', error);
    }
  };

  const refreshAIStats = async () => {
    const stats = await fetchAIUsageStats();
    setAiStats(stats);
  };

  const updateURL = (planId?: number) => {
    const params = new URLSearchParams();
    params.set('section', 'weeklyMenus');
    if (planId) {
      params.set('planId', planId.toString());
    }
    router.push(`/?${params.toString()}`);
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

  const handleGenerateShoppingList = async (forceNew = true, forceRefresh = false) => {
    if (!currentPlan) return;

    setIsGeneratingList(true);
    try {
      const response = await fetch('/api/lists/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: currentPlan.id,
          forceNew,
          forceRefresh
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('WeeklyMenus: Shopping list generation result:', result);
        setGeneratedListId(result.id);
        console.log('WeeklyMenus: Set generatedListId to:', result.id);

        // Show different feedback for updates vs new lists
        if (result.isUpdate) {
          const { preserved, added, updated } = result.preservationStats;
          alert(`Shopping list updated! 🔄\n\n✅ ${preserved} items preserved (your customizations kept)\n➕ ${added} new items added\n🔄 ${updated} items updated\n\n${result.duplicatesFound > 0 ? `🔍 ${result.duplicatesFound} duplicates checked\n` : ''}🤖 Smart units applied (eggs→doz, etc.)\n🎯 Intelligent consolidation\n\nClick "Go to Shopping List" to review.`);
        } else if (result.duplicatesFound > 0) {
          const duplicateItems = Object.keys(result.similarItems).join(', ');
          alert(`Smart shopping list generated! 🎉\n\n✅ ${result.itemCount} items processed\n🔍 ${result.duplicatesFound} potential duplicates found: ${duplicateItems}\n🤖 Smart units applied (eggs→doz, etc.)\n🎯 Intelligent consolidation\n💰 AI price estimation\n\nClick "Go to Shopping List" to review.`);
        } else {
          alert(`Smart shopping list generated! 🎉\n\n✅ ${result.itemCount} items processed\n🤖 Smart units applied (eggs→doz, etc.)\n🎯 Intelligent consolidation\n💰 AI price estimation\n\nNo duplicates found. Click "Go to Shopping List" to review.`);
        }

        // Auto-navigate to the newly created shopping list
        console.log('WeeklyMenus: Auto-navigating to newly created list:', result.id);
        setTimeout(() => {
          window.location.href = `/?listId=${result.id}`;
        }, 1000);
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

  const handleNewShoppingList = () => {
    if (confirm('Create a completely new shopping list? This will not preserve any existing customizations.')) {
      handleGenerateShoppingList(true, false);
    }
  };

  const handleRefreshCategories = () => {
    if (confirm('Refresh categories for all items using fresh AI processing? This will override any custom categorizations you made.')) {
      handleGenerateShoppingList(false, true);
    }
  };

  const handleGoToShoppingList = () => {
    console.log('WeeklyMenus: handleGoToShoppingList called with generatedListId:', generatedListId);
    if (generatedListId) {
      console.log('WeeklyMenus: Navigating to listId:', generatedListId);
      // Navigate to shopping lists tab with the generated list ID
      window.location.href = `/?listId=${generatedListId}`;
    } else {
      console.warn('WeeklyMenus: No generatedListId available');
    }
  };

  const handlePlanSelect = (planId: string) => {
    const selected = plans.find(p => p.id === parseInt(planId));
    setCurrentPlan(selected || null);
    if (selected?.id) {
      updateURL(selected.id);
      loadPlanDetails(selected.id);
    }
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

      <ProgressOverlay
        isVisible={isGeneratingList}
        message="🤖 AI Chef is cooking up your list..."
        subMessage="Analyzing ingredients • Optimizing quantities • Smart categorizing"
      />

      {currentPlan && (
        <div>
          <WeeklyOverview meals={meals} />

          <div className="plan-summary">
            <h2>{currentPlan.name}</h2>
            <div className="plan-stats">
              <span>🍳 Cooking meals: {meals.filter(m => m.meal_type === 'cooking').length}</span>
              <span>� Total ingredients: {getTotalIngredientCount(meals)}</span>
              <span>🏠 Pantry items: {getPantryItemsCount()}</span>
              <span>🌈 Rainbow coverage: {getRainbowCoverage(meals)}%</span>
              <span>💰 Meal cost: ${getTotalEstimatedCost(meals).toFixed(2)}</span>
              <span>🛒 Pantry cost: ${getPantryEstimatedCost().toFixed(2)}</span>
              <span>💵 Total food cost: ${getTotalCostWithPantry(meals).toFixed(2)}</span>
              <span>🤖 AI cost: ${aiStats.estimatedCost}</span>
            </div>
            <div className="plan-actions">
              <button
                onClick={() => handleGenerateShoppingList(false)}
                disabled={isGeneratingList || meals.filter(m => m.meal_type === 'cooking').length === 0}
                className="generate-shopping-list-button"
              >
                {isGeneratingList ? '🛒 Generating Smart List...' : '🛒 Generate/Update Smart List'}
              </button>

              {!isGeneratingList && (
                <button
                  onClick={handleNewShoppingList}
                  disabled={meals.filter(m => m.meal_type === 'cooking').length === 0}
                  className="generate-shopping-list-button"
                  style={{ background: '#FF9800' }}
                >
                  🗂️ Create New List
                </button>
              )}

              {!isGeneratingList && generatedListId && (
                <button
                  onClick={handleRefreshCategories}
                  className="generate-shopping-list-button"
                  style={{ background: '#9C27B0' }}
                >
                  ⚡ Refresh Categories
                </button>
              )}

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

          <PantryExtras
            planId={currentPlan.id!}
            onItemsGenerated={handlePantryItemsUpdate}
            onStatsUpdate={refreshAIStats}
            existingItems={pantryItems}
          />

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
                  onStatsUpdate={refreshAIStats}
                  allMeals={meals}
                />
              );
            })}
          </div>
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