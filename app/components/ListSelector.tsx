'use client';

import { useState, useEffect, useRef } from 'react';
import { GroceryList } from '@/lib/database';

interface ListSelectorProps {
  currentListId: number | null;
  onListSelect: (listId: number | null) => void;
}

export default function ListSelector({ currentListId, onListSelect }: ListSelectorProps) {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchLists();
      fetchedRef.current = true;
    }
  }, []);

  // Refresh lists when currentListId changes to a new value not in our current list
  useEffect(() => {
    if (currentListId && fetchedRef.current && lists.length > 0 && !lists.find(list => list.id === currentListId)) {
      console.log('ListSelector: Refreshing lists because currentListId not found:', currentListId);
      fetchLists();
    }
  }, [currentListId]); // Removed 'lists' from dependencies

  const fetchLists = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('ListSelector: Fetching lists...');
      const response = await fetch('/api/lists');
      if (response.ok) {
        const data = await response.json();
        console.log('ListSelector: Received lists:', data);
        setLists(Array.isArray(data) ? data : []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(`Failed to fetch lists: ${errorData.error || response.statusText}`);
        console.error('Failed to fetch lists:', errorData);
      }
    } catch (error) {
      setError('Unable to connect to server. Please check your connection.');
      console.error('Error fetching lists:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading lists...</div>;
  }

  if (error) {
    return (
      <div>
        <div style={{ color: 'red', fontSize: '14px', marginBottom: '10px' }}>
          {error}
        </div>
        <button onClick={fetchLists} style={{ padding: '4px 8px', fontSize: '12px' }}>
          Retry
        </button>
      </div>
    );
  }

  if (lists.length === 0) {
    return null;
  }

  // Sort lists by created_at (most recent first) and add numbering for duplicates
  const sortedLists = [...lists].sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateB - dateA; // Most recent first
  });

  // Group by base name and add numbering for duplicates
  const nameCounters = new Map<string, number>();
  const listsWithNumbers = sortedLists.map(list => {
    const baseName = list.name;
    const count = nameCounters.get(baseName) || 0;
    nameCounters.set(baseName, count + 1);

    const displayName = count > 0
      ? `${baseName} (${count + 1})`
      : baseName;

    return {
      ...list,
      displayName
    };
  });

  return (
    <div className="list-selector">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3>Saved Lists</h3>
        <button
          onClick={fetchLists}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            background: '#f0f0f0',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Refresh list"
        >
          🔄
        </button>
      </div>
      <select
        value={currentListId || ''}
        onChange={(e) => onListSelect(e.target.value ? parseInt(e.target.value) : null)}
      >
        <option value="">Select a list...</option>
        {listsWithNumbers.map((list) => {
          const createdAt = list.created_at ? new Date(list.created_at) : null;
          const timestamp = createdAt
            ? createdAt.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })
            : '';

          return (
            <option key={list.id} value={list.id}>
              {list.displayName} {timestamp && `- ${timestamp}`}
            </option>
          );
        })}
      </select>
    </div>
  );
}