'use client';

import { useState, useEffect } from 'react';
import { GroceryList } from '@/lib/database';

interface ListSelectorProps {
  currentListId: number | null;
  onListSelect: (listId: number | null) => void;
}

export default function ListSelector({ currentListId, onListSelect }: ListSelectorProps) {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLists();
  }, []);

  const fetchLists = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/lists');
      if (response.ok) {
        const data = await response.json();
        setLists(data);
      } else {
        console.error('Failed to fetch lists');
      }
    } catch (error) {
      console.error('Error fetching lists:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading lists...</div>;
  }

  if (lists.length === 0) {
    return null;
  }

  return (
    <div className="list-selector">
      <h3>Saved Lists</h3>
      <select
        value={currentListId || ''}
        onChange={(e) => onListSelect(e.target.value ? parseInt(e.target.value) : null)}
      >
        <option value="">Select a list...</option>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name} {list.created_at && `(${new Date(list.created_at).toLocaleDateString()})`}
          </option>
        ))}
      </select>
    </div>
  );
}