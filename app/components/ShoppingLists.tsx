'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import EditForm from './EditForm';
import GroceryListView from './GroceryListView';
import ListSelector from './ListSelector';
import { GroceryList } from '@/lib/database';

interface ShoppingListsProps {
  initialListId?: number;
}

export default function ShoppingLists({ initialListId }: ShoppingListsProps) {
  const searchParams = useSearchParams();
  const [isEditing, setIsEditing] = useState(false);
  const [currentListId, setCurrentListId] = useState<number | null>(initialListId || null);
  const [rawText, setRawText] = useState('');
  const [loadingMostRecent, setLoadingMostRecent] = useState(false);

  // Automatically load most recent list if no initial list is provided
  useEffect(() => {
    const loadMostRecentList = async () => {
      if (!initialListId && !searchParams.get('rawText') && !loadingMostRecent && !currentListId) {
        setLoadingMostRecent(true);
        try {
          const response = await fetch('/api/lists');
          if (response.ok) {
            const lists = await response.json();
            if (Array.isArray(lists) && lists.length > 0) {
              // Sort by created_at to get the most recent
              const sortedLists = lists.sort((a: GroceryList, b: GroceryList) => {
                const dateA = new Date(a.created_at || 0).getTime();
                const dateB = new Date(b.created_at || 0).getTime();
                return dateB - dateA; // Most recent first
              });

              const mostRecent = sortedLists[0];
              console.log('Auto-loading most recent shopping list:', mostRecent.name);
              setCurrentListId(mostRecent.id!);
              setIsEditing(false);
            }
          }
        } catch (error) {
          console.error('Error loading most recent list:', error);
        } finally {
          setLoadingMostRecent(false);
        }
      }
    };

    loadMostRecentList();
  }, [initialListId, searchParams]); // Removed loadingMostRecent and currentListId from dependencies

  // Update currentListId when initialListId changes
  useEffect(() => {
    if (initialListId && initialListId !== currentListId) {
      setCurrentListId(initialListId);
      setIsEditing(false);
    }
  }, [initialListId]);

  useEffect(() => {
    const rawTextParam = searchParams.get('rawText');
    const listIdParam = searchParams.get('listId');

    if (rawTextParam) {
      setRawText(rawTextParam);
      setIsEditing(false);
    } else if (listIdParam) {
      const id = parseInt(listIdParam);
      if (!isNaN(id)) {
        setCurrentListId(id);
        setIsEditing(false);
      }
    }
    // DEPRECATED: No longer show edit form by default
    // The most recent list is auto-loaded instead for better UX
  }, [searchParams, initialListId]);

  const handleFormSubmit = async (name: string, text: string) => {
    try {
      const response = await fetch('/api/lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, rawText: text }),
      });

      if (response.ok) {
        const result = await response.json();
        setCurrentListId(result.id);
        setIsEditing(false);
        setRawText('');
      } else {
        console.error('Failed to create grocery list');
      }
    } catch (error) {
      console.error('Error creating grocery list:', error);
    }
  };

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };

  return (
    <div className="content-section">
      <div className="shopping-lists-header">
        <h1>Shopping Lists</h1>
        <button
          className="edit-button"
          onClick={handleEditToggle}
        >
          {isEditing ? 'Close' : 'New List'}
        </button>
      </div>

      <EditForm
        isVisible={isEditing}
        onSubmit={handleFormSubmit}
        initialText={rawText}
      />

      <div className="list-container">
        <ListSelector
          key={`list-selector-${initialListId || 'default'}`}
          currentListId={currentListId}
          onListSelect={setCurrentListId}
        />

        {loadingMostRecent ? (
          <div className="loading-container">
            <div>Loading most recent shopping list...</div>
          </div>
        ) : (
          <GroceryListView
            listId={currentListId}
            rawText={rawText}
          />
        )}
      </div>
    </div>
  );
}