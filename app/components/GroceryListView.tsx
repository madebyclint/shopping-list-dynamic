'use client';

import { useState, useEffect } from 'react';
import { GroceryItem, GroceryList } from '@/lib/database';
import { groupItemsByCategory, calculateCategoryCost, calculateTotalCost, parseGroceryListText } from '@/lib/utils';

interface GroceryListViewProps {
  listId: number | null;
  rawText?: string;
}

export default function GroceryListView({ listId, rawText }: GroceryListViewProps) {
  const [list, setList] = useState<GroceryList | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (listId) {
      fetchList(listId);
    } else if (rawText) {
      // Parse raw text for preview
      const parsedItems = parseGroceryListText(rawText);
      const mockItems: GroceryItem[] = parsedItems.map((item, index) => ({
        id: index,
        ...item,
        is_purchased: false,
        list_id: 0,
      }));
      setItems(mockItems);
      setList({ id: 0, name: 'Preview', raw_text: rawText });
    }
  }, [listId, rawText]);

  const fetchList = async (id: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/lists/${id}`);
      if (response.ok) {
        const data = await response.json();
        setList(data.list);
        setItems(data.items);
      } else {
        console.error('Failed to fetch list');
      }
    } catch (error) {
      console.error('Error fetching list:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleItemToggle = async (itemId: number, isPurchased: boolean) => {
    if (listId === null) return; // Can't update preview items

    try {
      const response = await fetch('/api/items', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId, isPurchased }),
      });

      if (response.ok) {
        setItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId ? { ...item, is_purchased: isPurchased } : item
          )
        );
      } else {
        console.error('Failed to update item');
      }
    } catch (error) {
      console.error('Error updating item:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!list) {
    return (
      <div>
        <h1>Grocery List</h1>
        <p>Select a list or create a new one to get started.</p>
      </div>
    );
  }

  const itemsByCategory = groupItemsByCategory(items);
  const totalEstimate = calculateTotalCost(items);
  const totalSpent = calculateTotalCost(items.filter(item => item.is_purchased));

  return (
    <div>
      <h1>{list.name}</h1>
      <p className="budget">
        <span>${totalEstimate.toFixed(2)} estimated</span>
        {totalSpent > 0 && (
          <span> - ${totalSpent.toFixed(2)} spent = ${(totalEstimate - totalSpent).toFixed(2)} remaining</span>
        )}
      </p>

      <article>
        {Object.entries(itemsByCategory).map(([category, { items: categoryItems }]) => {
          const categoryCost = calculateCategoryCost(categoryItems);

          return (
            <section key={category}>
              <h2>{category} (${categoryCost.toFixed(2)})</h2>
              <ul>
                {categoryItems.map((item) => {
                  const itemId = `groceryItem-${category}-${item.name}`;

                  return (
                    <li key={item.id || itemId}>
                      <input
                        type="checkbox"
                        id={itemId}
                        checked={item.is_purchased || false}
                        onChange={(e) => item.id && handleItemToggle(item.id, e.target.checked)}
                        disabled={!item.id} // Disable for preview items
                      />
                      <label htmlFor={itemId}>
                        {item.name} ({item.qty} @ {item.price})
                        <span className="js-meal">for {item.meal}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </article>
    </div>
  );
}