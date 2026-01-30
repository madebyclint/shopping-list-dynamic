'use client';

import { useState, useEffect } from 'react';
import { GroceryItem, GroceryList } from '@/lib/database';
import { groupItemsByCategory, calculateCategoryCost, calculateTotalCost, parseGroceryListText, formatQuantityWithUnit, cleanIngredientDisplayName, toTitleCase, mapToPreferredCategories, mapBackToAICategories } from '@/lib/utils';
import ItemEditor from './ItemEditor';
import IngredientSearch from './IngredientSearch';
import ProgressOverlay from './ProgressOverlay';

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
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [auditResults, setAuditResults] = useState<{
    missingIngredients: string[];
    missingPantryItems: string[];
    mealPlanName?: string;
  } | null>(null);
  const [showAuditResults, setShowAuditResults] = useState(false);
  const [isStoreLayoutMode, setIsStoreLayoutMode] = useState(false);

  const CATEGORIES = [
    'Bakery/Deli',
    'Refrigerated',
    'Frozen',
    'Produce',
    'Aisles',
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

  const handleItemSkipToggle = async (itemId: number, isSkipped: boolean) => {
    if (listId === null) return; // Can't update preview items

    try {
      const response = await fetch('/api/items', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId, isSkipped }),
      });

      if (response.ok) {
        setItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId ? { ...item, is_skipped: isSkipped } : item
          )
        );
      } else {
        console.error('Failed to update item skip status');
      }
    } catch (error) {
      console.error('Error updating item skip status:', error);
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

  const handleClearAll = async () => {
    if (!listId) return;

    const userInput = prompt('This will delete ALL items in your shopping list. Type "all" to confirm:');
    if (userInput !== 'all') {
      return; // User cancelled or typed wrong confirmation
    }

    setProgressVisible(true);
    setProgressMessage('Clearing all items...');

    try {
      // Delete all items from database
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setProgressMessage(`Deleting item ${i + 1} of ${items.length}...`);

        if (item.id) {
          await fetch('/api/items', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: item.id }),
          });
        }
      }

      // Clear local state
      setItems([]);
      setProgressMessage('All items cleared successfully!');

      // Short delay to show completion message
      setTimeout(() => {
        setProgressVisible(false);
      }, 1000);

    } catch (error) {
      console.error('Error clearing all items:', error);
      setProgressVisible(false);
      alert('Error clearing items. Please try again.');
    }
  };
  const handleToggleCategorization = async () => {
    if (!listId) return;

    const targetMode = !isStoreLayoutMode;
    const modeLabel = targetMode ? 'store layout' : 'AI categories';
    const apiMode = targetMode ? 'store' : 'ai';

    setProgressVisible(true);
    setProgressMessage(`Switching to ${modeLabel}...`);

    try {
      // Use bulk update endpoint
      const response = await fetch(`/api/lists/${listId}/categorize`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: apiMode })
      });

      if (!response.ok) {
        throw new Error('Failed to update categories');
      }

      const result = await response.json();

      // Update local state with new categories
      const updatedItems = items.map(item => ({
        ...item,
        category: targetMode
          ? mapToPreferredCategories(item.category)
          : mapBackToAICategories(item.category, item.name)
      }));

      setItems(updatedItems);
      setIsStoreLayoutMode(targetMode);

      setProgressVisible(false);
      setProgressMessage('');

      console.log(`Updated ${result.updatedCount} items to ${modeLabel}`);

    } catch (error) {
      console.error('Error switching categorization:', error);
      setProgressVisible(false);
      setProgressMessage('');
      alert(`Failed to switch to ${modeLabel}. Please try again.`);
    }
  };

  const handleAuditList = async () => {
    if (!list?.meal_plan_id) {
      alert('This shopping list is not linked to a meal plan, so we cannot audit against it.');
      return;
    }

    setProgressVisible(true);
    setProgressMessage('Auditing shopping list against meal plan...');

    try {
      // Get meal plan data
      const mealPlanResponse = await fetch(`/api/meal-plans/${list.meal_plan_id}`);
      if (!mealPlanResponse.ok) {
        throw new Error('Failed to fetch meal plan');
      }
      const mealPlanData = await mealPlanResponse.json();

      // Get pantry items
      const pantryResponse = await fetch(`/api/pantry/${list.meal_plan_id}`);
      if (!pantryResponse.ok) {
        throw new Error('Failed to fetch pantry items');
      }
      const pantryData = await pantryResponse.json();

      // Extract all ingredients from meals
      const allMealIngredients = new Set<string>();
      mealPlanData.meals?.forEach((meal: any) => {
        if (meal.main_ingredients) {
          // Split by comma and clean up each ingredient
          meal.main_ingredients.split(',').forEach((ingredient: string) => {
            const clean = ingredient.trim().toLowerCase();
            if (clean && clean !== 'leftovers') {
              allMealIngredients.add(clean);
            }
          });
        }
      });

      // Extract all pantry items
      const allPantryItems = new Set<string>();
      pantryData.items?.forEach((item: any) => {
        if (item.name) {
          allPantryItems.add(item.name.trim().toLowerCase());
        }
      });

      // Get current shopping list items (normalize names)
      const currentItemNames = new Set<string>();
      items.forEach(item => {
        if (item.name) {
          currentItemNames.add(item.name.trim().toLowerCase());
        }
      });

      // Find missing ingredients from meals
      const missingIngredients: string[] = [];
      allMealIngredients.forEach(ingredient => {
        // Check if ingredient is in shopping list or if a similar item exists
        const isInList = Array.from(currentItemNames).some(listItem =>
          listItem.includes(ingredient) || ingredient.includes(listItem)
        );

        if (!isInList) {
          missingIngredients.push(ingredient);
        }
      });

      // Find missing pantry items
      const missingPantryItems: string[] = [];
      allPantryItems.forEach(pantryItem => {
        const isInList = Array.from(currentItemNames).some(listItem =>
          listItem.includes(pantryItem) || pantryItem.includes(listItem)
        );

        if (!isInList) {
          missingPantryItems.push(pantryItem);
        }
      });

      setAuditResults({
        missingIngredients,
        missingPantryItems,
        mealPlanName: mealPlanData.plan?.name
      });
      setShowAuditResults(true);

    } catch (error) {
      console.error('Error auditing list:', error);
      alert('Failed to audit the shopping list. Please try again.');
    } finally {
      setProgressVisible(false);
    }
  };
  const handleClearGenerated = async () => {
    if (!listId) return;

    // Find generated items (items with meal information)
    const generatedItems = items.filter(item => item.meal && item.meal.trim() !== '');
    const manualItems = items.filter(item => !item.meal || item.meal.trim() === '');

    if (generatedItems.length === 0) {
      alert('No generated items to clear. All items appear to be manually added.');
      return;
    }

    const confirmed = confirm(
      `Clear ${generatedItems.length} generated items? This will keep ${manualItems.length} manually added items.`
    );

    if (!confirmed) return;

    setProgressVisible(true);
    setProgressMessage('Clearing generated items...');

    try {
      // Delete generated items from database
      for (let i = 0; i < generatedItems.length; i++) {
        const item = generatedItems[i];
        setProgressMessage(`Deleting generated item ${i + 1} of ${generatedItems.length}...`);

        if (item.id) {
          await fetch('/api/items', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: item.id }),
          });
        }
      }

      // Update local state to keep only manual items
      setItems(manualItems);
      setProgressMessage('Generated items cleared successfully!');

      // Short delay to show completion message
      setTimeout(() => {
        setProgressVisible(false);
      }, 1000);

    } catch (error) {
      console.error('Error clearing generated items:', error);
      setProgressVisible(false);
    }
  };

  const addIngredientToList = (ingredient: any) => {
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
            is_skipped: false,
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
  const totalSkipped = calculateTotalCost(items.filter(item => item.is_skipped));
  const remainingBudget = totalEstimate - totalSpent;

  return (
    <div>
      <h1>{list.name}</h1>
      <div className="budget">
        <div className="budget-line">
          <span className="budget-estimated">${totalEstimate.toFixed(2)} estimated</span>
          {totalSpent > 0 && (
            <span className="budget-spent"> • ${totalSpent.toFixed(2)} bought</span>
          )}
          {totalSkipped > 0 && (
            <span className="budget-skipped"> • ${totalSkipped.toFixed(2)} skipped</span>
          )}
        </div>
        {(totalSpent > 0 || totalSkipped > 0) && (
          <div className="budget-summary">
            <span className="budget-remaining">${remainingBudget.toFixed(2)} remaining</span>
            {totalSkipped > 0 && (
              <span className="budget-savings"> (${totalSkipped.toFixed(2)} saved by skipping)</span>
            )}
          </div>
        )}
      </div>
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
              <button
                onClick={handleClearGenerated}
                className="clear-generated-btn"
              >
                🧹 Clear Generated
              </button>
              <button
                onClick={handleClearAll}
                className="clear-all-btn"
              >
                🗑️ Clear All
              </button>
              <button
                onClick={handleAuditList}
                className="audit-btn"
                title="Check against weekly menu for missing ingredients"
              >
                🔍 Audit List
              </button>
              <button
                onClick={handleToggleCategorization}
                className={`categorization-toggle-btn ${isStoreLayoutMode ? 'store-mode' : 'ai-mode'}`}
                title={isStoreLayoutMode ? 'Switch back to AI categorization' : 'Organize by store layout (Produce, Refrigerated, Bakery/Deli, etc.)'}
              >
                {isStoreLayoutMode ? '🤖 AI Categories' : '🏪 Store Layout'}
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
                <h2>{toTitleCase(category)} (${categoryCost.toFixed(2)})</h2>
                <ul>
                  {sortedCategoryItems.map((item) => {
                    const itemId = `groceryItem-${category}-${item.name}`;
                    const cleanName = cleanIngredientDisplayName(item.name);
                    const formattedQty = formatQuantityWithUnit(item.qty);

                    return (
                      <li
                        key={item.id || itemId}
                        className={`
                          ${showBulkRecategorize ? 'bulk-select-mode' : ''}
                          ${item.is_purchased ? 'purchased' : ''}
                          ${item.is_skipped ? 'skipped' : ''}
                        `.trim()}
                      >
                        {showBulkRecategorize && item.id && (
                          <input
                            type="checkbox"
                            className="bulk-select-checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={() => handleSelectItem(item.id!)}
                          />
                        )}
                        <div className="item-content">
                          <div className="item-checkboxes">
                            <input
                              type="checkbox"
                              id={itemId}
                              checked={item.is_purchased || false}
                              onChange={(e) => item.id && handleItemToggle(item.id, e.target.checked)}
                              disabled={!item.id || showBulkRecategorize || item.is_skipped} // Disable for preview items, bulk select, or skipped items
                              title="Mark as purchased"
                            />
                            <button
                              onClick={() => item.id && handleItemSkipToggle(item.id, !item.is_skipped)}
                              disabled={!item.id || showBulkRecategorize || item.is_purchased}
                              className={`skip-btn ${item.is_skipped ? 'skipped' : ''}`}
                              title={item.is_skipped ? "Unskip - add back to list" : "Skip - already have this"}
                            >
                              {item.is_skipped ? '↩️' : '⏭️'}
                            </button>
                          </div>
                          <label htmlFor={itemId} className="item-label">
                            <span className="item-name">
                              {item.is_skipped && <span className="skip-indicator">[SKIPPED] </span>}
                              {cleanName}
                            </span>
                            <span className="item-details">
                              ({formattedQty} @ {item.price})
                              <span className="js-meal">for {item.meal}</span>
                            </span>
                          </label>
                        </div>
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

      {/* Audit Results Modal */}
      {showAuditResults && auditResults && (
        <div className="audit-modal">
          <div className="audit-modal-content">
            <div className="audit-header">
              <h3>🔍 Audit Results</h3>
              <p>Checked against meal plan: <strong>{auditResults.mealPlanName || 'Unknown'}</strong></p>
              <button
                onClick={() => setShowAuditResults(false)}
                className="close-audit-btn"
              >
                ✕
              </button>
            </div>

            <div className="audit-results">
              {auditResults.missingIngredients.length > 0 && (
                <div className="missing-section">
                  <h4>🍽️ Missing Meal Ingredients ({auditResults.missingIngredients.length})</h4>
                  <div className="missing-items">
                    {auditResults.missingIngredients.map((ingredient, index) => (
                      <span key={index} className="missing-item">
                        {toTitleCase(ingredient)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {auditResults.missingPantryItems.length > 0 && (
                <div className="missing-section">
                  <h4>🥫 Missing Pantry Items ({auditResults.missingPantryItems.length})</h4>
                  <div className="missing-items">
                    {auditResults.missingPantryItems.map((item, index) => (
                      <span key={index} className="missing-item">
                        {toTitleCase(item)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {auditResults.missingIngredients.length === 0 && auditResults.missingPantryItems.length === 0 && (
                <div className="audit-success">
                  <h4>✅ Audit Complete</h4>
                  <p>Great! Your shopping list appears to cover all the ingredients from your meal plan and pantry items.</p>
                </div>
              )}
            </div>

            <div className="audit-actions">
              <button
                onClick={() => setShowAuditResults(false)}
                className="audit-close-btn"
              >
                Close
              </button>
              {(auditResults.missingIngredients.length > 0 || auditResults.missingPantryItems.length > 0) && (
                <button
                  onClick={() => {
                    // TODO: Could add functionality to bulk add missing items
                    alert('Bulk add missing items feature coming soon!');
                  }}
                  className="add-missing-btn"
                >
                  Add Missing Items
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Progress Overlay */}
      <ProgressOverlay
        isVisible={progressVisible}
        message={progressMessage}
      />
    </div>
  );
}