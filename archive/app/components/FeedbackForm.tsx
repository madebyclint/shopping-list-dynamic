'use client';

import React, { useState } from 'react';

interface AnalysisResult {
  totalPlanned: number;
  totalActual: number;
  budgetVariance: number;
  itemsMatched: number;
  itemsMissed: number;
  extraItems: number;
  categoryBreakdown: Array<{
    category: string;
    planned: number;
    actual: number;
    variance: number;
  }>;
}

interface FeedbackFormProps {
  groceryListId: number;
  analysisData: AnalysisResult;
  onSubmit: () => void;
}

interface CategoryFeedback {
  name: string;
  found_easily: number;
  price_satisfaction: number;
  availability_rating: number;
}

const FeedbackForm: React.FC<FeedbackFormProps> = ({ groceryListId, analysisData, onSubmit }) => {
  const [overallRating, setOverallRating] = useState(5);
  const [timeSpent, setTimeSpent] = useState(30);
  const [budgetAdherence, setBudgetAdherence] = useState(3);
  const [itemsForgotten, setItemsForgotten] = useState(0);
  const [categoryFeedback, setCategoryFeedback] = useState<CategoryFeedback[]>(
    analysisData.categoryBreakdown.map(cat => ({
      name: cat.category,
      found_easily: 3,
      price_satisfaction: 3,
      availability_rating: 3
    }))
  );
  const [submitting, setSubmitting] = useState(false);

  const updateCategoryFeedback = (index: number, field: keyof CategoryFeedback, value: number) => {
    const updated = [...categoryFeedback];
    updated[index] = { ...updated[index], [field]: value };
    setCategoryFeedback(updated);
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grocery_list_id: groceryListId,
          overall_rating: overallRating,
          time_spent: timeSpent,
          budget_adherence: budgetAdherence,
          items_forgotten: itemsForgotten,
          categories: categoryFeedback
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      onSubmit();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const StarRating: React.FC<{ value: number; onChange: (value: number) => void; max?: number }> = ({ 
    value, 
    onChange, 
    max = 5 
  }) => (
    <div className="flex space-x-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-2xl ${star <= value ? 'text-yellow-400' : 'text-gray-300'}`}
        >
          ★
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Shopping Experience Feedback</h2>
      
      {/* Overall Rating */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Overall Shopping Experience
        </label>
        <StarRating value={overallRating} onChange={setOverallRating} />
        <p className="text-sm text-gray-500 mt-1">
          Rate your overall satisfaction with this shopping trip
        </p>
      </div>

      {/* Time Spent */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Time Spent Shopping (minutes)
        </label>
        <input
          type="number"
          min="5"
          max="300"
          value={timeSpent}
          onChange={(e) => setTimeSpent(parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Budget Adherence */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Budget Adherence
        </label>
        <StarRating value={budgetAdherence} onChange={setBudgetAdherence} />
        <p className="text-sm text-gray-500 mt-1">
          How well did you stick to your planned budget?
        </p>
        <div className="mt-2 p-3 bg-gray-50 rounded">
          <p className="text-sm">
            Planned: ${analysisData.totalPlanned.toFixed(2)} | 
            Actual: ${analysisData.totalActual.toFixed(2)} | 
            <span className={analysisData.budgetVariance > 0 ? 'text-red-600' : 'text-green-600'}>
              {analysisData.budgetVariance > 0 ? '+' : ''}${analysisData.budgetVariance.toFixed(2)}
            </span>
          </p>
        </div>
      </div>

      {/* Items Forgotten */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Items Forgotten
        </label>
        <input
          type="number"
          min="0"
          max="50"
          value={itemsForgotten}
          onChange={(e) => setItemsForgotten(parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-sm text-gray-500 mt-1">
          How many items did you forget to buy that were on your list?
        </p>
      </div>

      {/* Category-specific Feedback */}
      <div className="mb-8">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Category Experience</h3>
        {categoryFeedback.map((category, index) => (
          <div key={category.name} className="mb-4 p-4 border border-gray-200 rounded-lg">
            <h4 className="font-medium text-gray-700 mb-3">{category.name}</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Found Easily
                </label>
                <StarRating
                  value={category.found_easily}
                  onChange={(value) => updateCategoryFeedback(index, 'found_easily', value)}
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Price Satisfaction
                </label>
                <StarRating
                  value={category.price_satisfaction}
                  onChange={(value) => updateCategoryFeedback(index, 'price_satisfaction', value)}
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Availability
                </label>
                <StarRating
                  value={category.availability_rating}
                  onChange={(value) => updateCategoryFeedback(index, 'availability_rating', value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </div>
  );
};

export default FeedbackForm;