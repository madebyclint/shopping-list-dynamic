'use client';

import { useState, useEffect } from 'react';

interface FoodGroupData {
  food_group: string;
  total_amount: number;
  item_count: number;
  color?: string;
}

interface StoreSectionData {
  store_section: string;
  total_amount: number;
  item_count: number;
  sort_order: number;
}

interface ExtraPurchaseData {
  item_name: string;
  total_amount: number;
  quantity_purchased: string;
  times_bought_extra: number;
  avg_extra_cost: number;
}

interface SkippedItemData {
  item_name: string;
  category: string;
  times_skipped: number;
  total_missed_value: number;
  most_common_reason: string;
  last_skipped: string;
}

interface BudgetVarianceData {
  shopping_date: string;
  store_name: string;
  planned_total: number;
  actual_total: number;
  budget_variance: number;
  budget_variance_percent: number;
  extra_items_count: number;
  skipped_items_count: number;
}

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
}

export default function AnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState('food-groups');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const [foodGroupData, setFoodGroupData] = useState<FoodGroupData[]>([]);
  const [storeSectionData, setStoreSectionData] = useState<StoreSectionData[]>([]);
  const [extraPurchasesData, setExtraPurchasesData] = useState<ExtraPurchaseData[]>([]);
  const [skippedItemsData, setSkippedItemsData] = useState<SkippedItemData[]>([]);
  const [budgetVarianceData, setBudgetVarianceData] = useState<BudgetVarianceData[]>([]);
  const [pantrySuggestions, setPantrySuggestions] = useState<PantrySuggestion[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load all analytics data
      await Promise.all([
        loadFoodGroupData(),
        loadStoreSectionData(),
        loadExtraPurchasesData(),
        loadSkippedItemsData(),
        loadBudgetVarianceData(),
        loadPantrySuggestions()
      ]);
    } catch (err) {
      setError('Failed to load analytics data');
      console.error('Analytics loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFoodGroupData = async () => {
    const response = await fetch(`/api/analytics/purchases?type=food-groups&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
    if (response.ok) {
      const result = await response.json();
      setFoodGroupData(result.data || []);
    }
  };

  const loadStoreSectionData = async () => {
    const response = await fetch(`/api/analytics/purchases?type=store-sections&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
    if (response.ok) {
      const result = await response.json();
      setStoreSectionData(result.data || []);
    }
  };

  const loadExtraPurchasesData = async () => {
    const response = await fetch(`/api/analytics/purchases?type=extra-purchases&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
    if (response.ok) {
      const result = await response.json();
      setExtraPurchasesData(result.data || []);
    }
  };

  const loadSkippedItemsData = async () => {
    const response = await fetch(`/api/analytics/skipped?type=report&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
    if (response.ok) {
      const result = await response.json();
      setSkippedItemsData(result.data || []);
    }
  };

  const loadBudgetVarianceData = async () => {
    const response = await fetch(`/api/analytics/budget?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
    if (response.ok) {
      const result = await response.json();
      setBudgetVarianceData(result.data || []);
    }
  };

  const loadPantrySuggestions = async () => {
    const response = await fetch('/api/analytics/skipped?type=pantry-suggestions&minScore=60&limit=15');
    if (response.ok) {
      const result = await response.json();
      setPantrySuggestions(result.data || []);
    }
  };

  const updatePantrySuggestions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/analytics/skipped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-suggestions' })
      });

      if (response.ok) {
        await loadPantrySuggestions();
      } else {
        setError('Failed to update pantry suggestions');
      }
    } catch (err) {
      setError('Failed to update pantry suggestions');
      console.error('Update suggestions error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const tabs = [
    { id: 'food-groups', label: 'Food Groups', icon: '🥗' },
    { id: 'store-sections', label: 'Store Sections', icon: '🏪' },
    { id: 'extra-purchases', label: 'Extra Purchases', icon: '🛒' },
    { id: 'skipped-items', label: 'Skipped Items', icon: '⏭️' },
    { id: 'budget-variance', label: 'Budget Tracking', icon: '💰' },
    { id: 'pantry-suggestions', label: 'Pantry Suggestions', icon: '💡' }
  ];

  const renderFoodGroupsTab = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Purchases by Food Group</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {foodGroupData.map((group, index) => (
          <div key={index} className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium" style={{ color: group.color || '#666' }}>
                {group.food_group || 'Uncategorized'}
              </h4>
              <div className="w-4 h-4 rounded" style={{ backgroundColor: group.color || '#ccc' }}></div>
            </div>
            <p className="text-2xl font-bold text-green-600 mb-1">
              {formatCurrency(group.total_amount)}
            </p>
            <p className="text-sm text-gray-600">
              {group.item_count} item{group.item_count !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStoreSectionsTab = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Purchases by Store Section</h3>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount Spent</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg per Item</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {storeSectionData.map((section, index) => (
              <tr key={index}>
                <td className="px-6 py-4 whitespace-nowrap font-medium">
                  {section.store_section || 'Uncategorized'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-green-600 font-semibold">
                  {formatCurrency(section.total_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {section.item_count}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {formatCurrency(section.total_amount / section.item_count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderExtraPurchasesTab = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Extra Purchases Beyond Shopping List</h3>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Spent</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Times Bought Extra</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {extraPurchasesData.map((item, index) => (
              <tr key={index}>
                <td className="px-6 py-4 whitespace-nowrap font-medium">{item.item_name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-red-600 font-semibold">
                  {formatCurrency(item.total_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{item.times_bought_extra}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {formatCurrency(item.avg_extra_cost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSkippedItemsTab = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Frequently Skipped Items</h3>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Times Skipped</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Missed Value</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Common Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {skippedItemsData.map((item, index) => (
              <tr key={index}>
                <td className="px-6 py-4 whitespace-nowrap font-medium">{item.item_name}</td>
                <td className="px-6 py-4 whitespace-nowrap">{item.category}</td>
                <td className="px-6 py-4 whitespace-nowrap text-orange-600 font-semibold">
                  {item.times_skipped}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {formatCurrency(item.total_missed_value)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {item.most_common_reason || 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderBudgetVarianceTab = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Budget Variance Tracking</h3>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Planned</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actual</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Extra Items</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Skipped Items</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {budgetVarianceData.map((trip, index) => (
              <tr key={index}>
                <td className="px-6 py-4 whitespace-nowrap">{formatDate(trip.shopping_date)}</td>
                <td className="px-6 py-4 whitespace-nowrap">{trip.store_name || 'Unknown'}</td>
                <td className="px-6 py-4 whitespace-nowrap">{formatCurrency(trip.planned_total)}</td>
                <td className="px-6 py-4 whitespace-nowrap">{formatCurrency(trip.actual_total)}</td>
                <td className={`px-6 py-4 whitespace-nowrap font-semibold ${trip.budget_variance >= 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                  {trip.budget_variance >= 0 ? '+' : ''}{formatCurrency(trip.budget_variance)}
                  ({trip.budget_variance_percent.toFixed(1)}%)
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{trip.extra_items_count}</td>
                <td className="px-6 py-4 whitespace-nowrap">{trip.skipped_items_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPantrySuggestionsTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Smart Pantry Suggestions</h3>
        <button
          onClick={updatePantrySuggestions}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update Suggestions'}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pantrySuggestions.map((suggestion) => (
          <div key={suggestion.id} className="bg-white p-4 rounded-lg shadow border">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-medium">{suggestion.item_name}</h4>
              <span className={`px-2 py-1 rounded text-xs font-semibold ${suggestion.suggestion_score >= 80 ? 'bg-green-100 text-green-800' :
                  suggestion.suggestion_score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                }`}>
                {suggestion.suggestion_score}%
              </span>
            </div>

            <div className="text-sm text-gray-600 space-y-1">
              <p>Category: {suggestion.category || 'Unknown'}</p>
              <p>Purchased: {suggestion.times_purchased} times</p>
              <p>Skipped: {suggestion.times_skipped} times</p>
              <p>Pattern: {suggestion.frequency_pattern}</p>
              {suggestion.avg_price && (
                <p>Avg Price: {formatCurrency(suggestion.avg_price)}</p>
              )}
              {suggestion.suggested_quantity && (
                <p>Suggested Qty: {suggestion.suggested_quantity}</p>
              )}
            </div>

            <button
              onClick={() => {
                fetch('/api/analytics/skipped', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'mark-added',
                    suggestionId: suggestion.id
                  })
                }).then(() => loadPantrySuggestions());
              }}
              className="mt-3 w-full px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              Add to Pantry
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">Shopping Analytics Dashboard</h1>

        {/* Date Range Selector */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="border rounded px-3 py-2"
              />
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 mt-6"
            >
              {loading ? 'Loading...' : 'Refresh Data'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-96">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-lg">Loading analytics data...</div>
          </div>
        ) : (
          <>
            {activeTab === 'food-groups' && renderFoodGroupsTab()}
            {activeTab === 'store-sections' && renderStoreSectionsTab()}
            {activeTab === 'extra-purchases' && renderExtraPurchasesTab()}
            {activeTab === 'skipped-items' && renderSkippedItemsTab()}
            {activeTab === 'budget-variance' && renderBudgetVarianceTab()}
            {activeTab === 'pantry-suggestions' && renderPantrySuggestionsTab()}
          </>
        )}
      </div>
    </div>
  );
}