import { pool, GroceryItem, GroceryList } from './index';

export async function createGroceryList(name: string, rawText: string, items: Omit<GroceryItem, 'id' | 'list_id' | 'created_at'>[], mealPlanId?: number): Promise<number> {
  try {
    console.log('createGroceryList: Creating list with name:', name, 'mealPlanId:', mealPlanId, 'items count:', items.length);
    
    // Create the list with optional meal_plan_id and explicit timestamp
    const listResult = await pool.query(
      'INSERT INTO grocery_lists (name, raw_text, meal_plan_id, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, created_at',
      [name, rawText, mealPlanId || null]
    );
    
    const listId = listResult.rows[0].id;
    const createdAt = listResult.rows[0].created_at;
    console.log('createGroceryList: Created list with ID:', listId, 'at:', createdAt);

    // Create the items
    console.log('createGroceryList: Adding', items.length, 'items to list');
    
    if (items.length > 0) {
      // Build bulk insert query
      const values = [];
      const placeholders = [];
      let paramIndex = 1;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        values.push(
          item.name, 
          item.qty, 
          item.price, 
          item.category, 
          item.meal, 
          item.is_purchased || false, 
          item.is_skipped || false, 
          listId
        );
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`);
        paramIndex += 8;
      }
      
      const bulkInsertQuery = `
        INSERT INTO grocery_items (name, qty, price, category, meal, is_purchased, is_skipped, list_id) 
        VALUES ${placeholders.join(', ')}
      `;
      
      await pool.query(bulkInsertQuery, values);
      console.log(`createGroceryList: Successfully bulk inserted ${items.length} items`);
    }

    console.log('createGroceryList: Successfully created list and all items');
    return listId;
  } catch (error) {
    console.error('Error creating grocery list:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}

export async function getGroceryList(listId: number): Promise<{ list: GroceryList; items: GroceryItem[] } | null> {
  try {
    const listResult = await pool.query(
      'SELECT * FROM grocery_lists WHERE id = $1',
      [listId]
    );
    
    if (listResult.rows.length === 0) {
      return null;
    }

    const itemsResult = await pool.query(
      'SELECT * FROM grocery_items WHERE list_id = $1 ORDER BY category, name',
      [listId]
    );

    return {
      list: listResult.rows[0] as GroceryList,
      items: itemsResult.rows as GroceryItem[]
    };
  } catch (error) {
    console.error('Error getting grocery list:', error);
    throw error;
  }
}

export async function updateItemPurchaseStatus(itemId: number, isPurchased: boolean): Promise<void> {
  try {
    await pool.query(
      'UPDATE grocery_items SET is_purchased = $1 WHERE id = $2',
      [isPurchased, itemId]
    );
  } catch (error) {
    console.error('Error updating item purchase status:', error);
    throw error;
  }
}

export async function updateItemSkipStatus(itemId: number, isSkipped: boolean): Promise<void> {
  try {
    await pool.query(
      'UPDATE grocery_items SET is_skipped = $1 WHERE id = $2',
      [isSkipped, itemId]
    );
  } catch (error) {
    console.error('Error updating item skip status:', error);
    throw error;
  }
}

export async function getAllGroceryLists(): Promise<GroceryList[]> {
  try {
    const result = await pool.query(
      'SELECT id, name, created_at FROM grocery_lists ORDER BY created_at DESC'
    );
    
    return result.rows as GroceryList[];
  } catch (error) {
    console.error('Error getting all grocery lists:', error);
    throw error;
  }
}

export async function updateGroceryItem(itemId: number, updates: Partial<GroceryItem>): Promise<void> {
  try {
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'list_id' && key !== 'created_at')
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'list_id' && key !== 'created_at')
      .map(key => updates[key as keyof GroceryItem]);

    await pool.query(
      `UPDATE grocery_items SET ${setClause} WHERE id = $1`,
      [itemId, ...values]
    );
  } catch (error) {
    console.error('Error updating grocery item:', error);
    throw error;
  }
}

export async function addItemToList(listId: number, item: Omit<GroceryItem, 'id' | 'list_id' | 'created_at'>): Promise<number> {
  try {
    const result = await pool.query(
      'INSERT INTO grocery_items (name, qty, price, category, meal, is_purchased, is_skipped, list_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [item.name, item.qty, item.price, item.category, item.meal, item.is_purchased || false, item.is_skipped || false, listId]
    );
    
    return result.rows[0].id;
  } catch (error) {
    console.error('Error adding item to list:', error);
    throw error;
  }
}

export async function deleteItemFromList(itemId: number): Promise<void> {
  try {
    await pool.query(
      'DELETE FROM grocery_items WHERE id = $1',
      [itemId]
    );
  } catch (error) {
    console.error('Error deleting item from list:', error);
    throw error;
  }
}

export async function searchIngredients(searchTerm: string, limit: number = 20): Promise<{ name: string; category: string; count: number }[]> {
  try {
    // Search for ingredients from previous shopping lists, grouped by name and category
    const result = await pool.query(
      `SELECT 
        LOWER(TRIM(name)) as name,
        category,
        COUNT(*) as count,
        AVG(CAST(NULLIF(price, '') AS DECIMAL)) as avg_price
       FROM grocery_items 
       WHERE LOWER(name) LIKE LOWER($1) 
       GROUP BY LOWER(TRIM(name)), category
       ORDER BY count DESC, name
       LIMIT $2`,
      [`%${searchTerm}%`, limit]
    );
    
    return result.rows.map(row => ({
      name: row.name,
      category: row.category,
      count: parseInt(row.count),
      avgPrice: row.avg_price ? parseFloat(row.avg_price).toFixed(2) : '2.99'
    }));
  } catch (error) {
    console.error('Error searching ingredients:', error);
    throw error;
  }
}

// Find existing shopping list for a meal plan
export async function findExistingListForMealPlan(mealPlanId: number): Promise<{ list: GroceryList; items: GroceryItem[] } | null> {
  try {
    const listResult = await pool.query(
      'SELECT * FROM grocery_lists WHERE meal_plan_id = $1 ORDER BY created_at DESC LIMIT 1',
      [mealPlanId]
    );
    
    if (listResult.rows.length === 0) {
      return null;
    }

    const listId = listResult.rows[0].id;
    const itemsResult = await pool.query(
      'SELECT * FROM grocery_items WHERE list_id = $1 ORDER BY category, name',
      [listId]
    );

    return {
      list: listResult.rows[0] as GroceryList,
      items: itemsResult.rows as GroceryItem[]
    };
  } catch (error) {
    console.error('Error finding existing list for meal plan:', error);
    return null;
  }
}

// Update existing shopping list while preserving user customizations
export async function updateExistingList(
  listId: number, 
  newItems: Omit<GroceryItem, 'id' | 'list_id' | 'created_at'>[], 
  existingItems: GroceryItem[]
): Promise<{ preserved: number; added: number; updated: number }> {
  try {
    let preserved = 0;
    let added = 0;
    let updated = 0;

    // Create a map of existing items by normalized name
    const existingItemsMap = new Map();
    existingItems.forEach(item => {
      const key = item.name.toLowerCase().trim();
      existingItemsMap.set(key, item);
    });

    // Track which existing items we've seen
    const processedExistingItems = new Set();

    for (const newItem of newItems) {
      const key = newItem.name.toLowerCase().trim();
      const existingItem = existingItemsMap.get(key);

      if (existingItem) {
        // Item exists - preserve user customizations but update meal info
        processedExistingItems.add(key);
        
        // Only update if the meal information has changed
        if (existingItem.meal !== newItem.meal) {
          await pool.query(
            'UPDATE grocery_items SET meal = $1 WHERE id = $2',
            [newItem.meal, existingItem.id]
          );
          updated++;
        } else {
          preserved++;
        }
      } else {
        // New item - add it
        await pool.query(
          'INSERT INTO grocery_items (name, qty, price, category, meal, list_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [newItem.name, newItem.qty, newItem.price, newItem.category, newItem.meal, listId]
        );
        added++;
      }
    }

    // Count preserved items (existing items that weren't in the new meal plan)
    const totalPreserved = existingItems.length - processedExistingItems.size + preserved;

    return { preserved: totalPreserved, added, updated };
  } catch (error) {
    console.error('Error updating existing list:', error);
    throw error;
  }
}
// Delete all items from a grocery list
export async function deleteGroceryListItems(listId: number): Promise<void> {
  try {
    await pool.query('DELETE FROM grocery_items WHERE list_id = $1', [listId]);
  } catch (error) {
    console.error('Error deleting grocery list items:', error);
    throw error;
  }
}

// Add items to an existing grocery list
export async function addItemsToGroceryList(
  listId: number,
  items: Omit<GroceryItem, 'id' | 'list_id' | 'created_at'>[]
): Promise<void> {
  try {
    for (const item of items) {
      await pool.query(
        'INSERT INTO grocery_items (list_id, name, qty, price, category, meal, is_purchased) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [listId, item.name, item.qty, item.price, item.category, item.meal, false]
      );
    }
  } catch (error) {
    console.error('Error adding items to grocery list:', error);
    throw error;
  }
}