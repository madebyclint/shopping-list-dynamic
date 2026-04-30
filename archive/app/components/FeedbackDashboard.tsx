'use client';

import React, { useState, useEffect } from 'react';

interface FeedbackDashboardProps {
  familyId: string;
  userId: string;
}

interface ShoppingEfficiencyData {
  period: string;
  shoppingEfficiency: number;
  costAccuracy: number;
  totalSessions: number;
  totalSpent: number;
}

interface FrequentItem {
  name: string;
  category: string;
  timesOverPurchased: number;
  timesMissed: number;
  avgCostVariance: number;
  purchaseEfficiency: number;
}

interface LearningInsight {
  type: 'meal_tip' | 'cost_saving' | 'efficiency';
  title: string;
  description: string;
  impact: string;
  date: string;
}

export default function FeedbackDashboard({ familyId, userId }: FeedbackDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'30d' | '90d' | '6m'>('30d');
  const [dashboardData, setDashboardData] = useState<{
    efficiency: ShoppingEfficiencyData[];
    frequentItems: FrequentItem[];
    insights: LearningInsight[];
    summary: {
      totalSessions: number;
      avgEfficiency: number;
      avgCostAccuracy: number;
      totalSavings: number;
      feedbackCount: number;
    };
  } | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [timeRange, familyId]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load efficiency trends
      const efficiencyResponse = await fetch(
        `/api/analytics/shopping-efficiency?familyId=${familyId}&range=${timeRange}`
      );
      const efficiencyData = await efficiencyResponse.json();

      // Load frequent items patterns
      const itemsResponse = await fetch(
        `/api/analytics/item-patterns?familyId=${familyId}&range=${timeRange}`
      );
      const itemsData = await itemsResponse.json();

      // Load learning insights
      const insightsResponse = await fetch(
        `/api/analytics/learning-insights?familyId=${familyId}&range=${timeRange}`
      );
      const insightsData = await insightsResponse.json();

      setDashboardData({
        efficiency: efficiencyData.trends || [],
        frequentItems: itemsData.items || [],
        insights: insightsData.insights || [],
        summary: {
          totalSessions: efficiencyData.summary?.totalSessions || 0,
          avgEfficiency: efficiencyData.summary?.avgEfficiency || 0,
          avgCostAccuracy: efficiencyData.summary?.avgCostAccuracy || 0,
          totalSavings: efficiencyData.summary?.totalSavings || 0,
          feedbackCount: insightsData.summary?.feedbackCount || 0
        }
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderSummaryCards = () => {
    if (!dashboardData) return null;

    const { summary } = dashboardData;

    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-sm font-medium text-blue-600">Shopping Efficiency</div>
          <div className="text-2xl font-bold text-blue-900">
            {summary.avgEfficiency.toFixed(0)}%
          </div>
          <div className="text-xs text-blue-600">
            {summary.totalSessions} trips tracked
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-sm font-medium text-green-600">Cost Accuracy</div>
          <div className="text-2xl font-bold text-green-900">
            {summary.avgCostAccuracy.toFixed(0)}%
          </div>
          <div className="text-xs text-green-600">
            Average budget accuracy
          </div>
        </div>

        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-sm font-medium text-purple-600">Total Savings</div>
          <div className="text-2xl font-bold text-purple-900">
            ${Math.abs(summary.totalSavings).toFixed(0)}
          </div>
          <div className="text-xs text-purple-600">
            {summary.totalSavings >= 0 ? 'Saved' : 'Over budget'}
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg p-4">
          <div className="text-sm font-medium text-orange-600">Learning Insights</div>
          <div className="text-2xl font-bold text-orange-900">
            {summary.feedbackCount}
          </div>
          <div className="text-xs text-orange-600">
            Feedback sessions
          </div>
        </div>
      </div>
    );
  };

  const renderEfficiencyTrend = () => {
    if (!dashboardData?.efficiency.length) return null;

    return (
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Shopping Efficiency Trends</h3>
        
        <div className="space-y-4">
          {dashboardData.efficiency.map((period, index) => (
            <div key={period.period} className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{period.period}</div>
                <div className="text-xs text-gray-500">
                  {period.totalSessions} trips • ${period.totalSpent.toFixed(0)} spent
                </div>
              </div>
              
              <div className="flex space-x-4">
                <div className="text-center">
                  <div className="text-sm font-medium text-gray-900">
                    {period.shoppingEfficiency.toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">Efficiency</div>
                </div>
                
                <div className="text-center">
                  <div className="text-sm font-medium text-gray-900">
                    {period.costAccuracy.toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">Cost Accuracy</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFrequentItems = () => {
    if (!dashboardData?.frequentItems.length) return null;

    return (
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Frequently Over/Under-Purchased Items</h3>
        
        <div className="space-y-3">
          {dashboardData.frequentItems.slice(0, 10).map((item, index) => {
            const isProblematic = item.timesOverPurchased > 2 || item.timesMissed > 2;
            
            return (
              <div key={index} className={`p-3 rounded-lg border ${
                isProblematic ? 'border-red-200 bg-red-50' : 'border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-gray-900">{item.name}</span>
                    <span className="text-xs text-gray-500 ml-2">({item.category})</span>
                  </div>
                  <div className="text-sm font-medium">
                    {item.purchaseEfficiency.toFixed(0)}% efficiency
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-red-600">Over-purchased:</span>
                    <span className="ml-1 font-medium">{item.timesOverPurchased}x</span>
                  </div>
                  <div>
                    <span className="text-orange-600">Missed:</span>
                    <span className="ml-1 font-medium">{item.timesMissed}x</span>
                  </div>
                  <div>
                    <span className="text-blue-600">Avg variance:</span>
                    <span className={`ml-1 font-medium ${
                      item.avgCostVariance > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      ${item.avgCostVariance.toFixed(2)}
                    </span>
                  </div>
                </div>
                
                {isProblematic && (
                  <div className="mt-2 text-xs text-red-600">
                    💡 Consider adjusting your planning for this item
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderLearningInsights = () => {
    if (!dashboardData?.insights.length) return null;

    const groupedInsights = dashboardData.insights.reduce((acc, insight) => {
      if (!acc[insight.type]) acc[insight.type] = [];
      acc[insight.type].push(insight);
      return acc;
    }, {} as Record<string, LearningInsight[]>);

    return (
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Learning Insights</h3>
        
        <div className="space-y-4">
          {Object.entries(groupedInsights).map(([type, insights]) => (
            <div key={type}>
              <h4 className="text-sm font-medium text-gray-700 mb-2 capitalize">
                {type.replace('_', ' ')} Tips
              </h4>
              
              <div className="space-y-2">
                {insights.slice(0, 3).map((insight, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium text-gray-900 text-sm">
                      {insight.title}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {insight.description}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="text-xs text-green-600 font-medium">
                        {insight.impact}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(insight.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-200 rounded-lg h-24"></div>
            ))}
          </div>
          <div className="bg-gray-200 rounded-lg h-64"></div>
          <div className="bg-gray-200 rounded-lg h-64"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shopping Insights</h1>
        
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as any)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 3 months</option>
          <option value="6m">Last 6 months</option>
        </select>
      </div>

      {renderSummaryCards()}
      {renderEfficiencyTrend()}
      {renderFrequentItems()}
      {renderLearningInsights()}

      {!dashboardData && (
        <div className="text-center py-12">
          <p className="text-gray-500">No data available for the selected time range.</p>
          <p className="text-sm text-gray-400 mt-2">
            Start submitting post-shopping feedback to see insights here!
          </p>
        </div>
      )}
    </div>
  );
}