'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import WeeklyMenus from './WeeklyMenus';
import ShoppingLists from './ShoppingLists';
import Ingredients from './Ingredients';
import Utilities from './Utilities';

type TabType = 'weeklyMenus' | 'shoppingLists' | 'ingredients' | 'utilities';

export default function HomePage() {
  const [currentTab, setCurrentTab] = useState<TabType>('shoppingLists');

  const renderContent = () => {
    switch (currentTab) {
      case 'weeklyMenus':
        return <WeeklyMenus />;
      case 'shoppingLists':
        return <ShoppingLists />;
      case 'ingredients':
        return <Ingredients />;
      case 'utilities':
        return <Utilities />;
      default:
        return <ShoppingLists />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
      />
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}