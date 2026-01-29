'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import EditForm from './EditForm';
import GroceryListView from './GroceryListView';
import ListSelector from './ListSelector';

interface ShoppingListsProps {
  initialListId?: number;
}

export default function ShoppingLists({ initialListId }: ShoppingListsProps) {
  const searchParams = useSearchParams();
  const [isEditing, setIsEditing] = useState(false);
  const [currentListId, setCurrentListId] = useState<number | null>(initialListId || null);
  const [rawText, setRawText] = useState('');

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
    } else if (!initialListId) {
      setIsEditing(true);
    }
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
          key={`list-selector-${initialListId || 'default'}-${Date.now()}`}
          currentListId={currentListId}
          onListSelect={setCurrentListId}
        />

        <GroceryListView
          listId={currentListId}
          rawText={rawText}
        />
      </div>
    </div>
  );
}