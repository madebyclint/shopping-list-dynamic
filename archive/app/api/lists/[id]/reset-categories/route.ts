import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/database';
import { pool } from '@/lib/database';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// Function to categorize based on item name using original AI logic
function categorizeByItemName(name: string): string {
  const lowerName = name.toLowerCase();
  
  // Produce
  if (/\b(apple|banana|orange|lemon|lime|onion|garlic|tomato|lettuce|spinach|carrot|celery|bell pepper|mushroom|broccoli|cauliflower|zucchini|cucumber|avocado|potato|sweet potato|herb|cilantro|parsley|basil|thyme|rosemary|ginger)s?\b/.test(lowerName)) {
    return 'Produce';
  }
  
  // Proteins
  if (/\b(chicken|beef|pork|fish|salmon|tuna|turkey|lamb|egg|tofu|beans?|lentils|chickpeas)s?\b/.test(lowerName)) {
    return 'Protein';
  }
  
  // Dairy
  if (/\b(milk|cheese|butter|yogurt|cream|sour cream)s?\b/.test(lowerName)) {
    return 'Dairy';
  }
  
  // Pantry/Dry Goods
  if (/\b(rice|pasta|flour|sugar|salt|pepper|olive oil|oil|vinegar|sauce|stock|broth|can|canned)s?\b/.test(lowerName)) {
    return 'Pantry';
  }
  
  // Bread/Bakery
  if (/\b(bread|tortilla|bagel|roll|bun)s?\b/.test(lowerName)) {
    return 'Bakery';
  }
  
  // Frozen
  if (/\b(frozen)\b/.test(lowerName)) {
    return 'Frozen';
  }
  
  return 'Other';
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

    // Get all items for this list
    const itemsResult = await pool.query(
      'SELECT id, name, category FROM grocery_items WHERE list_id = $1',
      [listId]
    );

    const items = itemsResult.rows;
    if (items.length === 0) {
      return NextResponse.json({ message: 'No items to update', updatedCount: 0 });
    }

    // Calculate new categories based on item names using original AI logic
    const updates = [];
    for (const item of items) {
      const newCategory = categorizeByItemName(item.name);
      
      // Include all items to ensure consistent categorization
      updates.push({
        itemId: item.id,
        newCategory
      });
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
      message: 'Categories reset to AI categorization successfully',
      updatedCount: updates.length
    });

  } catch (error) {
    console.error('Error resetting categories:', error);
    return NextResponse.json(
      { error: 'Failed to reset categories' },
      { status: 500 }
    );
  }
}