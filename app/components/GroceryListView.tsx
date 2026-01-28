'use client';

import { useState, useEffect } from 'react';
import { GroceryItem, GroceryList } from '@/lib/database';
import { groupItemsByCategory, calculateCategoryCost, calculateTotalCost, parseGroceryListText, formatQuantityWithUnit, cleanIngredientDisplayName } from '@/lib/utils';
import ItemEditor from './ItemEditor';
import IngredientSearch from './IngredientSearch';

interface GroceryListViewProps {
  listId: number | null;
  rawText?: string;
}

export default function GroceryListView({ listId, rawText }: GroceryListViewProps) {
  const [list, setList] = useState<GroceryList | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showBulkRecategorize, setShowBulkRecategorize] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');

  const CATEGORIES = [
    'Produce',
    'Protein',
    'Dairy',
    'Pantry',
    'Bakery',
    'Frozen',
    'Other'
  ];

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

  const handleEditItem = (updatedFields: Partial<GroceryItem>) => {
    if (!editingItem?.id || listId === null) return;

    fetch('/api/items', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: editingItem.id, ...updatedFields }),
    })
      .then(response => {
        if (response.ok) {
          setItems(prevItems =>
            prevItems.map(item =>
              item.id === editingItem.id ? { ...item, ...updatedFields } : item
            )
          );
          setEditingItem(null);
        }
      })
      .catch(console.error);
  };

  const handleDeleteItem = () => {
    if (!editingItem?.id || listId === null) return;

    fetch('/api/items', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: editingItem.id }),
    })
      .then(response => {
        if (response.ok) {
          setItems(prevItems => prevItems.filter(item => item.id !== editingItem.id));
          setEditingItem(null);
        }
      })
      .catch(console.error);
  };

  const handleAddItem = (ingredient: any) => {
    if (listId === null) return;

    const newItem = {
      listId,
      name: ingredient.name || ingredient,
      qty: '1',
      price: ingredient.avgPrice || '2.99',
      category: ingredient.category || 'Other',
      meal: '',
    };

    fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem),
    })
      .then(response => response.json())
      .then(data => {
        if (data.id) {
          const createdItem: GroceryItem = {
            id: data.id,
            ...newItem,
            is_purchased: false,
            list_id: listId,
          };
          setItems(prevItems => [...prevItems, createdItem]);
          setShowAddItem(false);
        }
      })
      .catch(console.error);
  };

  const handleBulkRecategorize = async () => {
    if (selectedItems.size === 0 || !bulkCategory || listId === null) return;

    try {
      const updatePromises = Array.from(selectedItems).map(itemId =>
        fetch('/api/items', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, category: bulkCategory }),
        })
      );

      await Promise.all(updatePromises);

      setItems(prevItems =>
        prevItems.map(item =>
          selectedItems.has(item.id!) ? { ...item, category: bulkCategory } : item
        )
      );

      setSelectedItems(new Set());
      setShowBulkRecategorize(false);
      setBulkCategory('');
    } catch (error) {
      console.error('Error bulk updating categories:', error);
    }
  };

  const handleSelectItem = (itemId: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item.id!).filter(id => id)));
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

      {/* Add Item Section */}
      {listId !== null && (
        <div className="add-item-section">
          {!showAddItem ? (
            <div className="action-buttons">
              <button
                onClick={() => setShowAddItem(true)}
                className="add-item-btn"
              >
                ➕ Add Item
              </button>
              <button
                onClick={() => setShowBulkRecategorize(true)}
                className="bulk-categorize-btn"
              >
                🏷️ Bulk Categorize
              </button>
            </div>
          ) : (
            <div>
              <h3>Add New Item</h3>
              <IngredientSearch
                onSelectIngredient={handleAddItem}
                placeholder="Search ingredients or type new item name..."
              />
              <button
                onClick={() => setShowAddItem(false)}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Recategorize Modal */}
      {showBulkRecategorize && (
        <div className="bulk-recategorize-modal">
          <div className="modal-content">
            <h3>Bulk Recategorize Items</h3>
            <p>Select items to recategorize, then choose a new category:</p>

            <div className="bulk-select-actions">
              <button onClick={handleSelectAll} className="select-all-btn">
                {selectedItems.size === items.length ? 'Deselect All' : 'Select All'}
              </button>
              <span>{selectedItems.size} item(s) selected</span>
            </div>

            <div className="category-selector">
              <label>
                New Category:
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                >
                  <option value="">Choose category...</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="modal-actions">
              <button
                onClick={handleBulkRecategorize}
                className="apply-btn"
                disabled={selectedItems.size === 0 || !bulkCategory}
              >
                Apply Changes
              </button>
              <button
                onClick={() => {
                  setShowBulkRecategorize(false);
                  setSelectedItems(new Set());
                  setBulkCategory('');
                }}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Editor */}
      {editingItem && (
        <ItemEditor
          item={editingItem}
          onSave={handleEditItem}
          onCancel={() => setEditingItem(null)}
          onDelete={handleDeleteItem}
        />
      )}

      <article>
        {Object.entries(itemsByCategory).map(([category, { items: categoryItems }]) => {
          const categoryCost = calculateCategoryCost(categoryItems);

          return (
            <section key={category}>
              <h2>{category} (${categoryCost.toFixed(2)})</h2>
              <ul>
                {categoryItems.map((item) => {
                  const itemId = `groceryItem-${category}-${item.name}`;
                  const cleanName = cleanIngredientDisplayName(item.name);
                  const formattedQty = formatQuantityWithUnit(item.qty);

                  return (
                    <li key={item.id || itemId} className={showBulkRecategorize ? 'bulk-select-mode' : ''}>
                      {showBulkRecategorize && item.id && (
                        <input
                          type="checkbox"
                          className="bulk-select-checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => handleSelectItem(item.id!)}
                        />
                      )}
                      <input
                        type="checkbox"
                        id={itemId}
                        checked={item.is_purchased || false}
                        onChange={(e) => item.id && handleItemToggle(item.id, e.target.checked)}
                        disabled={!item.id || showBulkRecategorize} // Disable for preview items or during bulk select
                      />
                      <label htmlFor={itemId}>
                        {cleanName} ({formattedQty} @ {item.price})
                        <span className="js-meal">for {item.meal}</span>
                      </label>
                      {item.id && listId !== null && !showBulkRecategorize && (
                        <div className="item-actions">
                          <button
                            onClick={() => setEditingItem(item)}
                            className="edit-item-btn"
                            title="Edit item"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
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