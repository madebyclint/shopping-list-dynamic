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

  const handleDedupeItems = async () => {
    if (!listId) return;

    console.log('=== DEDUPE DEBUG ===');

    // Simple duplicate detection - clean up malformed JSON artifacts
    const duplicateGroups = new Map<string, GroceryItem[]>();

    items.forEach(item => {
      // Clean up malformed JSON artifacts in names
      let baseName = item.name.toLowerCase().trim();

      // Remove malformed JSON characters like "}  and {"
      baseName = baseName
        .replace(/^[{"]+/g, '')     // Remove {" at start
        .replace(/["}]+$/g, '')     // Remove "} at end
        .replace(/\s*\([^)]*\)/g, '') // Remove anything in parentheses
        .trim();

      console.log(`Original: "${item.name}" -> Base: "${baseName}"`);

      if (!duplicateGroups.has(baseName)) {
        duplicateGroups.set(baseName, []);
      }
      duplicateGroups.get(baseName)!.push(item);
    });

    console.log('Duplicate groups found:', duplicateGroups);

    const itemsToDelete: number[] = [];
    let duplicateCount = 0;

    // Find groups with duplicates
    duplicateGroups.forEach((group, baseName) => {
      if (group.length > 1) {
        console.log(`DUPLICATE GROUP for "${baseName}":`, group);

        // Check if any item has "ea" in the qty and others have proper units
        const eaItems = group.filter(item => {
          const qtyStr = item.qty.toLowerCase().trim();
          // Check for "ea" as unit or just a plain number (which defaults to ea)
          const hasEa = qtyStr.includes('ea') || /^\d+$/.test(qtyStr);
          console.log(`Item "${item.name}" qty "${item.qty}" has EA: ${hasEa}`);
          return hasEa;
        });

        const nonEaItems = group.filter(item => {
          const qtyStr = item.qty.toLowerCase().trim();
          return !(qtyStr.includes('ea') || /^\d+$/.test(qtyStr));
        });

        console.log(`EA items (${eaItems.length}):`, eaItems);
        console.log(`Non-EA items (${nonEaItems.length}):`, nonEaItems);

        if (eaItems.length > 0 && nonEaItems.length > 0) {
          console.log('Will remove EA items in favor of non-EA items');
          eaItems.forEach(item => {
            if (item.id) {
              itemsToDelete.push(item.id);
              duplicateCount++;
              console.log(`Marking for deletion: ${item.name} (ID: ${item.id})`);
            }
          });
        } else {
          console.log('All items have same unit type, removing extras');
          // Remove all but the first item
          for (let i = 1; i < group.length; i++) {
            if (group[i].id) {
              itemsToDelete.push(group[i].id);
              duplicateCount++;
              console.log(`Marking for deletion (duplicate): ${group[i].name} (ID: ${group[i].id})`);
            }
          }
        }
      }
    });

    console.log('Final items to delete:', itemsToDelete);
    console.log('=== END DEBUG ===');

    if (itemsToDelete.length === 0) {
      alert('No duplicates found to remove!');
      return;
    }

    if (confirm(`Remove ${duplicateCount} duplicate items?`)) {
      try {
        // Delete items from database
        for (const itemId of itemsToDelete) {
          await fetch('/api/items', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId }),
          });
        }

        // Update local state
        setItems(prevItems => prevItems.filter(item => !item.id || !itemsToDelete.includes(item.id)));

        alert(`Successfully removed ${duplicateCount} duplicate items!`);
      } catch (error) {
        console.error('Error removing duplicates:', error);
        alert('Error removing duplicates. Please try again.');
      }
    }
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
      {list.name.includes('Shopping for') && (
        <p className="smart-processing-note">
          🤖 AI enhanced: Smart units (eggs→doz), intelligent consolidation, variant detection, price estimation
          {listId && <span className="preserve-note"> • Your customizations are preserved</span>}
        </p>
      )}

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
              <button
                onClick={handleDedupeItems}
                className="dedupe-btn"
              >
                🔄 Remove Duplicates
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
        {Object.entries(itemsByCategory)
          .sort(([a], [b]) => a.localeCompare(b)) // Sort categories alphabetically
          .map(([category, { items: categoryItems }]) => {
            const categoryCost = calculateCategoryCost(categoryItems);
            // Sort items alphabetically within each category
            const sortedCategoryItems = [...categoryItems].sort((a, b) =>
              cleanIngredientDisplayName(a.name).localeCompare(cleanIngredientDisplayName(b.name))
            );

            return (
              <section key={category}>
                <h2>{category} (${categoryCost.toFixed(2)})</h2>
                <ul>
                  {sortedCategoryItems.map((item) => {
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