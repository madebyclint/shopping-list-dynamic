'use client';

import { useState, useEffect } from 'react';

interface PantrySuggestion {
  id: number;
  item_name: string;
  category?: string;
  times_purchased: number;
  times_skipped: number;
  avg_price?: number;
  suggestion_score: number;
  frequency_pattern: string;
  suggested_quantity?: string;
  food_group_name?: string;
  last_purchased?: string;
}

interface PantryItem {
  id: number;
  name: string;
  category: string;
  current_stock: string;
}

export default function SmartPantryManager() {
  const [suggestions, setSuggestions] = useState<PantrySuggestion[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high-priority' | 'weekly' | 'monthly'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSuggestions(),
        loadPantryItems()
      ]);
    } catch (error) {
      console.error('Failed to load pantry data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async () => {
    const minScore = filter === 'high-priority' ? 80 : 50;
    const response = await fetch(`/api/analytics/skipped?type=pantry-suggestions&minScore=${minScore}&limit=30`);
    if (response.ok) {
      const result = await response.json();
      setSuggestions(result.data || []);
    }
  };

  const loadPantryItems = async () => {
    const response = await fetch('/api/pantry');
    if (response.ok) {
      const result = await response.json();
      setPantryItems(result.items || []);
    }
  };

  const updateSuggestions = async () => {
    setUpdating(true);
    try {
      const response = await fetch('/api/analytics/skipped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-suggestions' })
      });

      if (response.ok) {
        await loadSuggestions();
      }
    } catch (error) {
      console.error('Failed to update suggestions:', error);
    } finally {
      setUpdating(false);
    }
  };

  const addToPantry = async (suggestion: PantrySuggestion) => {
    try {
      // Add to pantry items
      const addResponse = await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: suggestion.item_name,
          category: suggestion.category || 'Other',
          current_stock: suggestion.suggested_quantity || '1 unit',
          low_stock_threshold: '0',
          notes: `Added from smart suggestions (${suggestion.suggestion_score}% confidence)`
        })
      });

      if (addResponse.ok) {
        // Mark suggestion as added
        await fetch('/api/analytics/skipped', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'mark-added',
            suggestionId: suggestion.id
          })
        });

        // Refresh data
        await loadData();
      }
    } catch (error) {
      console.error('Failed to add item to pantry:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getFrequencyIcon = (pattern: string) => {
    switch (pattern) {
      case 'weekly': return '📅';
      case 'biweekly': return '🗓️';
      case 'monthly': return '📆';
      default: return '⏱️';
    }
  };

  const filteredSuggestions = suggestions.filter(suggestion => {
    switch (filter) {
      case 'high-priority':
        return suggestion.suggestion_score >= 80;
      case 'weekly':
        return suggestion.frequency_pattern === 'weekly';
      case 'monthly':
        return suggestion.frequency_pattern === 'monthly';
      default:
        return true;
    }
  });

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Smart Pantry Manager</h1>
          <p className="text-gray-600">AI-powered recommendations based on your shopping patterns</p>
        </div>

        <button
          onClick={updateSuggestions}
          disabled={updating}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {updating ? 'Updating...' : '🔄 Refresh Suggestions'}
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6">
        <div className="flex space-x-2">
          {[
            { id: 'all', label: 'All Suggestions', count: suggestions.length },
            { id: 'high-priority', label: 'High Priority', count: suggestions.filter(s => s.suggestion_score >= 80).length },
            { id: 'weekly', label: 'Weekly Items', count: suggestions.filter(s => s.frequency_pattern === 'weekly').length },
            { id: 'monthly', label: 'Monthly Items', count: suggestions.filter(s => s.frequency_pattern === 'monthly').length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Loading suggestions...</div>
        </div>
      ) : (
        <>
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Total Suggestions</h3>
              <p className="text-2xl font-bold text-blue-600">{suggestions.length}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500 mb-1">High Confidence</h3>
              <p className="text-2xl font-bold text-green-600">
                {suggestions.filter(s => s.suggestion_score >= 80).length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Weekly Items</h3>
              <p className="text-2xl font-bold text-purple-600">
                {suggestions.filter(s => s.frequency_pattern === 'weekly').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Current Pantry</h3>
              <p className="text-2xl font-bold text-orange-600">{pantryItems.length}</p>
            </div>
          </div>

          {/* Suggestions Grid */}
          {filteredSuggestions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500 text-lg mb-4">No suggestions found for this filter.</p>
              <button
                onClick={() => setFilter('all')}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                View All Suggestions
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredSuggestions.map((suggestion) => {
                // Check if already in pantry
                const inPantry = pantryItems.some(item =>
                  item.name.toLowerCase().includes(suggestion.item_name.toLowerCase()) ||
                  suggestion.item_name.toLowerCase().includes(item.name.toLowerCase())
                );

                return (
                  <div key={suggestion.id} className="bg-white p-6 rounded-lg shadow border hover:shadow-lg transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-semibold text-lg">{suggestion.item_name}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getScoreColor(suggestion.suggestion_score)}`}>
                        {suggestion.suggestion_score}%
                      </span>
                    </div>

                    <div className="text-sm text-gray-600 space-y-2 mb-4">
                      <div className="flex justify-between">
                        <span>Category:</span>
                        <span className="font-medium">{suggestion.category || 'Unknown'}</span>
                      </div>

                      <div className="flex justify-between">
                        <span>Purchased:</span>
                        <span className="font-medium text-green-600">{suggestion.times_purchased}x</span>
                      </div>

                      <div className="flex justify-between">
                        <span>Skipped:</span>
                        <span className="font-medium text-red-600">{suggestion.times_skipped}x</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span>Pattern:</span>
                        <span className="font-medium flex items-center">
                          {getFrequencyIcon(suggestion.frequency_pattern)} {suggestion.frequency_pattern}
                        </span>
                      </div>

                      {suggestion.avg_price && (
                        <div className="flex justify-between">
                          <span>Avg Price:</span>
                          <span className="font-medium">{formatCurrency(suggestion.avg_price)}</span>
                        </div>
                      )}

                      <div className="flex justify-between">
                        <span>Last Bought:</span>
                        <span className="font-medium">{formatDate(suggestion.last_purchased)}</span>
                      </div>

                      {suggestion.suggested_quantity && (
                        <div className="flex justify-between">
                          <span>Suggested Qty:</span>
                          <span className="font-medium">{suggestion.suggested_quantity}</span>
                        </div>
                      )}
                    </div>

                    {inPantry ? (
                      <div className="w-full px-3 py-2 bg-gray-100 text-gray-600 rounded text-sm text-center">
                        ✓ Already in Pantry
                      </div>
                    ) : (
                      <button
                        onClick={() => addToPantry(suggestion)}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                      >
                        📦 Add to Pantry
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}