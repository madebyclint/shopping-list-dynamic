'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Sidebar from './Sidebar';
import WeeklyMenus from './WeeklyMenus';
import ShoppingLists from './ShoppingLists';
import Ingredients from './Ingredients';
import Utilities from './Utilities';

type TabType = 'weeklyMenus' | 'shoppingLists' | 'ingredients' | 'utilities';

export default function HomePage() {
  const [currentTab, setCurrentTab] = useState<TabType>('shoppingLists');
  const searchParams = useSearchParams();

  // Handle URL parameters for automatic navigation to shopping lists
  useEffect(() => {
    const listId = searchParams.get('listId');
    if (listId) {
      setCurrentTab('shoppingLists');
    }
  }, [searchParams]);

  const renderContent = () => {
    const listId = searchParams.get('listId');

    switch (currentTab) {
      case 'weeklyMenus':
        return <WeeklyMenus />;
      case 'shoppingLists':
        return <ShoppingLists initialListId={listId ? parseInt(listId) : undefined} />;
      case 'ingredients':
        return <Ingredients />;
      case 'utilities':
        return <Utilities />;
      default:
        return <ShoppingLists initialListId={listId ? parseInt(listId) : undefined} />;
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