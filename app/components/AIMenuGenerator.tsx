'use client';

import { useState } from 'react';

interface MenuGenerationResult {
  success: boolean;
  planId?: number;
  meals?: any[];
  message?: string;
  fromCache?: boolean;
  usedFallback?: boolean;
  usageStats?: {
    totalCalls: number;
    totalTokens: number;
  };
  error?: string;
}

export default function AIMenuGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<MenuGenerationResult | null>(null);
  const [weekStartDate, setWeekStartDate] = useState('');
  const [preferences, setPreferences] = useState('');

  const generateMenu = async () => {
    setIsGenerating(true);
    setResult(null);

    try {
      const response = await fetch('/api/menus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weekStartDate,
          preferences: preferences || undefined,
          name: `AI Generated Menu - ${new Date(weekStartDate).toLocaleDateString()}`
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: 'Network error occurred'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getNextSunday = () => {
    const today = new Date();
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + (7 - today.getDay()));
    return nextSunday.toISOString().split('T')[0];
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">AI Menu Generation Engine</h1>

      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-4">Generate Weekly Menu</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Week Start Date (Sunday):
            </label>
            <input
              type="date"
              value={weekStartDate}
              onChange={(e) => setWeekStartDate(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder={getNextSunday()}
            />
            <button
              type="button"
              onClick={() => setWeekStartDate(getNextSunday())}
              className="text-sm text-blue-600 mt-1"
            >
              Use next Sunday
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Additional Preferences (optional):
            </label>
            <textarea
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              className="w-full p-2 border rounded-md h-20"
              placeholder="e.g., No seafood, more vegetarian meals, specific cuisines..."
            />
          </div>

          <button
            onClick={generateMenu}
            disabled={isGenerating || !weekStartDate}
            className={`w-full py-2 px-4 rounded-md font-medium ${isGenerating || !weekStartDate
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
          >
            {isGenerating ? 'Generating Menu...' : 'Generate AI Menu'}
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-white border rounded-lg p-4">
          <div className={`p-3 rounded-md mb-4 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
            <p className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? '✅ Menu Generated Successfully!' : '❌ Generation Failed'}
            </p>
            {result.message && (
              <p className={`text-sm mt-1 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.message}
              </p>
            )}
          </div>

          {result.success && result.meals && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Generated Meal Plan</h3>
              <div className="grid gap-3">
                {result.meals
                  .sort((a, b) => a.day_of_week - b.day_of_week)
                  .map((meal, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                      <div className="flex-1">
                        <p className="font-medium">{meal.title}</p>
                        <p className="text-sm text-gray-600">
                          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][meal.day_of_week]} •
                          {meal.meal_type === 'cooking' ? ' Home Cooked' : meal.meal_type}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {meal.comfort_flag && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Comfort</span>}
                        {meal.shortcut_flag && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Quick</span>}
                        {meal.cultural_riff_flag && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">International</span>}
                        {meal.veggie_inclusion && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Veggies</span>}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {result.success && result.usageStats && (
            <div className="mt-4 p-3 bg-blue-50 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>AI Usage:</strong> {result.usageStats.totalCalls} calls, {result.usageStats.totalTokens} tokens
                {result.fromCache && ' (This result was cached)'}
                {result.usedFallback && ' (Fallback menu used)'}
              </p>
            </div>
          )}

          {result.error && (
            <div className="mt-4 p-3 bg-red-50 rounded-md">
              <p className="text-sm text-red-800">
                <strong>Error:</strong> {result.error}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold mb-2">How it works:</h3>
        <ul className="text-sm space-y-1 text-gray-700">
          <li>• Generates 6 dinners (Mon-Sat) + 1 Sunday breakfast</li>
          <li>• Uses OpenAI GPT-4 with Brooklyn family context</li>
          <li>• Emphasizes budget-friendly, colorful, varied complexity meals</li>
          <li>• Caches results to avoid duplicate AI calls</li>
          <li>• Includes fallback menu if AI fails</li>
          <li>• Tracks AI usage and costs</li>
        </ul>
      </div>
    </div>
  );
}