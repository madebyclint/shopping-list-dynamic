import { sql } from '@vercel/postgres';

export interface GroceryItem {
  id?: number;
  name: string;
  qty: string;
  price: string;
  category: string;
  meal: string;
  is_purchased?: boolean;
  list_id: number;
  created_at?: Date;
}

export interface GroceryList {
  id?: number;
  name: string;
  raw_text: string;
  created_at?: Date;
}

export async function initializeDatabase() {
  try {
    // Create grocery_lists table
    await sql`
      CREATE TABLE IF NOT EXISTS grocery_lists (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        raw_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create grocery_items table
    await sql`
      CREATE TABLE IF NOT EXISTS grocery_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        qty VARCHAR(100) NOT NULL,
        price VARCHAR(50) NOT NULL,
        category VARCHAR(255) NOT NULL,
        meal VARCHAR(255) NOT NULL,
        is_purchased BOOLEAN DEFAULT FALSE,
        list_id INTEGER REFERENCES grocery_lists(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

export async function createGroceryList(name: string, rawText: string, items: Omit<GroceryItem, 'id' | 'list_id' | 'created_at'>[]): Promise<number> {
  try {
    // Create the list
    const listResult = await sql`
      INSERT INTO grocery_lists (name, raw_text)
      VALUES (${name}, ${rawText})
      RETURNING id
    `;
    
    const listId = listResult.rows[0].id;

    // Create the items
    for (const item of items) {
      await sql`
        INSERT INTO grocery_items (name, qty, price, category, meal, list_id)
        VALUES (${item.name}, ${item.qty}, ${item.price}, ${item.category}, ${item.meal}, ${listId})
      `;
    }

    return listId;
  } catch (error) {
    console.error('Error creating grocery list:', error);
    throw error;
  }
}

export async function getGroceryList(listId: number): Promise<{ list: GroceryList; items: GroceryItem[] } | null> {
  try {
    const listResult = await sql`
      SELECT * FROM grocery_lists WHERE id = ${listId}
    `;
    
    if (listResult.rows.length === 0) {
      return null;
    }

    const itemsResult = await sql`
      SELECT * FROM grocery_items WHERE list_id = ${listId}
      ORDER BY category, name
    `;

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
    await sql`
      UPDATE grocery_items 
      SET is_purchased = ${isPurchased}
      WHERE id = ${itemId}
    `;
  } catch (error) {
    console.error('Error updating item purchase status:', error);
    throw error;
  }
}

export async function getAllGroceryLists(): Promise<GroceryList[]> {
  try {
    const result = await sql`
      SELECT id, name, created_at FROM grocery_lists
      ORDER BY created_at DESC
    `;
    
    return result.rows as GroceryList[];
  } catch (error) {
    console.error('Error getting all grocery lists:', error);
    throw error;
  }
}