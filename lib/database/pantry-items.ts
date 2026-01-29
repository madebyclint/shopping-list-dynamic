import { pool, PantryItem } from './index';

export async function addPantryItems(planId: number, items: Omit<PantryItem, 'id' | 'plan_id' | 'created_at' | 'updated_at'>[], prompt?: string, tokensUsed?: number): Promise<void> {
  try {
    console.log('addPantryItems: Adding', items.length, 'items to plan', planId);
    
    for (const item of items) {
      await pool.query(
        'INSERT INTO pantry_items (plan_id, name, category, qty, estimated_price, added_via_prompt, prompt_tokens_used) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [planId, item.name, item.category, item.qty, item.estimated_price || 0, prompt || null, tokensUsed || 0]
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

export async function updatePantryItems(planId: number, items: Omit<PantryItem, 'id' | 'plan_id' | 'created_at' | 'updated_at'>[], prompt?: string, tokensUsed?: number): Promise<void> {
  try {
    console.log('updatePantryItems: Updating pantry items for plan', planId);
    
    // Delete existing pantry items for this plan
    await pool.query('DELETE FROM pantry_items WHERE plan_id = $1', [planId]);
    
    // Add new items
    await addPantryItems(planId, items, prompt, tokensUsed);
    
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

export async function getPantryAnalytics(startDate?: string, endDate?: string): Promise<any> {
  try {
    let query = `
      SELECT 
        COUNT(*) as total_items,
        COUNT(DISTINCT plan_id) as total_plans,
        SUM(estimated_price) as total_estimated_cost,
        AVG(estimated_price) as avg_item_cost,
        SUM(prompt_tokens_used) as total_tokens_used,
        category,
        COUNT(*) as category_count,
        DATE_TRUNC('week', created_at) as week,
        COUNT(*) as weekly_count
      FROM pantry_items 
      WHERE 1=1
    `;
    
    const params = [];
    if (startDate) {
      query += ` AND created_at >= $${params.length + 1}`;
      params.push(startDate);
    }
    
    if (endDate) {
      query += ` AND created_at <= $${params.length + 1}`;
      params.push(endDate);
    }
    
    query += ` GROUP BY category, DATE_TRUNC('week', created_at) ORDER BY week DESC, category`;
    
    const result = await pool.query(query, params);
    
    // Also get overall stats
    const overallQuery = `
      SELECT 
        COUNT(*) as total_items,
        COUNT(DISTINCT plan_id) as total_plans,
        SUM(estimated_price) as total_estimated_cost,
        AVG(estimated_price) as avg_item_cost,
        SUM(prompt_tokens_used) as total_tokens_used
      FROM pantry_items 
      WHERE 1=1 ${startDate ? `AND created_at >= '${startDate}'` : ''} ${endDate ? `AND created_at <= '${endDate}'` : ''}
    `;
    
    const overallResult = await pool.query(overallQuery);
    
    return {
      overall: overallResult.rows[0],
      breakdown: result.rows
    };
  } catch (error) {
    console.error('Error getting pantry analytics:', error);
    throw error;
  }
}