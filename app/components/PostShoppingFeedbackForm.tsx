'use client';

import React, { useState, useEffect } from 'react';

interface PostShoppingFeedbackFormProps {
  groceryListId: number;
  receiptItems: ReceiptItem[];
  plannedItems: ShoppingListItem[];
  onSubmitSuccess: (feedbackId: string) => void;
  onSubmitError: (error: string) => void;
}

interface ReceiptItem {
  id: string;
  productName: string;
  totalPrice: number;
  quantity: number;
  matchedToPlanned?: boolean;
}

interface ShoppingListItem {
  id: string;
  name: string;
  estimatedPrice: number;
  quantity: number;
  checked: boolean;
}

interface MealInfo {
  id: string;
  name: string;
  estimatedCost: number;
}

interface FeedbackData {
  overShoppingItems: {
    itemId: string;
    reason: string;
    notes: string;
  }[];
  mealPlanningFeedback: {
    plannedTooManyMeals: boolean;
    plannedTooFewMeals: boolean;
    difficultyLevel: number;
    varietyRating: number;
    notes: string;
  };
  mealSpecificFeedback: {
    mealId: string;
    notes: string;
    learnedTip: string;
    costAdjustment: number;
    wouldMakeAgain: boolean;
  }[];
  costFeedback: {
    expectedTotal: number;
    actualTotal: number;
    unexpectedExpenses: {
      itemName: string;
      amount: number;
      reason: string;
    }[];
  };
  overallRating: number;
  improvementSuggestions: string;
}

export default function PostShoppingFeedbackForm({
  groceryListId,
  receiptItems,
  plannedItems,
  onSubmitSuccess,
  onSubmitError
}: PostShoppingFeedbackFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackData, setFeedbackData] = useState<FeedbackData>({
    overShoppingItems: [],
    mealPlanningFeedback: {
      plannedTooManyMeals: false,
      plannedTooFewMeals: false,
      difficultyLevel: 3,
      varietyRating: 3,
      notes: ''
    },
    mealSpecificFeedback: [],
    costFeedback: {
      expectedTotal: plannedItems.reduce((sum, item) => sum + item.estimatedPrice, 0),
      actualTotal: receiptItems.reduce((sum, item) => sum + item.totalPrice, 0),
      unexpectedExpenses: []
    },
    overallRating: 4,
    improvementSuggestions: ''
  });

  const extraItems = receiptItems.filter(item => !item.matchedToPlanned);
  const steps = [
    'Over-Shopping Review',
    'Meal Planning Feedback', 
    'Meal-Specific Notes',
    'Cost Analysis',
    'Overall Feedback'
  ];

  const updateFeedbackData = (section: keyof FeedbackData, data: any) => {
    setFeedbackData(prev => ({
      ...prev,
      [section]: data
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grocery_list_id: groceryListId,
          overall_rating: feedbackData.overallRating,
          time_spent: 30, // Default time
          budget_adherence: 3, // Default budget rating
          items_forgotten: extraItems.length,
          categories: [] // We'll enhance this later
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit feedback');
      }

      const result = await response.json();
      onSubmitSuccess(result.feedbackId);

    } catch (error) {
      onSubmitError(error instanceof Error ? error.message : 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const renderOverShoppingStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Items You Didn't Need</h3>
      <p className="text-sm text-gray-600">
        Mark any items you purchased that weren't planned or necessary
      </p>

      {extraItems.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>Great job! No extra items detected.</p>
        </div>
      )}

      {extraItems.map((item) => {
        const feedback = feedbackData.overShoppingItems.find(f => f.itemId === item.id);
        const isMarked = !!feedback;

        return (
          <div key={item.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{item.productName}</span>
                <span className="text-sm text-gray-500 ml-2">${item.totalPrice.toFixed(2)}</span>
              </div>
              <button
                onClick={() => {
                  if (isMarked) {
                    updateFeedbackData('overShoppingItems', 
                      feedbackData.overShoppingItems.filter(f => f.itemId !== item.id)
                    );
                  } else {
                    updateFeedbackData('overShoppingItems', [
                      ...feedbackData.overShoppingItems,
                      { itemId: item.id, reason: 'impulse', notes: '' }
                    ]);
                  }
                }}
                className={`px-3 py-1 rounded text-sm ${
                  isMarked 
                    ? 'bg-red-100 text-red-700 border border-red-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {isMarked ? 'Didn\'t Need' : 'Mark as Extra'}
              </button>
            </div>

            {isMarked && (
              <div className="space-y-2 bg-red-50 p-3 rounded">
                <select
                  value={feedback.reason}
                  onChange={(e) => {
                    const newItems = feedbackData.overShoppingItems.map(f =>
                      f.itemId === item.id ? { ...f, reason: e.target.value } : f
                    );
                    updateFeedbackData('overShoppingItems', newItems);
                  }}
                  className="w-full p-2 border border-red-200 rounded text-sm"
                >
                  <option value="impulse">Impulse purchase</option>
                  <option value="already_had">Already had at home</option>
                  <option value="wrong_size">Wrong size/quantity</option>
                  <option value="duplicate">Duplicate item</option>
                  <option value="other">Other reason</option>
                </select>
                <textarea
                  placeholder="Notes (optional)"
                  value={feedback.notes}
                  onChange={(e) => {
                    const newItems = feedbackData.overShoppingItems.map(f =>
                      f.itemId === item.id ? { ...f, notes: e.target.value } : f
                    );
                    updateFeedbackData('overShoppingItems', newItems);
                  }}
                  className="w-full p-2 border border-red-200 rounded text-sm"
                  rows={2}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderMealPlanningStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Meal Planning Feedback</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={feedbackData.mealPlanningFeedback.plannedTooManyMeals}
            onChange={(e) => updateFeedbackData('mealPlanningFeedback', {
              ...feedbackData.mealPlanningFeedback,
              plannedTooManyMeals: e.target.checked
            })}
            className="rounded"
          />
          <span>Planned too many meals</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={feedbackData.mealPlanningFeedback.plannedTooFewMeals}
            onChange={(e) => updateFeedbackData('mealPlanningFeedback', {
              ...feedbackData.mealPlanningFeedback,
              plannedTooFewMeals: e.target.checked
            })}
            className="rounded"
          />
          <span>Planned too few meals</span>
        </label>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Meal Difficulty Rating: {feedbackData.mealPlanningFeedback.difficultyLevel}/5
          </label>
          <input
            type="range"
            min="1"
            max="5"
            value={feedbackData.mealPlanningFeedback.difficultyLevel}
            onChange={(e) => updateFeedbackData('mealPlanningFeedback', {
              ...feedbackData.mealPlanningFeedback,
              difficultyLevel: parseInt(e.target.value)
            })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Too Easy</span>
            <span>Just Right</span>
            <span>Too Hard</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Meal Variety Rating: {feedbackData.mealPlanningFeedback.varietyRating}/5
          </label>
          <input
            type="range"
            min="1"
            max="5"
            value={feedbackData.mealPlanningFeedback.varietyRating}
            onChange={(e) => updateFeedbackData('mealPlanningFeedback', {
              ...feedbackData.mealPlanningFeedback,
              varietyRating: parseInt(e.target.value)
            })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Too Repetitive</span>
            <span>Good Mix</span>
            <span>Too Varied</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Additional Notes
          </label>
          <textarea
            value={feedbackData.mealPlanningFeedback.notes}
            onChange={(e) => updateFeedbackData('mealPlanningFeedback', {
              ...feedbackData.mealPlanningFeedback,
              notes: e.target.value
            })}
            placeholder="Any other feedback about meal planning..."
            className="w-full p-3 border border-gray-300 rounded-md"
            rows={3}
          />
        </div>
      </div>
    </div>
  );

  const renderMealSpecificStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Meal-Specific Notes</h3>
      <p className="text-sm text-gray-600">
        Add notes about specific meals to improve future planning
      </p>

      {plannedMeals.map((meal, index) => {
        const feedback = feedbackData.mealSpecificFeedback[index];
        return (
          <div key={meal.id} className="border rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-gray-900">{meal.name}</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cost Adjustment
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={feedback.costAdjustment}
                  onChange={(e) => {
                    const newFeedback = [...feedbackData.mealSpecificFeedback];
                    newFeedback[index] = {
                      ...feedback,
                      costAdjustment: parseFloat(e.target.value) || 0
                    };
                    updateFeedbackData('mealSpecificFeedback', newFeedback);
                  }}
                  className="w-full p-2 border border-gray-300 rounded"
                  placeholder="± 0.00"
                />
              </div>

              <div className="flex items-center">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={feedback.wouldMakeAgain}
                    onChange={(e) => {
                      const newFeedback = [...feedbackData.mealSpecificFeedback];
                      newFeedback[index] = {
                        ...feedback,
                        wouldMakeAgain: e.target.checked
                      };
                      updateFeedbackData('mealSpecificFeedback', newFeedback);
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">Would make again</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Learned Tip or Improvement
              </label>
              <textarea
                value={feedback.learnedTip}
                onChange={(e) => {
                  const newFeedback = [...feedbackData.mealSpecificFeedback];
                  newFeedback[index] = {
                    ...feedback,
                    learnedTip: e.target.value
                  };
                  updateFeedbackData('mealSpecificFeedback', newFeedback);
                }}
                placeholder="e.g., 'Always buy frozen pizza + toppings instead of from scratch'"
                className="w-full p-2 border border-gray-300 rounded"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                General Notes
              </label>
              <textarea
                value={feedback.notes}
                onChange={(e) => {
                  const newFeedback = [...feedbackData.mealSpecificFeedback];
                  newFeedback[index] = {
                    ...feedback,
                    notes: e.target.value
                  };
                  updateFeedbackData('mealSpecificFeedback', newFeedback);
                }}
                placeholder="Any other notes about this meal..."
                className="w-full p-2 border border-gray-300 rounded"
                rows={2}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderCostAnalysisStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Cost Analysis</h3>
      
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Planned Total:</span>
            <span className="ml-2">${feedbackData.costFeedback.expectedTotal.toFixed(2)}</span>
          </div>
          <div>
            <span className="font-medium">Actual Total:</span>
            <span className="ml-2">${feedbackData.costFeedback.actualTotal.toFixed(2)}</span>
          </div>
          <div className="col-span-2">
            <span className="font-medium">Variance:</span>
            <span className={`ml-2 ${
              feedbackData.costFeedback.actualTotal > feedbackData.costFeedback.expectedTotal
                ? 'text-red-600'
                : 'text-green-600'
            }`}>
              ${(feedbackData.costFeedback.actualTotal - feedbackData.costFeedback.expectedTotal).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-medium text-gray-900 mb-2">Unexpected Expenses</h4>
        <p className="text-sm text-gray-600 mb-3">
          Add items that significantly impacted your budget beyond the plan
        </p>

        {feedbackData.costFeedback.unexpectedExpenses.map((expense, index) => (
          <div key={index} className="grid grid-cols-3 gap-2 mb-2">
            <input
              type="text"
              placeholder="Item name"
              value={expense.itemName}
              onChange={(e) => {
                const newExpenses = [...feedbackData.costFeedback.unexpectedExpenses];
                newExpenses[index] = { ...expense, itemName: e.target.value };
                updateFeedbackData('costFeedback', {
                  ...feedbackData.costFeedback,
                  unexpectedExpenses: newExpenses
                });
              }}
              className="p-2 border border-gray-300 rounded text-sm"
            />
            <input
              type="number"
              step="0.01"
              placeholder="$0.00"
              value={expense.amount}
              onChange={(e) => {
                const newExpenses = [...feedbackData.costFeedback.unexpectedExpenses];
                newExpenses[index] = { ...expense, amount: parseFloat(e.target.value) || 0 };
                updateFeedbackData('costFeedback', {
                  ...feedbackData.costFeedback,
                  unexpectedExpenses: newExpenses
                });
              }}
              className="p-2 border border-gray-300 rounded text-sm"
            />
            <input
              type="text"
              placeholder="Reason"
              value={expense.reason}
              onChange={(e) => {
                const newExpenses = [...feedbackData.costFeedback.unexpectedExpenses];
                newExpenses[index] = { ...expense, reason: e.target.value };
                updateFeedbackData('costFeedback', {
                  ...feedbackData.costFeedback,
                  unexpectedExpenses: newExpenses
                });
              }}
              className="p-2 border border-gray-300 rounded text-sm"
            />
          </div>
        ))}

        <button
          onClick={() => {
            updateFeedbackData('costFeedback', {
              ...feedbackData.costFeedback,
              unexpectedExpenses: [
                ...feedbackData.costFeedback.unexpectedExpenses,
                { itemName: '', amount: 0, reason: '' }
              ]
            });
          }}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          + Add unexpected expense
        </button>
      </div>
    </div>
  );

  const renderOverallStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Overall Feedback</h3>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Overall Shopping Experience: {feedbackData.overallRating}/5
        </label>
        <input
          type="range"
          min="1"
          max="5"
          value={feedbackData.overallRating}
          onChange={(e) => updateFeedbackData('overallRating', parseInt(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Poor</span>
          <span>Good</span>
          <span>Excellent</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          How can we improve your meal planning and shopping experience?
        </label>
        <textarea
          value={feedbackData.improvementSuggestions}
          onChange={(e) => updateFeedbackData('improvementSuggestions', e.target.value)}
          placeholder="Share your ideas for improvements..."
          className="w-full p-3 border border-gray-300 rounded-md"
          rows={4}
        />
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          {steps.map((step, index) => (
            <div
              key={step}
              className={`text-xs font-medium ${
                index <= currentStep ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              {step}
            </div>
          ))}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        {currentStep === 0 && renderOverShoppingStep()}
        {currentStep === 1 && renderMealPlanningStep()}
        {currentStep === 2 && renderMealSpecificStep()}
        {currentStep === 3 && renderCostAnalysisStep()}
        {currentStep === 4 && renderOverallStep()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md disabled:opacity-50 hover:bg-gray-200"
        >
          Previous
        </button>

        {currentStep < steps.length - 1 ? (
          <button
            onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-md disabled:opacity-50 hover:bg-green-700"
          >
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        )}
      </div>
    </div>
  );
}