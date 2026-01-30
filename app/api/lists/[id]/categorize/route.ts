import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/database';
import { pool } from '@/lib/database';
import { mapToPreferredCategories, mapBackToAICategories } from '@/lib/utils';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

interface CategoryUpdate {
  itemId: number;
  newCategory: string;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await initializeDatabase();
    
    const { id } = await params;
    const listId = parseInt(id);
    if (isNaN(listId)) {
      return NextResponse.json(
        { error: 'Invalid list ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { mode } = body; // 'store' or 'ai'

    if (!mode || !['store', 'ai'].includes(mode)) {
      return NextResponse.json(
        { error: 'Mode must be either "store" or "ai"' },
        { status: 400 }
      );
    }

    // Get all items for this list
    const itemsResult = await pool.query(
      'SELECT id, name, category FROM grocery_items WHERE list_id = $1',
      [listId]
    );

    const items = itemsResult.rows;
    if (items.length === 0) {
      return NextResponse.json({ message: 'No items to update', updatedCount: 0 });
    }

    // Calculate new categories for all items
    const updates: CategoryUpdate[] = [];
    for (const item of items) {
      const newCategory = mode === 'store' 
        ? mapToPreferredCategories(item.category)
        : mapBackToAICategories(item.category, item.name);
      
      // Only include items that need updating
      if (newCategory !== item.category) {
        updates.push({
          itemId: item.id,
          newCategory
        });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: 'No items needed updating', updatedCount: 0 });
    }

    // Perform bulk update using CASE WHEN
    const caseStatements = updates.map((update, index) => 
      `WHEN id = $${index * 2 + 2} THEN $${index * 2 + 3}`
    ).join(' ');
    
    const updateIds = updates.map(u => u.itemId);
    const values = updates.flatMap(u => [u.itemId, u.newCategory]);
    
    const bulkUpdateQuery = `
      UPDATE grocery_items 
      SET category = CASE 
        ${caseStatements}
        ELSE category 
      END 
      WHERE list_id = $1 AND id IN (${updateIds.map((_, i) => `$${i * 2 + 2}`).join(', ')})
    `;

    await pool.query(bulkUpdateQuery, [listId, ...values]);

    return NextResponse.json({ 
      message: 'Categories updated successfully',
      updatedCount: updates.length,
      mode 
    });

  } catch (error) {
    console.error('Error bulk updating categories:', error);
    return NextResponse.json(
      { error: 'Failed to update categories' },
      { status: 500 }
    );
  }
}