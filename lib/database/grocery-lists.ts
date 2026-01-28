import { pool, GroceryItem, GroceryList } from './index';

export async function createGroceryList(name: string, rawText: string, items: Omit<GroceryItem, 'id' | 'list_id' | 'created_at'>[]): Promise<number> {
  try {
    // Create the list
    const listResult = await pool.query(
      'INSERT INTO grocery_lists (name, raw_text) VALUES ($1, $2) RETURNING id',
      [name, rawText]
    );
    
    const listId = listResult.rows[0].id;

    // Create the items
    for (const item of items) {
      await pool.query(
        'INSERT INTO grocery_items (name, qty, price, category, meal, list_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [item.name, item.qty, item.price, item.category, item.meal, listId]
      );
    }

    return listId;
  } catch (error) {
    console.error('Error creating grocery list:', error);
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
      'INSERT INTO grocery_items (name, qty, price, category, meal, list_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [item.name, item.qty, item.price, item.category, item.meal, listId]
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