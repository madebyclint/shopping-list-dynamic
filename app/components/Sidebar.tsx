'use client';

import { useState } from 'react';

type TabType = 'weeklyMenus' | 'shoppingLists' | 'ingredients' | 'utilities';

interface SidebarProps {
  onTabChange: (tab: TabType) => void;
  currentTab: TabType;
}

export default function Sidebar({ onTabChange, currentTab }: SidebarProps) {
  const tabs = [
    { id: 'weeklyMenus' as TabType, label: 'Weekly Menus', icon: '📅' },
    { id: 'shoppingLists' as TabType, label: 'Shopping Lists', icon: '🛒' },
    { id: 'ingredients' as TabType, label: 'Ingredients', icon: '🥬' },
    { id: 'utilities' as TabType, label: 'Utilities', icon: '⚙️' },
  ];

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
            onClick={() => onTabChange(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}