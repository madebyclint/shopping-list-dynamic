'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type TabType = 'weeklyMenus' | 'shoppingLists' | 'ingredients' | 'utilities';

interface SidebarProps {
  onTabChange: (tab: TabType) => void;
  currentTab: TabType;
}

export default function Sidebar({ onTabChange, currentTab }: SidebarProps) {
  const router = useRouter();

  const handleTabClick = (tab: TabType) => {
    // Update URL with section parameter
    const params = new URLSearchParams();
    params.set('section', tab);
    router.push(`/?${params.toString()}`);

    // Update the current tab
    onTabChange(tab);
  };

  const tabs = [
    { id: 'weeklyMenus' as TabType, label: 'Weekly Menus', icon: '📅' },
    { id: 'shoppingLists' as TabType, label: 'Shopping Lists', icon: '🛒' },
    { id: 'ingredients' as TabType, label: 'Ingredients', icon: '🥬' },
    { id: 'utilities' as TabType, label: 'Utilities', icon: '⚙️' },
  ];

  const handleAnalyticsClick = () => {
    router.push('/analytics');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Menu Manager</h2>
      </div>
      <nav className="sidebar-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`sidebar-tab ${currentTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}

        {/* Analytics Section */}
        <hr className="sidebar-separator" style={{ margin: '20px 0', borderColor: '#e0e0e0' }} />
        <button
          className="sidebar-tab analytics-tab"
          onClick={handleAnalyticsClick}
          style={{ borderLeft: '4px solid #4A90E2' }}
        >
          <span className="tab-icon">📊</span>
          <span className="tab-label">Analytics</span>
        </button>

        <button
          className="sidebar-tab pantry-tab"
          onClick={() => router.push('/pantry-suggestions')}
          style={{ borderLeft: '4px solid #10B981' }}
        >
          <span className="tab-icon">🤖</span>
          <span className="tab-label">Smart Pantry</span>
        </button>
      </nav>
    </div>
  );
}