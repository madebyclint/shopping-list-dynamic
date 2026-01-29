import { pool, PantryItem } from './index';

export async function addPantryItems(planId: number, items: Omit<PantryItem, 'id' | 'plan_id' | 'created_at'>[]): Promise<void> {
  try {
    console.log('addPantryItems: Adding', items.length, 'items to plan', planId);
    
    for (const item of items) {
      await pool.query(
        'INSERT INTO pantry_items (plan_id, name, category, qty, estimated_price) VALUES ($1, $2, $3, $4, $5)',
        [planId, item.name, item.category, item.qty, item.estimated_price || 0]
      );
    }
    
    console.log('addPantryItems: Successfully added all items');
  } catch (error) {
    console.error('Error adding pantry items:', error);
    throw error;
  }
}

export async function getPantryItems(planId: number): Promise<PantryItem[]> {
  try {
    const result = await pool.query(
      'SELECT * FROM pantry_items WHERE plan_id = $1 ORDER BY category, name',
      [planId]
    );
    
    return result.rows as PantryItem[];
  } catch (error) {
    console.error('Error getting pantry items:', error);
    throw error;
  }
}

export async function updatePantryItems(planId: number, items: Omit<PantryItem, 'id' | 'plan_id' | 'created_at'>[]): Promise<void> {
  try {
    console.log('updatePantryItems: Updating pantry items for plan', planId);
    
    // Delete existing pantry items for this plan
    await pool.query('DELETE FROM pantry_items WHERE plan_id = $1', [planId]);
    
    // Add new items
    await addPantryItems(planId, items);
    
    console.log('updatePantryItems: Successfully updated pantry items');
  } catch (error) {
    console.error('Error updating pantry items:', error);
    throw error;
  }
}

export async function deletePantryItem(itemId: number): Promise<void> {
  try {
    await pool.query('DELETE FROM pantry_items WHERE id = $1', [itemId]);
  } catch (error) {
    console.error('Error deleting pantry item:', error);
    throw error;
  }
}

export async function clearPantryItems(planId: number): Promise<void> {
  try {
    await pool.query('DELETE FROM pantry_items WHERE plan_id = $1', [planId]);
    console.log('clearPantryItems: Cleared all pantry items for plan', planId);
  } catch (error) {
    console.error('Error clearing pantry items:', error);
    throw error;
  }
}